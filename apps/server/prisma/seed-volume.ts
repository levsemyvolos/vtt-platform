/**
 * Volume seed for §3.15 of the thesis.
 *
 * Generates a synthetic dataset that exceeds a typical single-user
 * configuration by roughly ×100 000:
 *   - 1 GM user + 1 room + 1 active scene
 *   - 10 000 tokens on the active scene  (typical: 50)
 *   - 100 000 chat messages              (typical: 5 000)
 *   - 1 000 journal entries              (typical: 50)
 *
 * Then measures the response time for the three key read queries:
 *   - GET /scenes/active  → SceneRepository.findActiveByRoomId
 *   - GET /chat?roomId    → ChatMessageRepository.listRecent (paginated)
 *   - GET /journal        → JournalRepository.listForUser
 *
 * Run:
 *   pnpm --filter @vtt/server exec tsx prisma/seed-volume.ts
 *
 * To restore baseline: drop and re-create the database via
 *   `docker compose down && docker compose up -d postgres && pnpm exec prisma migrate deploy`.
 */

import { PrismaClient, MessageMode, ChatChannel } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TOKENS = parseInt(process.env.SEED_TOKENS ?? '10000', 10);
const CHAT_MESSAGES = parseInt(process.env.SEED_CHAT ?? '100000', 10);
const JOURNAL_ENTRIES = parseInt(process.env.SEED_JOURNAL ?? '1000', 10);
const BATCH_SIZE = 1000;

async function seed() {
  console.log(
    `[seed-volume] target: tokens=${TOKENS} chat=${CHAT_MESSAGES} journal=${JOURNAL_ENTRIES}`,
  );

  // 1. GM user
  const t0 = Date.now();
  const passwordHash = await bcrypt.hash('VolumeTest#2026', 12);
  const gm = await prisma.user.create({
    data: {
      email: `volumetest-${Date.now()}@example.com`,
      passwordHash,
      displayName: 'Volume Test GM',
    },
  });

  // 2. Room
  const room = await prisma.room.create({
    data: {
      ownerId: gm.id,
      name: 'Volume Test Room',
      gameSystem: 'D&D 5e',
      inviteTokenPlayer: randomUUID(),
      inviteTokenObserver: randomUUID(),
      status: 'active',
    },
  });

  // 3. Scene
  const scene = await prisma.scene.create({
    data: {
      roomId: room.id,
      name: 'Battle of 10 000 Goblins',
      gridSize: 50,
      gridWidth: 100,
      gridHeight: 100,
      isActive: true,
    },
  });

  console.log(`[seed-volume] base entities ready in ${Date.now() - t0} ms`);

  // 4. Tokens (batched)
  console.log(`[seed-volume] inserting ${TOKENS} tokens...`);
  const tokensStart = Date.now();
  for (let i = 0; i < TOKENS; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, TOKENS - i) }, (_, j) => ({
      sceneId: scene.id,
      name: `Goblin #${i + j + 1}`,
      x: (i + j) % 100,
      y: Math.floor((i + j) / 100) % 100,
      hp: 7,
      maxHp: 7,
    }));
    await prisma.token.createMany({ data: batch });
  }
  console.log(`[seed-volume] tokens done in ${Date.now() - tokensStart} ms`);

  // 5. Chat messages (batched)
  console.log(`[seed-volume] inserting ${CHAT_MESSAGES} chat messages...`);
  const chatStart = Date.now();
  for (let i = 0; i < CHAT_MESSAGES; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, CHAT_MESSAGES - i) }, (_, j) => ({
      roomId: room.id,
      senderId: gm.id,
      mode: 'normal' as MessageMode,
      channel: 'public' as ChatChannel,
      body: `Synthetic message #${i + j + 1} for volume testing.`,
    }));
    await prisma.chatMessage.createMany({ data: batch });
  }
  console.log(`[seed-volume] chat done in ${Date.now() - chatStart} ms`);

  // 6. Journal entries (batched)
  console.log(`[seed-volume] inserting ${JOURNAL_ENTRIES} journal entries...`);
  const journalStart = Date.now();
  for (let i = 0; i < JOURNAL_ENTRIES; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, JOURNAL_ENTRIES - i) }, (_, j) => ({
      roomId: room.id,
      authorId: gm.id,
      title: `Journal entry ${i + j + 1}`,
      body: `Synthetic body for journal entry ${i + j + 1}. Lorem ipsum dolor sit amet.`,
      visibility: 'shared' as const,
    }));
    await prisma.journalEntry.createMany({ data: batch });
  }
  console.log(`[seed-volume] journal done in ${Date.now() - journalStart} ms`);

  console.log(`[seed-volume] total ${Date.now() - t0} ms`);
  console.log(`[seed-volume] roomId=${room.id} sceneId=${scene.id}`);

  // === Measurements ===
  console.log('\n[seed-volume] === read benchmarks ===\n');

  // Query 1: open scene with all tokens
  const q1Start = Date.now();
  const sceneRead = await prisma.scene.findUnique({
    where: { id: scene.id },
    include: { tokens: true },
  });
  const q1Ms = Date.now() - q1Start;
  console.log(`Q1 GET scene+tokens (${sceneRead?.tokens.length} tokens):  ${q1Ms} ms`);

  // Query 2: list recent chat (page 1, 50 messages)
  const q2Start = Date.now();
  const recent = await prisma.chatMessage.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const q2Ms = Date.now() - q2Start;
  console.log(`Q2 GET recent chat (50 of ${CHAT_MESSAGES}):  ${q2Ms} ms`);

  // Query 3: list all journal entries
  const q3Start = Date.now();
  const journal = await prisma.journalEntry.findMany({
    where: { roomId: room.id, visibility: 'shared' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const q3Ms = Date.now() - q3Start;
  console.log(`Q3 GET journal (100 of ${journal.length}):  ${q3Ms} ms`);

  // Query 4: full chat history (worst case)
  const q4Start = Date.now();
  const allChat = await prisma.chatMessage.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'asc' },
  });
  const q4Ms = Date.now() - q4Start;
  console.log(`Q4 GET full chat history (${allChat.length} messages):  ${q4Ms} ms`);

  console.log('\n[seed-volume] benchmarks complete');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
