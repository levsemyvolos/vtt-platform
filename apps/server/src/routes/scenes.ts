import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  CreateSceneRequest,
  UpdateSceneRequest,
  SceneDTO,
  CreateTokenRequest,
  UpdateTokenRequest,
} from '@vtt/shared';
import { projectToken } from '../services/projections.js';
import { SceneService } from '../services/SceneService.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { TokenRepository } from '../repositories/TokenRepository.js';
import { RoomRepository } from '../repositories/RoomRepository.js';
import type { SceneAnnotationService } from '../services/SceneAnnotationService.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { sceneCreateSchema, sceneUpdateSchema } from '../schemas/scene.schema.js';
import { tokenCreateSchema, tokenUpdateSchema } from '../schemas/token.schema.js';
import { HttpError } from '../lib/errors.js';

const sceneService = new SceneService(
  new SceneRepository(prisma),
  new TokenRepository(prisma),
);
const roomRepo = new RoomRepository(prisma);

export const scenesRouter: IRouter = Router({ mergeParams: true });

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
  } else {
    console.error('[scenes] unhandled error:', err);
    res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
  }
}

async function assertOwner(roomId: string, userId: string): Promise<void> {
  const room = await roomRepo.findById(roomId);
  if (!room) throw new HttpError(404, 'Room not found');
  if (room.ownerId !== userId) {
    throw new HttpError(403, 'Only the GM (room owner) can manage scenes');
  }
}

function toSceneDTOFromEntity(scene: {
  id: string;
  roomId: string;
  name: string;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  gridVisible: boolean;
  isActive: boolean;
  isHidden: boolean;
  fogMaskBase64: string | null;
}): SceneDTO {
  return {
    id: scene.id,
    roomId: scene.roomId,
    name: scene.name,
    gridSize: scene.gridSize,
    gridWidth: scene.gridWidth,
    gridHeight: scene.gridHeight,
    gridVisible: scene.gridVisible,
    isActive: scene.isActive,
    isHidden: scene.isHidden,
    fogMaskBase64: scene.fogMaskBase64,
    tokens: [],
    annotations: { schemaVersion: 2, strokes: [], texts: [], images: [], objects: [] },
  };
}

// ---------- Room sub-router for scenes ----------

export const roomScenesSubRouter: IRouter = Router({ mergeParams: true });

// GET /rooms/:id/scenes — list scenes for a room
roomScenesSubRouter.get(
  '/',
  jwtAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const room = await prisma.room.findUnique({ where: { id: req.params.id } });
      if (!room) throw new HttpError(404, 'Room not found');
      const role = await roomRepo.getRoleInRoom(
        req.params.id,
        req.user!.id,
        req.user!.role,
        req.user!.boundRoomId,
      );
      if (!role) throw new HttpError(403, 'Not a room member');
      const scenes = await prisma.scene.findMany({
        where: { roomId: req.params.id },
        orderBy: { createdAt: 'asc' },
      });
      res.json(scenes.map(toSceneDTOFromEntity));
    } catch (err) {
      handleError(err, res);
    }
  },
);

