import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  CreateSceneRequest,
  UpdateSceneRequest,
  SceneDTO,
} from '@vtt/shared';
import { SceneService } from '../services/SceneService.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { TokenRepository } from '../repositories/TokenRepository.js';
import { RoomRepository } from '../repositories/RoomRepository.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { requireRole } from '../middleware/rbac.js';
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
    isActive: scene.isActive,
    isHidden: scene.isHidden,
    fogMaskBase64: scene.fogMaskBase64,
    tokens: [],
  };
}

// POST /rooms/:id/scenes
export const roomScenesSubRouter: IRouter = Router({ mergeParams: true });
roomScenesSubRouter.post(
  '/',
  jwtAuth,
  requireRole('GM', 'Player'),
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

// PATCH /scenes/:sceneId
scenesRouter.patch(
  '/:sceneId',
  jwtAuth,
  requireRole('GM', 'Player'),
  async (
    req: Request<{ sceneId: string }, object, UpdateSceneRequest>,
    res: Response,
  ) => {
    try {
      const existing = await prisma.scene.findUnique({ where: { id: req.params.sceneId } });
      if (!existing) throw new HttpError(404, 'Scene not found');
      await assertOwner(existing.roomId, req.user!.id);
      const scene = await sceneService.updateScene(req.params.sceneId, req.body);
      res.json(toSceneDTOFromEntity(scene));
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

// GET /scenes/:sceneId — snapshot for the requesting viewer (RBAC-projected via A6)
scenesRouter.get(
  '/:sceneId',
  jwtAuth,
  async (req: Request<{ sceneId: string }>, res: Response) => {
    try {
      const dto = await sceneService.getSnapshot(
        req.params.sceneId,
        req.user!.role,
        req.user!.id,
      );
      res.json(dto);
    } catch (err) {
      handleError(err, res);
    }
  },
);
