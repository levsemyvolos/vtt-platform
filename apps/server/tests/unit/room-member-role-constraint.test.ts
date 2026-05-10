/**
 * Workstream A5 — RoomMember.role CHECK constraint guard.
 *
 * The runtime test harness does not bring up a real Postgres instance, so we
 * cannot exercise the constraint with a live INSERT here. Instead we pin the
 * migration text to its essential clauses; a future drift (constraint dropped
 * by accident, role list narrowed/broadened) will fail this test loudly.
 *
 * A live INSERT-rejected-with-CHECK-violation test belongs in the post-
 * migration smoke suite (`pnpm --filter @vtt/server prisma migrate dev` +
 * manual `psql` insert), tracked in the verification section of the plan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'prisma/migrations/20260510000000_room_member_role_check/migration.sql',
);

describe('RoomMember.role CHECK constraint migration', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('targets the RoomMember table', () => {
    expect(sql).toMatch(/ALTER TABLE\s+"RoomMember"/i);
  });

  it('declares the named constraint RoomMember_role_check', () => {
    expect(sql).toMatch(/CONSTRAINT\s+"RoomMember_role_check"/i);
  });

  it('restricts role to exactly Player and Observer', () => {
    expect(sql).toMatch(/CHECK\s*\(\s*"role"\s+IN\s*\(\s*'Player'\s*,\s*'Observer'\s*\)\s*\)/i);
  });

  it('does NOT permit GM as a stored RoomMember role (GM = Room.ownerId)', () => {
    expect(sql).not.toMatch(/'GM'/);
  });
});
