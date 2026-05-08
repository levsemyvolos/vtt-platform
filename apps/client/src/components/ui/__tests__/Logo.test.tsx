import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Logo from '../Logo';

afterEach(() => cleanup());

describe('Logo', () => {
  it('renders with accessible label', () => {
    render(<Logo size={40} />);
    expect(screen.getByRole('img', { name: /obscure vtt/i })).toBeTruthy();
  });

  it('renders both Oracle and Counselor SVG sigils', () => {
    const { container } = render(<Logo size={40} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
  });

  it('applies size as width+height on sigil container', () => {
    const { container } = render(<Logo size={60} />);
    const sigil = container.querySelector('[style]') as HTMLElement;
    expect(sigil.style.width).toBe('60px');
    expect(sigil.style.height).toBe('60px');
  });

  it('shows text block when withText=true (default)', () => {
    render(<Logo />);
    expect(screen.getByText(/Obscure/)).toBeTruthy();
  });

  it('hides text block when withText=false', () => {
    render(<Logo withText={false} />);
    expect(screen.queryByText(/Obscure/)).toBeNull();
  });

  it('accepts deprecated withDot prop without crashing', () => {
    const { container } = render(<Logo withDot={false} />);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });
});
