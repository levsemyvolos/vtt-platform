import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Badge from '../Badge';

afterEach(() => cleanup());

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>GM</Badge>);
    expect(screen.getByText('GM')).toBeTruthy();
  });

  it('applies variant and tone classes', () => {
    render(
      <Badge variant="status" tone="success" data-testid="b">
        Online
      </Badge>,
    );
    const el = screen.getByTestId('b');
    expect(el.className).toMatch(/variant-status/);
    expect(el.className).toMatch(/tone-success/);
  });

  it('applies uppercase modifier', () => {
    render(<Badge uppercase data-testid="b">act</Badge>);
    expect(screen.getByTestId('b').className).toMatch(/uppercase/);
  });
});
