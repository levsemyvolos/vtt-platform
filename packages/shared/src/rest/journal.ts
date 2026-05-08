/**
 * Journal DTOs (S10 — unified Notes ⊕ Handouts).
 *
 * `visibility = 'private'` → only the author sees the entry (replaces Notes).
 * `visibility = 'shared'`  → entry visible to author + GMs + listed recipients
 * (replaces Handouts). Recipients are stored as a join row per (entry, user).
 *
 * Server enforces RBAC in `JournalService`:
 *   - GM: full CRUD over every entry in the room.
 *   - Player: read-only; sees an entry only when visibility=shared and own
 *     userId is in the recipient list.
 */
export type JournalVisibility = 'private' | 'shared';

export interface JournalEntryDTO {
  id: string;
  roomId: string;
  authorId: string;
  title: string;
  body: string;
  visibility: JournalVisibility;
  /** Presigned URL of attached asset (TTL = 15 min) when assetId is set. */
  assetUrl?: string;
  /** MIME of the attached asset; client decides image-thumbnail vs file-link. */
  assetMime?: string;
  /** Empty when visibility = 'private'. */
  recipientIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JournalCreateRequest {
  title: string;
  body: string;
  assetId?: string;
}

export interface JournalUpdateRequest {
  title?: string;
  body?: string;
  /** `null` to clear the asset; `undefined` to keep it untouched. */
  assetId?: string | null;
}

export interface JournalGrantRequest {
  /** Replaces the recipient list (not append). Empty array → revoke + private. */
  userIds: string[];
}

export interface JournalListResponse {
  entries: JournalEntryDTO[];
}
