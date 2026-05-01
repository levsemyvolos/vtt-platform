import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Logo from '../Logo';

afterEach(() => cleanup());

describe('Logo', () => {
  it('renders an svg with diamond polygon', () => {
    render(<Logo size={24} />);
    const svg = screen.getByRole('img', { name: 'Logo' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelector('polygon')).not.toBeNull();
  });

  it('omits the inner dot when withDot=false', () => {
    const { container } = render(<Logo withDot={false} />);
    expect(container.querySelector('circle')).toBeNull();
  });
});
