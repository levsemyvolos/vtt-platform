import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { AudioService } from '../../src/services/AudioService.js';
import { AUDIO_MAX_BYTES, type AudioLayer } from '@vtt/shared';
import type { AudioPlayPayload } from '@vtt/shared';
import type {
  FileStorageAdapter,
  PresignedUploadResult,
} from '../../src/infrastructure/storage/FileStorageAdapter.js';
import type { AudioTrackRepository } from '../../src/repositories/AudioTrackRepository.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { RoomRepository } from '../../src/repositories/RoomRepository.js';
import type { SceneRepository } from '../../src/repositories/SceneRepository.js';
import type { AudioTrack, Asset, Room, Scene } from '@prisma/client';

interface StorageMocks {
  put: MockedFunction<FileStorageAdapter['put']>;
  getPresignedUrl: MockedFunction<FileStorageAdapter['getPresignedUrl']>;
  getPresignedUploadUrl: MockedFunction<FileStorageAdapter['getPresignedUploadUrl']>;
  statObject: MockedFunction<FileStorageAdapter['statObject']>;
  delete: MockedFunction<FileStorageAdapter['delete']>;
}

interface AudioRepoMocks {
  findById: MockedFunction<AudioTrackRepository['findById']>;
  listByRoom: MockedFunction<AudioTrackRepository['listByRoom']>;
  findActiveForScene: MockedFunction<AudioTrackRepository['findActiveForScene']>;
  findActiveTracksForScene: MockedFunction<AudioTrackRepository['findActiveTracksForScene']>;
  create: MockedFunction<AudioTrackRepository['create']>;
  update: MockedFunction<AudioTrackRepository['update']>;
  deleteById: MockedFunction<AudioTrackRepository['deleteById']>;
}

interface AssetRepoMocks {
  findById: MockedFunction<AssetRepository['findById']>;
  create: MockedFunction<AssetRepository['create']>;
  deleteById: MockedFunction<AssetRepository['deleteById']>;
}

interface RoomRepoMocks {
  findById: MockedFunction<RoomRepository['findById']>;
}

interface SceneRepoMocks {
  findById: MockedFunction<SceneRepository['findById']>;
}

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = '22222222-2222-2222-2222-222222222222';
const OUTSIDER_ID = '33333333-3333-3333-3333-333333333333';
const SCENE_ID = '44444444-4444-4444-4444-444444444444';

function makeStorage(): { storage: FileStorageAdapter; mocks: StorageMocks } {
  const mocks: StorageMocks = {
    put: vi.fn(),
    getPresignedUrl: vi.fn().mockResolvedValue('https://signed.example/playback?sig=abc'),
    getPresignedUploadUrl: vi.fn(),
    statObject: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { storage: mocks as unknown as FileStorageAdapter, mocks };
}

function makeAudioRepo(): { repo: AudioTrackRepository; mocks: AudioRepoMocks } {
  const mocks: AudioRepoMocks = {
    findById: vi.fn(),
    listByRoom: vi.fn(),
    findActiveForScene: vi.fn(),
    findActiveTracksForScene: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn().mockResolvedValue(undefined),
  };
  return { repo: mocks as unknown as AudioTrackRepository, mocks };
}

function makeAssetRepo(): { repo: AssetRepository; mocks: AssetRepoMocks } {
  const mocks: AssetRepoMocks = {
    findById: vi.fn(),
    create: vi.fn(),
    deleteById: vi.fn().mockResolvedValue(undefined),
  };
  return { repo: mocks as unknown as AssetRepository, mocks };
}

function makeRoomRepo(ownerId = OWNER_ID): { repo: RoomRepository; mocks: RoomRepoMocks } {
  const mocks: RoomRepoMocks = { findById: vi.fn() };
  mocks.findById.mockResolvedValue({
    id: ROOM_ID,
    ownerId,
    name: 'r',
    gameSystem: 'D&D 5e',
    status: 'active',
    inviteTokenPlayer: 'p',
    inviteTokenObserver: 'o',
    createdAt: new Date(),
  } satisfies Room);
  return { repo: mocks as unknown as RoomRepository, mocks };
}

function makeSceneRepo(roomId = ROOM_ID): { repo: SceneRepository; mocks: SceneRepoMocks } {
  const mocks: SceneRepoMocks = { findById: vi.fn() };
  mocks.findById.mockResolvedValue({
    id: SCENE_ID,
    roomId,
    name: 's',
    backgroundAssetId: null,
    gridSize: 50,
    gridWidth: 40,
    gridHeight: 40,
    gridVisible: true,
    fogShapes: null,
    isHidden: false,
    isActive: true,
    currentRound: 1,
    createdAt: new Date(),
  } satisfies Scene);
  return { repo: mocks as unknown as SceneRepository, mocks };
}

function fakeTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    id: 'track-1',
    roomId: ROOM_ID,
    sceneId: null,
    title: 'Battle music',
    assetId: 'asset-1',
    loop: false,
    fadeMs: 1500,
    layer: 'music',
    createdAt: new Date(),
    ...overrides,
  };
}

function fakeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    ownerId: OWNER_ID,
    roomId: ROOM_ID,
    mimeType: 'audio/mpeg',
    size: BigInt(1024),
    storageKey: `rooms/${ROOM_ID}/audio/asset-1.mp3`,
    originalName: 'asset-1.mp3',
    createdAt: new Date(),
    ...overrides,
  };
}

function buildService(opts: {
  storage?: ReturnType<typeof makeStorage>;
  audio?: ReturnType<typeof makeAudioRepo>;
  asset?: ReturnType<typeof makeAssetRepo>;
  room?: ReturnType<typeof makeRoomRepo>;
  scene?: ReturnType<typeof makeSceneRepo>;
} = {}) {
  const storage = opts.storage ?? makeStorage();
  const audio = opts.audio ?? makeAudioRepo();
  const asset = opts.asset ?? makeAssetRepo();
  const room = opts.room ?? makeRoomRepo();
  const scene = opts.scene ?? makeSceneRepo();
  const events: Array<{ roomId: string; payload: AudioPlayPayload }> = [];
  const broadcast = vi.fn((roomId: string, payload: AudioPlayPayload) => {
    events.push({ roomId, payload });
  });
  const service = new AudioService(
    audio.repo,
    asset.repo,
    storage.storage,
    room.repo,
    scene.repo,
    broadcast,
  );
  return { service, events, broadcast, storage, audio, asset, room, scene };
}

