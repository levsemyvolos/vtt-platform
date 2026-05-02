import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Input from '../Input';

afterEach(() => cleanup());

describe('Input', () => {
  it('renders label and connects it to input', () => {
    render(<Input label="Email" placeholder="you@x.com" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeTruthy();
    expect(input.getAttribute('placeholder')).toBe('you@x.com');
  });

  it('renders error and sets aria-invalid + aria-describedby', () => {
    render(<Input label="Pwd" error="Required" />);
    const input = screen.getByLabelText('Pwd');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorMsg = screen.getByRole('alert');
    expect(errorMsg.textContent).toBe('Required');
    expect(input.getAttribute('aria-describedby')).toContain(errorMsg.id);
  });

  it('renders hint when no error', () => {
    render(<Input label="Name" hint="Will be visible to others" />);
    expect(screen.getByText(/visible to others/i)).toBeTruthy();
  });
});
