import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Button from '../Button';

afterEach(() => cleanup());

describe('Button', () => {
  it('renders children and triggers onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('honors disabled and isLoading', () => {
    const onClick = vi.fn();
    render(<Button isLoading onClick={onClick}>Wait</Button>);
    const btn = screen.getByRole('button', { name: /wait/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders left icon (a11y hidden)', () => {
    render(
      <Button leftIcon={<span data-testid="ic">x</span>}>Save</Button>,
    );
    const ic = screen.getByTestId('ic');
    expect(ic).toBeTruthy();
    expect(ic.parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});