describe('AudioService.assertRoomOwner (RBAC, §2.18)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-owner with 403', async () => {
    const { service } = buildService();
    await expect(service.assertRoomOwner(ROOM_ID, OUTSIDER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('passes for owner', async () => {
    const { service } = buildService();
    await expect(service.assertRoomOwner(ROOM_ID, OWNER_ID)).resolves.toBeUndefined();
  });
});

describe('AudioService.initUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unsupported MIME with 415', async () => {
    const { service } = buildService();
    await expect(
      service.initUpload({ roomId: ROOM_ID, mimeType: 'audio/aac' as never, size: 1000 }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('rejects oversized files with 413 (НФВ 6.3)', async () => {
    const { service } = buildService();
    await expect(
      service.initUpload({
        roomId: ROOM_ID,
        mimeType: 'audio/mpeg',
        size: AUDIO_MAX_BYTES + 1,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('mints presigned PUT URL with room-scoped storageKey', async () => {
    const { service, storage } = buildService();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    storage.mocks.getPresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://signed.example/upload?sig=xyz',
      expiresAt,
    } satisfies PresignedUploadResult);

    const out = await service.initUpload({
      roomId: ROOM_ID,
      mimeType: 'audio/mpeg',
      size: 1024,
    });

    expect(out.uploadUrl).toBe('https://signed.example/upload?sig=xyz');
    expect(out.storageKey.startsWith(`rooms/${ROOM_ID}/audio/`)).toBe(true);
    expect(out.storageKey.endsWith('.mp3')).toBe(true);
    expect(storage.mocks.getPresignedUploadUrl).toHaveBeenCalledWith({
      storageKey: out.storageKey,
      mimeType: 'audio/mpeg',
    });
  });
});

describe('AudioService.finalizeUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists Asset+AudioTrack and broadcasts audio:play when bound to a scene', async () => {
    const ctx = buildService();
    const { service, storage, audio, asset, events } = ctx;
    const storageKey = `rooms/${ROOM_ID}/audio/abc.mp3`;
    storage.mocks.statObject.mockResolvedValue({ size: 2048, contentType: 'audio/mpeg' });
    asset.mocks.create.mockImplementation(async (data) =>
      fakeAsset({
        id: data.id as string,
        storageKey: data.storageKey as string,
        size: data.size as bigint,
      }),
    );
    audio.mocks.create.mockImplementation(async (data) =>
      fakeTrack({
        id: data.id as string,
        sceneId: (data.sceneId as string | null) ?? null,
        title: data.title as string,
        loop: (data.loop as boolean) ?? false,
        assetId: data.assetId as string,
      }),
    );

    const track = await service.finalizeUpload(
      {
        roomId: ROOM_ID,
        storageKey,
        mimeType: 'audio/mpeg',
        size: 2048,
        title: 'Tavern',
        sceneId: SCENE_ID,
        loop: true,
      },
      OWNER_ID,
    );

    expect(track.sceneId).toBe(SCENE_ID);
    expect(track.loop).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      kind: 'persistent',
      action: 'play',
      sceneId: SCENE_ID,
      loop: true,
    });
  });

  it('rejects mismatched MIME (defence-in-depth) and deletes the orphan object', async () => {
    const ctx = buildService();
    const { service, storage } = ctx;
    const storageKey = `rooms/${ROOM_ID}/audio/abc.mp3`;
    storage.mocks.statObject.mockResolvedValue({ size: 100, contentType: 'image/png' });

    await expect(
      service.finalizeUpload(
        {
          roomId: ROOM_ID,
          storageKey,
          mimeType: 'audio/mpeg',
          size: 100,
          title: 't',
        },
        OWNER_ID,
      ),
    ).rejects.toMatchObject({ status: 415 });
    expect(storage.mocks.delete).toHaveBeenCalledWith(storageKey);
  });

  it('rejects storageKey from another room', async () => {
    const { service } = buildService();
    await expect(
      service.finalizeUpload(
        {
          roomId: ROOM_ID,
          storageKey: 'rooms/other-room/audio/abc.mp3',
          mimeType: 'audio/mpeg',
          size: 100,
          title: 't',
        },
        OWNER_ID,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('AudioService.handleSceneSwitch (Ф6.4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits 2 broadcasts: switch for music, stop for ambient (only music bound)", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findActiveTracksForScene.mockResolvedValue([
      fakeTrack({ id: 't1', sceneId: SCENE_ID, loop: true, layer: 'music', fadeMs: 1500 }),
    ]);

    await service.handleSceneSwitch(ROOM_ID, SCENE_ID);

    expect(events).toHaveLength(2);
    expect(events[0]!.payload).toMatchObject({
      kind: 'persistent',
      action: 'switch',
      trackId: 't1',
      sceneId: SCENE_ID,
      loop: true,
      layer: 'music',
    });
    expect(events[1]!.payload).toMatchObject({ kind: 'persistent', action: 'stop', layer: 'ambient' });
  });

  it("emits 2 stop broadcasts (music + ambient) when the new scene has no bound tracks", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findActiveTracksForScene.mockResolvedValue([]);

    await service.handleSceneSwitch(ROOM_ID, SCENE_ID);

    expect(events).toHaveLength(2);
    expect(events[0]!.payload).toMatchObject({ kind: 'persistent', action: 'stop', layer: 'music' });
    expect(events[1]!.payload).toMatchObject({ kind: 'persistent', action: 'stop', layer: 'ambient' });
  });

  it("emits play for music and ambient with correct fadeMs from each track", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findActiveTracksForScene.mockResolvedValue([
      fakeTrack({ id: 'tm', sceneId: SCENE_ID, loop: true, layer: 'music', fadeMs: 2000 }),
      fakeTrack({ id: 'ta', sceneId: SCENE_ID, loop: false, layer: 'ambient', fadeMs: 500 }),
    ]);

    await service.handleSceneSwitch(ROOM_ID, SCENE_ID);

    expect(events).toHaveLength(2);
    const music = events.find((e) => e.payload.kind === 'persistent' && e.payload.layer === 'music');
    const ambient = events.find((e) => e.payload.kind === 'persistent' && e.payload.layer === 'ambient');
    expect(music!.payload).toMatchObject({ action: 'switch', trackId: 'tm', fadeMs: 2000 });
    expect(ambient!.payload).toMatchObject({ action: 'switch', trackId: 'ta', fadeMs: 500 });
  });

  it("ignores SFX tracks — emits 2 stop broadcasts when only sfx is bound", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findActiveTracksForScene.mockResolvedValue([
      fakeTrack({ id: 'sfx1', sceneId: SCENE_ID, layer: 'sfx', fadeMs: 0 }),
    ]);

    await service.handleSceneSwitch(ROOM_ID, SCENE_ID);

    expect(events).toHaveLength(2);
    expect(events[0]!.payload).toMatchObject({ kind: 'persistent', action: 'stop', layer: 'music' });
    expect(events[1]!.payload).toMatchObject({ kind: 'persistent', action: 'stop', layer: 'ambient' });
  });
});

describe('AudioService.patchTrack', () => {
  beforeEach(() => vi.clearAllMocks());

  it("broadcasts 'play' when sceneId binding changes", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findById.mockResolvedValue(fakeTrack({ sceneId: null }));
    audio.mocks.update.mockResolvedValue(fakeTrack({ sceneId: SCENE_ID }));

    await service.patchTrack('track-1', { sceneId: SCENE_ID });

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ kind: 'persistent', action: 'play', sceneId: SCENE_ID });
  });

  it("broadcasts 'stop' when sceneId is unbound (null)", async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    audio.mocks.findById.mockResolvedValue(fakeTrack({ sceneId: SCENE_ID }));
    audio.mocks.update.mockResolvedValue(fakeTrack({ sceneId: null }));

    await service.patchTrack('track-1', { sceneId: null });

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ kind: 'persistent', action: 'stop' });
  });

  it('does NOT broadcast on title-only edits', async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    const before = fakeTrack({ sceneId: SCENE_ID, title: 'old' });
    audio.mocks.findById.mockResolvedValue(before);
    audio.mocks.update.mockResolvedValue({ ...before, title: 'new' });

    await service.patchTrack('track-1', { title: 'new' });

    expect(events).toHaveLength(0);
  });
});

