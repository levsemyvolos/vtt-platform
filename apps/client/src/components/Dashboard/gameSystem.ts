import type { CardAccent } from '../ui/Card';

/**
 * Maps a free-form gameSystem string from RoomDTO into a CardAccent
 * (which drives the colored top-bar of RoomCard).
 *
 * Matching is case-insensitive; falls back to 'dnd' (gold) for unknown systems.
 */
export function gameSystemAccent(gameSystem: string): CardAccent {
  const v = gameSystem.toLowerCase();
  if (v.includes('cthulhu')) return 'coc';
  if (v.includes('homebrew')) return 'homebrew';
  if (v.includes('pathfinder')) return 'pathfinder';
  return 'dnd';
}
