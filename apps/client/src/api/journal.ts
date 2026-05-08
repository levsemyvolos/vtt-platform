import type {
  JournalEntryDTO,
  JournalCreateRequest,
  JournalUpdateRequest,
  JournalGrantRequest,
  JournalListResponse,
} from '@vtt/shared';
import { apiFetch } from './apiFetch';

export async function listJournalEntries(roomId: string): Promise<JournalEntryDTO[]> {
  const res = await apiFetch<JournalListResponse>(`/api/rooms/${roomId}/journal`, { method: 'GET' });
  return res.entries;
}

export async function getJournalEntry(id: string): Promise<JournalEntryDTO> {
  return apiFetch<JournalEntryDTO>(`/api/journal/${id}`, { method: 'GET' });
}

export async function createJournalEntry(roomId: string, req: JournalCreateRequest): Promise<JournalEntryDTO> {
  return apiFetch<JournalEntryDTO>(`/api/rooms/${roomId}/journal`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function updateJournalEntry(id: string, req: JournalUpdateRequest): Promise<JournalEntryDTO> {
  return apiFetch<JournalEntryDTO>(`/api/journal/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await apiFetch<void>(`/api/journal/${id}`, { method: 'DELETE' });
}

export async function grantJournalEntry(id: string, req: JournalGrantRequest): Promise<JournalEntryDTO> {
  return apiFetch<JournalEntryDTO>(`/api/journal/${id}/grant`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
