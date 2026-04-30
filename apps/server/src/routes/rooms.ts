import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { CreateRoomRequest, RoomDTO } from '@vtt/shared';
import type { Room } from '@prisma/client';
import { RoomService } from '../services/RoomService.js';
import { RoomRepository } from '../repositories/RoomRepository.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { HttpError } from '../lib/errors.js';

const roomService = new RoomService(new RoomRepository(prisma));

export const roomsRouter: IRouter = Router();

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
  } else {
    res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
  }
}

// members: [] — real-time presence is populated via socket.io in Chat 4
function toRoomDTO(room: Room): RoomDTO {
  return {
    id: room.id,
    name: room.name,
    gameSystem: room.gameSystem,
    status: room.status,
    ownerId: room.ownerId,
    members: [],
    createdAt: room.createdAt.toISOString(),
  };
}

roomsRouter.get('/', jwtAuth, async (req: Request, res: Response) => {
  try {
    const rooms = await roomService.listByOwner(req.user!.id);
    res.json(rooms.map(toRoomDTO));
  } catch (err) {
    handleError(err, res);
  }
});

roomsRouter.post(
  '/',
  jwtAuth,
  async (req: Request<object, object, CreateRoomRequest>, res: Response) => {
    try {
      const { name, gameSystem } = req.body;
      const room = await roomService.create(req.user!.id, name, gameSystem);
      res.status(201).json(toRoomDTO(room));
    } catch (err) {
      handleError(err, res);
    }
  },
);

roomsRouter.get('/:id', jwtAuth, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const room = await roomService.getById(req.params.id);
    res.json(toRoomDTO(room));
  } catch (err) {
    handleError(err, res);
  }
});

roomsRouter.post(
  '/:id/invites',
  jwtAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const tokens = await roomService.getInviteTokens(req.params.id, req.user!.id);
      res.json(tokens);
    } catch (err) {
      handleError(err, res);
    }
  },
);
