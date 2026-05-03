import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Logo from '../Logo';

afterEach(() => cleanup());

describe('Logo', () => {
  it('renders an svg with D20 polygon shapes', () => {
    render(<Logo size={24} />);
    const svg = screen.getByRole('img', { name: 'VTT Logo' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    // D20 logo has at least one polygon (outer pentagon) and a center circle
    expect(svg.querySelector('polygon')).not.toBeNull();
    expect(svg.querySelector('circle')).not.toBeNull();
  });

  it('accepts withDot prop for backwards compatibility without crashing', () => {
    const { container } = render(<Logo withDot={false} />);
    // The D20 logo always renders its geometry regardless of the deprecated withDot prop
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