roomScenesSubRouter.post(
  '/',
  jwtAuth,
  requireRole('GM', 'Player'),
  validate(sceneCreateSchema),
  async (
    req: Request<{ id: string }, object, CreateSceneRequest>,
    res: Response,
  ) => {
    try {
      await assertOwner(req.params.id, req.user!.id);
      const scene = await sceneService.createScene(req.params.id, req.body);
      res.status(201).json(toSceneDTOFromEntity(scene));
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ---------- Scenes router ----------

// PATCH /scenes/:sceneId
scenesRouter.patch(
  '/:sceneId',
  jwtAuth,
  requireRole('GM', 'Player'),
  validate(sceneUpdateSchema),
  async (
    req: Request<{ sceneId: string }, object, UpdateSceneRequest>,
    res: Response,
  ) => {
    try {
      const existing = await prisma.scene.findUnique({ where: { id: req.params.sceneId } });
      if (!existing) throw new HttpError(404, 'Scene not found');
      await assertOwner(existing.roomId, req.user!.id);
      await sceneService.updateScene(req.params.sceneId, req.body);
      // Return the full projected snapshot (incl. signed backgroundUrl + tokens
      // + annotations) so clients can `dispatch(hydrateScene(updated))` without
      // a fragile spread-merge that would drop fields not echoed by PATCH.
      const role = await roomRepo.getRoleInRoom(
        existing.roomId,
        req.user!.id,
        req.user!.role,
        req.user!.boundRoomId,
      );
      if (!role) throw new HttpError(403, 'Not a room member');
      const dto = await sceneService.getSnapshot(req.params.sceneId, role, req.user!.id);
      res.json(dto);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// POST /scenes/:sceneId/activate
scenesRouter.post(
  '/:sceneId/activate',
  jwtAuth,
  requireRole('GM', 'Player'),
  async (req: Request<{ sceneId: string }>, res: Response) => {
    try {
      const existing = await prisma.scene.findUnique({ where: { id: req.params.sceneId } });
      if (!existing) throw new HttpError(404, 'Scene not found');
      await assertOwner(existing.roomId, req.user!.id);
      await sceneService.setActiveScene(existing.roomId, req.params.sceneId);
      res.status(204).send();
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /scenes/:sceneId
scenesRouter.get(
  '/:sceneId',
  jwtAuth,
  async (req: Request<{ sceneId: string }>, res: Response) => {
    try {
      const scene = await prisma.scene.findUnique({ where: { id: req.params.sceneId } });
      if (!scene) throw new HttpError(404, 'Scene not found');
      const role = await roomRepo.getRoleInRoom(
        scene.roomId,
        req.user!.id,
        req.user!.role,
        req.user!.boundRoomId,
      );
      if (!role) throw new HttpError(403, 'Not a room member');
      const dto = await sceneService.getSnapshot(
        req.params.sceneId,
        role,
        req.user!.id,
      );
      res.json(dto);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// POST /scenes/:sceneId/tokens — GM creates a token on a scene
scenesRouter.post(
  '/:sceneId/tokens',
  jwtAuth,
  validate(tokenCreateSchema),
  async (
    req: Request<{ sceneId: string }, object, CreateTokenRequest>,
    res: Response,
  ) => {
    try {
      const existing = await prisma.scene.findUnique({ where: { id: req.params.sceneId } });
      if (!existing) throw new HttpError(404, 'Scene not found');
      await assertOwner(existing.roomId, req.user!.id);
      const token = await sceneService.createToken(req.params.sceneId, req.body);
      res.status(201).json(projectToken(token, 'GM', req.user!.id));
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ---------- Tokens router ----------

export const tokensRouter: IRouter = Router({ mergeParams: true });

// PATCH /tokens/:id — GM edits token metadata
tokensRouter.patch(
  '/:id',
  jwtAuth,
  validate(tokenUpdateSchema),
  async (req: Request<{ id: string }, object, UpdateTokenRequest>, res: Response) => {
    try {
      const token = await prisma.token.findUnique({ where: { id: req.params.id } });
      if (!token) throw new HttpError(404, 'Token not found');
      const scene = await prisma.scene.findUnique({ where: { id: token.sceneId } });
      if (!scene) throw new HttpError(404, 'Scene not found');
      const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
      if (role !== 'GM') throw new HttpError(403, 'Only GM can edit tokens');
      const updated = await sceneService.updateToken(req.params.id, req.body, role);
      res.json(projectToken(updated, 'GM', req.user!.id));
    } catch (err) {
      handleError(err, res);
    }
  },
);

// DELETE /tokens/:id — GM deletes a token
tokensRouter.delete(
  '/:id',
  jwtAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const token = await prisma.token.findUnique({ where: { id: req.params.id } });
      if (!token) throw new HttpError(404, 'Token not found');
      const scene = await prisma.scene.findUnique({ where: { id: token.sceneId } });
      if (!scene) throw new HttpError(404, 'Scene not found');
      const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
      if (role !== 'GM') throw new HttpError(403, 'Only GM can delete tokens');
      await sceneService.deleteToken(req.params.id, role);
      res.status(204).send();
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ---------- Annotation endpoints ----------

export function buildAnnotationsRouter(annotationService: SceneAnnotationService): IRouter {
  const router = Router({ mergeParams: true });

  // POST /scenes/:id/annotations/text — GM adds a text label
  router.post(
    '/scenes/:id/annotations/text',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
        if (!scene) throw new HttpError(404, 'Scene not found');
        const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
        if (role !== 'GM') throw new HttpError(403, 'GM-only');
        const { x, y, text, fontSize, color } = req.body as { x: number; y: number; text: string; fontSize?: number; color?: string };
        if (!text) throw new HttpError(400, 'text is required');
        const textPayload: { x: number; y: number; text: string; fontSize?: number; color?: string } = { x, y, text };
        if (fontSize !== undefined) textPayload.fontSize = fontSize;
        if (color !== undefined) textPayload.color = color;
        const annotations = await annotationService.addText(req.params.id, req.user!.id, textPayload);
        res.status(201).json(annotations);
      } catch (err) { handleError(err, res); }
    },
  );

  // POST /scenes/:id/annotations/image — GM adds an image overlay
  router.post(
    '/scenes/:id/annotations/image',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
        if (!scene) throw new HttpError(404, 'Scene not found');
        const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
        if (role !== 'GM') throw new HttpError(403, 'GM-only');
        const { x, y, assetId, width, height } = req.body as { x: number; y: number; assetId: string; width?: number; height?: number };
        if (!assetId) throw new HttpError(400, 'assetId is required');
        const imgPayload: { x: number; y: number; assetId: string; width?: number; height?: number } = { x, y, assetId };
        if (width !== undefined) imgPayload.width = width;
        if (height !== undefined) imgPayload.height = height;
        const annotations = await annotationService.addImage(req.params.id, req.user!.id, imgPayload);
        res.status(201).json(annotations);
      } catch (err) { handleError(err, res); }
    },
  );

  // PATCH /scenes/:id/annotations/:annId — move an annotation
  router.patch(
    '/scenes/:id/annotations/:annId',
    jwtAuth,
    async (req: Request<{ id: string; annId: string }>, res: Response) => {
      try {
        const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
        if (!scene) throw new HttpError(404, 'Scene not found');
        const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
        if (!role) throw new HttpError(403, 'Not a room member');
        const { x, y } = req.body as { x?: unknown; y?: unknown };
        if (typeof x !== 'number' || typeof y !== 'number') {
          throw new HttpError(400, 'x and y must be numbers');
        }
        const annotations = await annotationService.moveAnnotation(req.params.id, req.params.annId, req.user!.id, role, { x, y });
        res.json(annotations);
      } catch (err) { handleError(err, res); }
    },
  );

  // DELETE /scenes/:id/annotations/:annId — remove annotation
  router.delete(
    '/scenes/:id/annotations/:annId',
    jwtAuth,
    async (req: Request<{ id: string; annId: string }>, res: Response) => {
      try {
        const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
        if (!scene) throw new HttpError(404, 'Scene not found');
        const role = await roomRepo.getRoleInRoom(scene.roomId, req.user!.id, req.user!.role, req.user!.boundRoomId);
        if (!role) throw new HttpError(403, 'Not a room member');
        await annotationService.removeAnnotation(req.params.id, req.params.annId, req.user!.id, role);
        res.status(204).send();
      } catch (err) { handleError(err, res); }
    },
  );

  return router;
}
