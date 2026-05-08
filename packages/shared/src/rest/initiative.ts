/**
 * REST DTOs for the initiative tracker (Ф7.3).
 * The list itself reuses `InitiativeEntryDTO` from `../shared/index`.
 */
export interface InitiativeAddRequest {
  name: string;
  initiative: number;
  tokenId?: string;
}

export interface InitiativeReorderRequest {
  /** Full ordered list of entry UUIDs; missing IDs are rejected by service. */
  orderedIds: string[];
}

/** PATCH /api/initiative/:id — GM-only update of name and/or initiative value. */
export interface InitiativeUpdateRequest {
  name?: string;
  initiative?: number;
}
