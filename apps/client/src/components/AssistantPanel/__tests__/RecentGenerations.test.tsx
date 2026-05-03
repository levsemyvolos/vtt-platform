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
    render(<RecentGenerations roomId="test-room-id" />);
    expect(screen.getByText('Ліміти')).toBeTruthy();
  });
});
