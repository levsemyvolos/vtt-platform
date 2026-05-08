/**
 * Spell entry shared across all character sheet formats.
 * Originally defined in client SpellsList.tsx — moved here for server-side validation.
 */
export interface SpellEntry {
  name: string;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  description: string;
}

/**
 * Character sheet DTOs (Ф9.1 — Ф9.3).
 *
 * Discriminated union per algorithm A6 (RBAC-projection, §2.17.6):
 *   - kind === 'full'  → owner / GM viewer; full sheetData and pdfUrl.
 *   - kind === 'short' → other viewers; only public surface (name, portrait).
 *
 * The `kind` discriminator enables exhaustive switches on the client side.
 */
export interface CharacterSheetFullDTO {
  kind: 'full';
  id: string;
  ownerId: string;
  roomId: string;
  name: string;
  /** Schema is system-specific (D&D 5e by default); kept as `unknown` here. */
  sheetData: unknown;
  /** Presigned URL (TTL = 15 min) of the uploaded PDF, if any. */
  pdfUrl?: string;
  updatedAt: string;
}

export interface CharacterSheetShortDTO {
  kind: 'short';
  id: string;
  ownerId: string;
  name: string;
  portraitUrl?: string;
}

export type CharacterSheetDTO = CharacterSheetFullDTO | CharacterSheetShortDTO;

export interface CharacterCreateRequest {
  name: string;
  sheetData?: unknown;
}

export interface CharacterUpdateRequest {
  name?: string;
  sheetData?: unknown;
}
