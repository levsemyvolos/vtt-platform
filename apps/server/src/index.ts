import express from 'express';
import { createServer } from 'http';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { scenesRouter, roomScenesSubRouter } from './routes/scenes.js';
import { prisma } from './lib/prisma.js';
import { buildSocketIo } from './socketio/index.js';
import { SceneService } from './services/SceneService.js';
import { DiceService } from './services/DiceService.js';
import { ChatService } from './services/ChatService.js';
import { SessionResyncService } from './services/SessionResyncService.js';
import { SceneRepository } from './repositories/SceneRepository.js';
import { TokenRepository } from './repositories/TokenRepository.js';
import { ChatMessageRepository } from './repositories/ChatMessageRepository.js';
import { InitiativeRepository } from './repositories/InitiativeRepository.js';
import { RoomRepository } from './repositories/RoomRepository.js';

const app = express();
const httpServer = createServer(app);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
// Sub-route: POST /rooms/:id/scenes — must be mounted before catch-all rooms router order is irrelevant
app.use('/rooms/:id/scenes', roomScenesSubRouter);
app.use('/rooms', roomsRouter);
app.use('/scenes', scenesRouter);

// ---------- socket.io wiring (vertical 2) ----------
const sceneRepo = new SceneRepository(prisma);
const tokenRepo = new TokenRepository(prisma);
const chatRepo = new ChatMessageRepository(prisma);
const initiativeRepo = new InitiativeRepository(prisma);
const roomRepo = new RoomRepository(prisma);

const sceneService = new SceneService(sceneRepo, tokenRepo);
const diceService = new DiceService();
const chatService = new ChatService(chatRepo);
const resyncService = new SessionResyncService(sceneService, initiativeRepo, chatRepo);

const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret) throw new Error('JWT_SECRET env var is required');

buildSocketIo(httpServer, {
  sceneService,
  diceService,
  chatService,
  resyncService,
  rooms: roomRepo,
  jwtSecret,
  corsOrigin: process.env['CLIENT_URL'] ?? 'http://localhost:5173',
});

const PORT = Number(process.env['PORT'] ?? 4000);
httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on port ${PORT}`);
});
