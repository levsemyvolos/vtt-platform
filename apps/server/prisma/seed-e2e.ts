import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const p = new PrismaClient();

async function main() {
  const users = [
    { email: 'gm@test.local', password: 'gmPassword123', name: 'GM' },
    { email: 'player@test.local', password: 'playerPassword123', name: 'Player' },
    { email: 'observer@test.local', password: 'observerPassword123', name: 'Observer' },
    { email: 'loadtest@example.com', password: 'LoadTest#Pass2026', name: 'Load Test' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    await p.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash: hash, displayName: u.name },
    });
    console.log(`upserted ${u.email}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
