import { randomBytes, randomUUID } from 'crypto';
import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  CreateRoomRequest,
  ObserverJoinRequest,
  ObserverJoinResponse,
  RoomDTO,
  RoomMemberDTO,
  RoomMembersResponse,
  UserPublic,
} from '@vtt/shared';
import type { Room } from '@prisma/client';
import { RoomService } from '../services/RoomService.js';
import { RoomRepository } from '../repositories/RoomRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { SessionRepository } from '../repositories/SessionRepository.js';
import { AuthService } from '../services/AuthService.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { HttpError } from '../lib/errors.js';

const roomService = new RoomService(new RoomRepository(prisma), prisma);
const userRepo = new UserRepository(prisma);
const authService = new AuthService(userRepo, new SessionRepository(prisma));

export const roomsRouter: IRouter = Router();

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
  } else {
    res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
  }
}

function toRoomDTO(room: Room, members: RoomMemberDTO[] = []): RoomDTO {
  return {
    id: room.id,
    name: room.name,
    gameSystem: room.gameSystem,
    status: room.status,
    ownerId: room.ownerId,
    members,
    createdAt: room.createdAt.toISOString(),
  };
}

roomsRouter.get('/', jwtAuth, async (req: Request, res: Response) => {
  try {
    const rawFilter = req.query['filter'] as string | undefined;
    const filter: 'owned' | 'invited' | 'all' =
      rawFilter === 'owned' || rawFilter === 'invited' ? rawFilter : 'all';
    const rooms = await roomService.listByUserAndRole(req.user!.id, filter);
    const dtos = await Promise.all(
      rooms.map(async (room) => {
        const members = await roomService.getMembersProjection(room.id);
        return toRoomDTO(room, members);
      }),
    );
    res.json(dtos);
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
      const members = await roomService.getMembersProjection(room.id);
      res.status(201).json(toRoomDTO(room, members));
    } catch (err) {
      handleError(err, res);
    }
  },
);

roomsRouter.get('/:id', jwtAuth, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const room = await roomService.getById(req.params.id);
    const members = await roomService.getMembersProjection(req.params.id);
    res.json(toRoomDTO(room, members));
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /rooms/join — Player joins a room via invite token.
 * Body: { token: string } (raw playerToken from invite URL)
 * Returns the resolved RoomDTO with members snapshot.
 */
roomsRouter.post(
  '/join',
  jwtAuth,
  async (req: Request<object, object, { token?: string }>, res: Response) => {
    try {
      const token = req.body.token?.trim();
      if (!token) throw new HttpError(400, 'Missing invite token');
      const room = await roomService.joinByInvite(token);
      const members = await roomService.getMembersProjection(room.id);
      res.json(toRoomDTO(room, members));
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /rooms/join-invite — anonymous Observer joins a room via invite code.
 * Body: ObserverJoinRequest = { inviteCode, name }.
 * Creates an anonymous User (passwordHash = '' sentinel — cannot login via /auth/login),
 * issues an Observer-role JWT pair, returns AuthTokenPair + roomId.
 *
 * NOTE: jwtAuth is intentionally NOT applied — observers have no prior account.
 */
roomsRouter.post(
  '/join-invite',
  async (req: Request<object, object, ObserverJoinRequest>, res: Response) => {
    try {
      const inviteCode = req.body.inviteCode?.trim();
      const rawName = req.body.name?.trim();
      if (!inviteCode || inviteCode.length !== 64) {
        throw new HttpError(400, 'Invalid invite code');
      }
      if (!rawName || rawName.length < 2) {
        throw new HttpError(400, 'Display name must be at least 2 characters');
      }
      const displayName = rawName.slice(0, 64);
      const room = await roomService.joinAsObserver(inviteCode);

      // Create anonymous user (passwordHash = '' blocks /auth/login by bcrypt mismatch).
      const anonymousEmail = `observer-${randomBytes(8).toString('hex')}@anon.local`;
      const user = await userRepo.create({
        id: randomUUID(),
        email: anonymousEmail,
        passwordHash: '',
        displayName,
      });
      const userPublic: UserPublic = {
        id: user.id,
        email: user.email,
        name: user.displayName,
      };
      const ua = String(req.headers['user-agent'] ?? '');
      const tokens = await authService.issueObserverTokens(userPublic, ua);
      const body: ObserverJoinResponse = { ...tokens, roomId: room.id };
      res.status(201).json(body);
    } catch (err) {
      handleError(err, res);
    }
  },
);

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

/**
 * GET /rooms/:id/members — R6 γ-variant membership resolution.
 *
 * gm      = room.owner
 * players = distinct Character.ownerId for this room (joined with User)
 * observers = [] (Ф7.2 does not grant Observer any campaign visibility)
 *
 * No RoomMember table — persistent membership tracking is R-Persistent-Membership.
 */
roomsRouter.get('/:id/members', jwtAuth, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const room = await roomService.getById(req.params.id);
    const characters = await prisma.character.findMany({
      where: { roomId: req.params.id },
      distinct: ['ownerId'],
      include: { owner: true },
    });
    const gm: UserPublic = {
      id: room.owner.id,
      email: room.owner.email,
      name: room.owner.displayName,
    };
    const players: UserPublic[] = characters.map((c) => ({
      id: c.owner.id,
      email: c.owner.email,
      name: c.owner.displayName,
    }));
    const body: RoomMembersResponse = { gm, players, observers: [] };
    res.json(body);
  } catch (err) {
    handleError(err, res);
  }
});
