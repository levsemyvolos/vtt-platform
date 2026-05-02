import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AuthLayout from '../AuthLayout';

afterEach(() => { cleanup(); });

describe('AuthLayout', () => {
  it('renders Logo corner and VTT text', () => {
    render(<AuthLayout><span>child</span></AuthLayout>);
    expect(screen.getByText('VTT')).toBeTruthy();
  });

  it('renders passed children inside the card', () => {
    render(<AuthLayout><span data-testid="card-child">content</span></AuthLayout>);
    expect(screen.getByTestId('card-child')).toBeTruthy();
  });
});