describe('AudioService layer field (S8 — 3-layer architecture)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creating a track without layer defaults to music', async () => {
    const ctx = buildService();
    const { service, storage, audio, asset } = ctx;
    const storageKey = `rooms/${ROOM_ID}/audio/abc.mp3`;
    storage.mocks.statObject.mockResolvedValue({ size: 512, contentType: 'audio/mpeg' });
    asset.mocks.create.mockImplementation(async (data) =>
      fakeAsset({ id: data.id as string, storageKey: data.storageKey as string }),
    );
    audio.mocks.create.mockImplementation(async (data) =>
      fakeTrack({ id: data.id as string, layer: (data.layer as AudioLayer) ?? 'music' }),
    );

    const track = await service.finalizeUpload(
      { roomId: ROOM_ID, storageKey, mimeType: 'audio/mpeg', size: 512, title: 'Bg' },
      OWNER_ID,
    );

    expect(audio.mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'music' }),
    );
    expect(track.layer).toBe('music');
  });

  it('creating a track with layer: ambient persists ambient', async () => {
    const ctx = buildService();
    const { service, storage, audio, asset } = ctx;
    const storageKey = `rooms/${ROOM_ID}/audio/rain.mp3`;
    storage.mocks.statObject.mockResolvedValue({ size: 512, contentType: 'audio/mpeg' });
    asset.mocks.create.mockImplementation(async (data) =>
      fakeAsset({ id: data.id as string, storageKey: data.storageKey as string }),
    );
    audio.mocks.create.mockImplementation(async (data) =>
      fakeTrack({ id: data.id as string, layer: data.layer as AudioLayer }),
    );

    const track = await service.finalizeUpload(
      {
        roomId: ROOM_ID,
        storageKey,
        mimeType: 'audio/mpeg',
        size: 512,
        title: 'Rain',
        layer: 'ambient',
      },
      OWNER_ID,
    );

    expect(audio.mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'ambient' }),
    );
    expect(track.layer).toBe('ambient');
  });

  it('patching layer from music to sfx broadcasts sfx kind payload', async () => {
    const ctx = buildService();
    const { service, audio, events } = ctx;
    const before = fakeTrack({ sceneId: SCENE_ID, layer: 'music' });
    const after = fakeTrack({ sceneId: SCENE_ID, layer: 'sfx' });
    audio.mocks.findById.mockResolvedValue(before);
    audio.mocks.update.mockResolvedValue(after);

    await service.patchTrack('track-1', { layer: 'sfx' });

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ kind: 'sfx', trackId: 'track-1' });
  });
});

