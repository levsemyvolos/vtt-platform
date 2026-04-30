/**
 * Handout DTOs (Ф7.2 — роздаткові матеріали GM → Players).
 * Spec: §2.16 (REST), RBAC §2.18 — only GM creates / grants / revokes.
 */
export interface HandoutDTO {
  id: string;
  roomId: string;
  title: string;
  body: string;
  /** Presigned URL of the attached asset (TTL = 15 min) if `assetId` is set. */
  assetUrl?: string;
  recipientIds: string[];
  createdAt: string;
}

export interface HandoutCreateRequest {
  title: string;
  body: string;
  assetId?: string;
}

export interface HandoutGrantRequest {
  userIds: string[];
}
