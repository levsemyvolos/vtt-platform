import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RecentGenerations from '../RecentGenerations';

// Mock apiFetch so no real network calls happen
vi.mock('../../../api/apiFetch', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('RecentGenerations', () => {
  it('renders quota section heading', () => {
    // Heading was renamed from "Ліміти" to "AI-використання" when the quota
    // panel was rewritten in commit aa4accb (per-modality 24h / total
    // counters via GET /api/ai/quota). The locale key `recent.quotaHeading`
    // now resolves to "AI-використання" in uk and "AI usage" in en.
    render(<RecentGenerations roomId="test-room-id" />);
    expect(screen.getByText('AI-використання')).toBeTruthy();
  });
});
