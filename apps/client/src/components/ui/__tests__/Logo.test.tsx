import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Logo from '../Logo';

afterEach(() => cleanup());

describe('Logo', () => {
  it('renders an svg with typographic VTT path shapes', () => {
    render(<Logo size={24} />);
    const svg = screen.getByRole('img', { name: 'VTT Logo' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    // Typographic logo has path elements for V, T, T letterforms
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
  });

  it('accepts withDot prop for backwards compatibility without crashing', () => {
    const { container } = render(<Logo withDot={false} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('scales width proportionally to size prop', () => {
    const { container } = render(<Logo size={48} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    // width = size * (56/24) = 48 * 56/24 = 112
    expect(svg.getAttribute('width')).toBe('112');
    expect(svg.getAttribute('height')).toBe('48');
  });
});