// ── S9.1 T1: in-memory state cache + public playback helpers ────────────────

describe('AudioService.getCurrentForRoom (T1 — in-memory cache)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null state when no audio has been emitted yet', () => {
    const { service } = buildService();
    const state = service.getCurrentForRoom(ROOM_ID);
    expect(state).toEqual({ music: null, ambient: null });
  });

  it('caches the last-broadcast persistent payload per layer', async () => {
    const { service, audio } = buildService();
    audio.mocks.findById.mockResolvedValue(fakeTrack({ sceneId: SCENE_ID }));
    await service.playTrack(fakeTrack({ id: 'track-1', layer: 'music', sceneId: SCENE_ID }));

    const state = service.getCurrentForRoom(ROOM_ID);
    expect(state.music).toMatchObject({
      kind: 'persistent',
      layer: 'music',
      trackId: 'track-1',
      action: 'play',
    });
    expect(state.ambient).toBeNull();
  });

  it('sets layer to null on stop', async () => {
    const { service } = buildService();
    await service.playTrack(fakeTrack({ id: 'track-1', layer: 'music', sceneId: SCENE_ID }));
    await service.stopLayer(ROOM_ID, 'music');

    const state = service.getCurrentForRoom(ROOM_ID);
    expect(state.music).toBeNull();
  });

  it('SFX payloads are NOT cached', () => {
    const { service, broadcast } = buildService();
    // Directly test by calling the private broadcast wrapper via handleSceneSwitch
    // triggering an sfx kind is not possible via public API alone —
    // use patchTrack to emit sfx and then inspect cache.
    // SFX tracks: service.playTrack with sfx layer → buildPlayPayload returns sfx kind.
    void service.playTrack(fakeTrack({ id: 'sfx-1', layer: 'sfx', sceneId: SCENE_ID }));
    const state = service.getCurrentForRoom(ROOM_ID);
    // sfx broadcast DID fire but cache should be untouched (both null)
    expect(broadcast).toHaveBeenCalled();
    expect(state.music).toBeNull();
    expect(state.ambient).toBeNull();
  });
});

describe('AudioService.playTrack (T2 — REST play helper)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('broadcasts audio:play for music layer and updates cache', async () => {
    const { service, events } = buildService();
    const track = fakeTrack({ id: 'track-m', layer: 'music', sceneId: SCENE_ID, loop: true, fadeMs: 2000 });

    await service.playTrack(track);

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      kind: 'persistent',
      layer: 'music',
      action: 'play',
      trackId: 'track-m',
      loop: true,
      fadeMs: 2000,
    });
    // Cache updated
    expect(service.getCurrentForRoom(ROOM_ID).music).toMatchObject({ trackId: 'track-m' });
  });

  it('broadcasts sfx kind for sfx layer', async () => {
    const { service, events } = buildService();
    const track = fakeTrack({ id: 'sfx-t', layer: 'sfx', sceneId: null });

    await service.playTrack(track);

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ kind: 'sfx', trackId: 'sfx-t' });
  });
});

describe('AudioService.stopLayer (T2 — REST stop helper)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('broadcasts persistent stop for music layer', async () => {
    const { service, events } = buildService();

    await service.stopLayer(ROOM_ID, 'music');

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      kind: 'persistent',
      layer: 'music',
      action: 'stop',
      fadeMs: 1500,
    });
    expect(service.getCurrentForRoom(ROOM_ID).music).toBeNull();
  });

  it('broadcasts persistent stop for ambient layer', async () => {
    const { service, events } = buildService();

    await service.stopLayer(ROOM_ID, 'ambient');

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      kind: 'persistent',
      layer: 'ambient',
      action: 'stop',
    });
    expect(service.getCurrentForRoom(ROOM_ID).ambient).toBeNull();
  });
});
