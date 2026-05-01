import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RecentGenerations from '../RecentGenerations';

afterEach(() => { cleanup(); });

describe('RecentGenerations', () => {
  it('renders quota section heading', () => {
    render(<RecentGenerations />);
    expect(screen.getByText('Ліміти')).toBeTruthy();
  });
});
