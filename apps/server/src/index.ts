import express from 'express';
import { createServer } from 'http';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { scenesRouter, roomScenesSubRouter } from './routes/scenes.js';
import { buildAiRouter } from './routes/ai.js';
import { buildAssetsRouter } from './routes/assets.js';
import { buildTurnRouter } from './routes/turn.js';
import { TurnConfigProvider } from './services/TurnConfigProvider.js';
import { prisma } from './lib/prisma.js';
import { buildSocketIo } from './socketio/index.js';
import { SceneService } from './services/SceneService.js';
import { DiceService } from './services/DiceService.js';
import { ChatService } from './services/ChatService.js';
import { SessionResyncService } from './services/SessionResyncService.js';
import { AIService } from './services/AIService.js';
import { AssetService } from './services/AssetService.js';
import { SceneRepository } from './repositories/SceneRepository.js';
import { TokenRepository } from './repositories/TokenRepository.js';
import { ChatMessageRepository } from './repositories/ChatMessageRepository.js';
import { InitiativeRepository } from './repositories/InitiativeRepository.js';
import { RoomRepository } from './repositories/RoomRepository.js';
import { AssetRepository } from './repositories/AssetRepository.js';
import { GeminiProvider } from './infrastructure/ai/GeminiProvider.js';
import { GcsFileStorageAdapter } from './infrastructure/storage/GcsFileStorageAdapter.js';

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

// ---------- AI + Storage wiring (vertical 3, §2.13.4) ----------
const gcpProjectId = process.env['GCP_PROJECT_ID'];
const gcpKeyJson = process.env['GCP_SERVICE_ACCOUNT_KEY'];
const gcpLocation = process.env['GCP_LOCATION'] ?? 'us-central1';
const gcsBucket = process.env['GCS_BUCKET'];

if (gcpProjectId && gcpKeyJson && gcsBucket) {
  const aiProvider = new GeminiProvider({
    projectId: gcpProjectId,
    location: gcpLocation,
    serviceAccountKeyJson: gcpKeyJson,
  });
  const fileStorage = new GcsFileStorageAdapter({
    projectId: gcpProjectId,
    bucketName: gcsBucket,
    serviceAccountKeyJson: gcpKeyJson,
  });
  const assetRepo = new AssetRepository(prisma);
  const assetService = new AssetService(aiProvider, fileStorage, assetRepo);
  const aiService = new AIService(aiProvider, assetService);
  app.use('/ai', buildAiRouter(aiService));
  app.use('/assets', buildAssetsRouter(assetService));
} else {
  // eslint-disable-next-line no-console
  console.warn('[server] AI/Storage wiring skipped — GCP_PROJECT_ID / GCP_SERVICE_ACCOUNT_KEY / GCS_BUCKET not set');
}

// ---------- WebRTC ICE config (vertical 4) ----------
const turnConfigProvider = new TurnConfigProvider({
  turnHost: process.env['TURN_HOST'],
  turnRealm: process.env['TURN_REALM'],
  staticAuthSecret: process.env['TURN_STATIC_AUTH_SECRET'],
});
app.use(buildTurnRouter(turnConfigProvider));

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
