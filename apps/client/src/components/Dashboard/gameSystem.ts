import type { CardAccent } from '../ui/Card';

/**
 * Maps a free-form gameSystem string from RoomDTO into a CardAccent enum value.
 * Matching is case-insensitive; falls back to 'dnd' for unknown systems.
 */
export function gameSystemAccent(gameSystem: string): CardAccent {
  const v = gameSystem.toLowerCase();
  if (v.includes('cthulhu')) return 'coc';
  if (v.includes('homebrew')) return 'homebrew';
  if (v.includes('pathfinder')) return 'pathfinder';
  return 'dnd';
}

/** Maps CardAccent enum → CSS color value for inline style (accentBar). */
export function accentVar(accent: CardAccent): string {
  switch (accent) {
    case 'dnd':        return 'var(--rune)';
    case 'pathfinder': return 'var(--color-system-pathfinder)';
    case 'coc':        return 'var(--color-system-coc)';
    case 'homebrew':   return 'var(--primary)';
    case 'invitation': return 'var(--primary)';
    default:           return 'var(--primary)';
  }
}
