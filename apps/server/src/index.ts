import express from 'express';
import { createServer } from 'http';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { scenesRouter, roomScenesSubRouter, tokensRouter } from './routes/scenes.js';
import { buildAiRouter } from './routes/ai.js';
import { buildAssetsRouter } from './routes/assets.js';
import { buildTurnRouter } from './routes/turn.js';
import { buildInitiativeRouter } from './routes/initiative.js';
import { buildHandoutsRouter } from './routes/handouts.js';
import { buildNotesRouter } from './routes/notes.js';
import { buildCharactersRouter } from './routes/characters.js';
import { buildAudioRouter } from './routes/audio.js';
import { buildAudioBroadcaster } from './socketio/handlers/audio.js';
import { buildAnnotationBroadcaster } from './socketio/handlers/annotation.js';
import { buildDrawBroadcaster } from './socketio/handlers/draw.js';
import { AnnotationService } from './services/AnnotationService.js';
import { DrawService } from './services/DrawService.js';
import { SceneAnnotationService } from './services/SceneAnnotationService.js';
import { buildAnnotationsRouter } from './routes/scenes.js';
import { AudioService } from './services/AudioService.js';
import { AudioTrackRepository } from './repositories/AudioTrackRepository.js';
import { TurnConfigProvider } from './services/TurnConfigProvider.js';
import { prisma } from './lib/prisma.js';
import { buildSocketIo } from './socketio/index.js';
import { SceneService } from './services/SceneService.js';
import { DiceService } from './services/DiceService.js';
import { ChatService } from './services/ChatService.js';
import { SessionResyncService } from './services/SessionResyncService.js';
import { InitiativeService } from './services/InitiativeService.js';
import { HandoutService } from './services/HandoutService.js';
import { NoteService } from './services/NoteService.js';
import { CharacterService } from './services/CharacterService.js';
import { AIService } from './services/AIService.js';
import { AssistantService } from './services/AssistantService.js';
import { AssetService } from './services/AssetService.js';
import { SceneRepository } from './repositories/SceneRepository.js';
import { TokenRepository } from './repositories/TokenRepository.js';
import { ChatMessageRepository } from './repositories/ChatMessageRepository.js';
import { InitiativeRepository } from './repositories/InitiativeRepository.js';
import { RoomRepository } from './repositories/RoomRepository.js';
import { AssetRepository } from './repositories/AssetRepository.js';
import { HandoutRepository } from './repositories/HandoutRepository.js';
import { NoteRepository } from './repositories/NoteRepository.js';
import { CharacterRepository } from './repositories/CharacterRepository.js';
import { GeminiProvider } from './infrastructure/ai/GeminiProvider.js';
import { GcsFileStorageAdapter } from './infrastructure/storage/GcsFileStorageAdapter.js';
import type { FileStorageAdapter } from './infrastructure/storage/FileStorageAdapter.js';

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
app.use('/tokens', tokensRouter);

// ---------- Repositories (shared across verticals) ----------
const sceneRepo = new SceneRepository(prisma);
const tokenRepo = new TokenRepository(prisma);
const chatRepo = new ChatMessageRepository(prisma);
const initiativeRepo = new InitiativeRepository(prisma);
const roomRepo = new RoomRepository(prisma);
const assetRepo = new AssetRepository(prisma);
const handoutRepo = new HandoutRepository(prisma);
const noteRepo = new NoteRepository(prisma);
const characterRepo = new CharacterRepository(prisma);
const audioRepo = new AudioTrackRepository(prisma);

// ---------- AI + Storage wiring (vertical 3, §2.13.4) ----------
const gcpProjectId = process.env['GCP_PROJECT_ID'];
const gcpKeyJson = process.env['GCP_SERVICE_ACCOUNT_KEY'];
const gcpLocation = process.env['GCP_LOCATION'] ?? 'us-central1';
const gcsBucket = process.env['GCS_BUCKET'];

let fileStorage: FileStorageAdapter | null = null;
let assetService: AssetService | null = null;

if (gcpProjectId && gcpKeyJson && gcsBucket) {
  const aiProvider = new GeminiProvider({
    projectId: gcpProjectId,
    location: gcpLocation,
    serviceAccountKeyJson: gcpKeyJson,
  });
  fileStorage = new GcsFileStorageAdapter({
    projectId: gcpProjectId,
    bucketName: gcsBucket,
    serviceAccountKeyJson: gcpKeyJson,
  });
  assetService = new AssetService(aiProvider, fileStorage, assetRepo);
  const aiService = new AIService(aiProvider, assetService);
  const assistantService = new AssistantService(aiProvider);
  app.use('/ai', buildAiRouter(aiService, assistantService));
  app.use('/assets', buildAssetsRouter(assetService, prisma));
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[server] AI/Storage wiring skipped — GCP_PROJECT_ID / GCP_SERVICE_ACCOUNT_KEY / GCS_BUCKET not set; ' +
      'handouts.assetUrl will be undefined and character PDF upload will return 503',
  );
}

