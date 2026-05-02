import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Card from '../Card';

afterEach(() => cleanup());

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Inside</Card>);
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it('applies accent class when accent prop set', () => {
    render(<Card accent="dnd" data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).toMatch(/accent-dnd/);
  });

  it('applies dashed and interactive modifiers', () => {
    render(<Card dashed interactive data-testid="c">x</Card>);
    const el = screen.getByTestId('c');
    expect(el.className).toMatch(/dashed/);
    expect(el.className).toMatch(/interactive/);
  });
});
