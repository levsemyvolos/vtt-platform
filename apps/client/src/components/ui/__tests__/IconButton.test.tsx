import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import IconButton from '../IconButton';

afterEach(() => cleanup());

describe('IconButton', () => {
  it('requires aria-label and exposes it', () => {
    render(<IconButton aria-label="Ping">P</IconButton>);
    expect(screen.getByRole('button', { name: 'Ping' })).toBeTruthy();
  });

  it('reflects active state with aria-pressed', () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Fog" isActive onClick={onClick}>
        F
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Fog' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