// ---------- WebRTC ICE config (vertical 4) ----------
const turnConfigProvider = new TurnConfigProvider({
  turnHost: process.env['TURN_HOST'],
  turnRealm: process.env['TURN_REALM'],
  staticAuthSecret: process.env['TURN_STATIC_AUTH_SECRET'],
});
app.use(buildTurnRouter(turnConfigProvider));

// ---------- Services (vertical 2 + Чат 7.1) ----------
const sceneService = new SceneService(sceneRepo, tokenRepo);
const diceService = new DiceService();
const chatService = new ChatService(chatRepo);
const resyncService = new SessionResyncService(sceneService, initiativeRepo, chatRepo);
const initiativeService = new InitiativeService(initiativeRepo, sceneRepo);
const handoutService = new HandoutService(handoutRepo, fileStorage);
const noteService = new NoteService(noteRepo);
const characterService = new CharacterService(characterRepo, fileStorage, assetService);

const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret) throw new Error('JWT_SECRET env var is required');

// Deferred broadcaster: captured after buildSocketIo returns.
let _annotationBroadcast: ReturnType<typeof buildAnnotationBroadcaster> = {
  ping: () => {},
  measure: () => {},
};
const annotationService = new AnnotationService({
  ping: (roomId, payload) => _annotationBroadcast.ping(roomId, payload),
  measure: (roomId, payload) => _annotationBroadcast.measure(roomId, payload),
});

// Deferred draw broadcaster (same pattern as annotation).
let _drawBroadcast: ReturnType<typeof buildDrawBroadcaster> = {
  stroke: () => {},
  clear: () => {},
};
const drawService = new DrawService(prisma, {
  stroke: (roomId, payload) => _drawBroadcast.stroke(roomId, payload),
  clear: (roomId, sceneId) => _drawBroadcast.clear(roomId, sceneId),
});

const io = buildSocketIo(httpServer, {
  sceneService,
  diceService,
  chatService,
  resyncService,
  initiativeService,
  annotationService,
  drawService,
  rooms: roomRepo,
  jwtSecret,
  corsOrigin: process.env['CLIENT_URL'] ?? 'http://localhost:5173',
});
_annotationBroadcast = buildAnnotationBroadcaster(io);
_drawBroadcast = buildDrawBroadcaster(io);

// SceneAnnotationService — wired after io is built so it can broadcast scene:updated.
const sceneAnnotationService = new SceneAnnotationService(prisma, drawService, (roomId, payload) => {
  io.to(roomId).emit('scene:updated', payload);
});
app.use(buildAnnotationsRouter(sceneAnnotationService));

// ---------- Чат 7.1 routers — wired AFTER io is built (initiative broadcasts) ----------
app.use(buildInitiativeRouter(initiativeService, roomRepo, io));
app.use(buildHandoutsRouter(handoutService, handoutRepo, roomRepo));
app.use(buildNotesRouter(noteService, roomRepo));
app.use(buildCharactersRouter(characterService, characterRepo, roomRepo));

// ---------- Чат 7.2 — audio (Ф6) — needs FileStorage; mounted only when GCS is wired ----------
let audioService: AudioService | null = null;
if (fileStorage) {
  audioService = new AudioService(
    audioRepo,
    assetRepo,
    fileStorage,
    roomRepo,
    sceneRepo,
    buildAudioBroadcaster(io),
  );
  app.use(buildAudioRouter(audioService));
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[server] Audio router skipped — file storage not configured; ' +
      'POST /audio and PATCH /audio/* will return 404',
  );
}

// Wire scene-activation hook so Ф6.4 (autoplay-on-scene-switch) fires from
// the existing REST endpoint without coupling SceneService to AudioService.
const sceneActivationListener = audioService;
if (sceneActivationListener) {
  sceneService.onSceneActivated = (roomId, sceneId) => {
    void sceneActivationListener.handleSceneSwitch(roomId, sceneId);
  };
}

const PORT = Number(process.env['PORT'] ?? 4000);
httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on port ${PORT}`);
});
