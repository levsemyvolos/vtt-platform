import { describe, it, expect } from 'vitest';
import journalReducer, {
  upsertEntry,
  removeEntry,
  clearJournal,
} from '../journal';
import type { JournalEntryDTO } from '@vtt/shared';

function makeEntry(overrides: Partial<JournalEntryDTO> = {}): JournalEntryDTO {
  return {
    id: 'entry-1',
    roomId: 'room-1',
    authorId: 'user-1',
    title: 'Test Entry',
    body: 'Body text',
    visibility: 'private',
    recipientIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function init() {
  return journalReducer(undefined, { type: '@@INIT' });
}

describe('journal slice', () => {
  it('initial state has empty entries and idle status', () => {
    const s = init();
    expect(s.entries).toEqual([]);
    expect(s.status).toBe('idle');
    expect(s.error).toBeNull();
  });

  it('upsertEntry adds a new entry to empty state', () => {
    const entry = makeEntry({ id: 'e1' });
    const s = journalReducer(init(), upsertEntry(entry));
    expect(s.entries).toHaveLength(1);
    expect(s.entries.at(0)?.id).toBe('e1');
  });

  it('upsertEntry updates an existing entry by id', () => {
    const entry = makeEntry({ id: 'e1', title: 'Original' });
    const s1 = journalReducer(init(), upsertEntry(entry));
    const updated = makeEntry({ id: 'e1', title: 'Updated' });
    const s2 = journalReducer(s1, upsertEntry(updated));
    expect(s2.entries).toHaveLength(1);
    expect(s2.entries.at(0)?.title).toBe('Updated');
  });

  it('upsertEntry appends when id does not exist', () => {
    const e1 = makeEntry({ id: 'e1' });
    const e2 = makeEntry({ id: 'e2' });
    const s1 = journalReducer(init(), upsertEntry(e1));
    const s2 = journalReducer(s1, upsertEntry(e2));
    expect(s2.entries).toHaveLength(2);
  });

  it('removeEntry filters out the entry by id', () => {
    const e1 = makeEntry({ id: 'e1' });
    const e2 = makeEntry({ id: 'e2' });
    const s1 = journalReducer(init(), upsertEntry(e1));
    const s2 = journalReducer(s1, upsertEntry(e2));
    const s3 = journalReducer(s2, removeEntry('e1'));
    expect(s3.entries).toHaveLength(1);
    expect(s3.entries.at(0)?.id).toBe('e2');
  });

  it('removeEntry is a no-op when id does not exist', () => {
    const entry = makeEntry({ id: 'e1' });
    const s1 = journalReducer(init(), upsertEntry(entry));
    const s2 = journalReducer(s1, removeEntry('does-not-exist'));
    expect(s2.entries).toHaveLength(1);
  });

  it('clearJournal resets state to initial', () => {
    const entry = makeEntry({ id: 'e1' });
    const s1 = journalReducer(init(), upsertEntry(entry));
    expect(s1.entries).toHaveLength(1);
    const s2 = journalReducer(s1, clearJournal());
    expect(s2.entries).toEqual([]);
    expect(s2.status).toBe('idle');
    expect(s2.error).toBeNull();
  });
});
