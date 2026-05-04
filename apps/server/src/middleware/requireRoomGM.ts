import type { Request, Response, NextFunction } from 'express';
import type { RoomRepository } from '../repositories/RoomRepository.js';

export function requireRoomGM(roomRepo: RoomRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const roomId: unknown =
      (req.body as Record<string, unknown>)?.roomId ??
      req.query?.roomId ??
      req.params?.roomId;
    if (typeof roomId !== 'string') {
      res.status(400).json({ error: { code: 400, message: 'roomId required' } });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ error: { code: 401, message: 'Auth required' } });
      return;
    }
    const role = await roomRepo.getRoleInRoom(
      roomId,
      req.user.id,
      req.user.role,
      req.user.boundRoomId,
    );
    if (role !== 'GM') {
      res.status(403).json({ error: { code: 403, message: 'Only GM can use AI generation in this room' } });
      return;
    }
    next();
  };
}
