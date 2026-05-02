import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar from '../Avatar';

afterEach(() => cleanup());

describe('Avatar', () => {
  it('renders initials extracted from full name', () => {
    render(<Avatar name="Семиволос Микита" />);
    expect(screen.getByText('СМ')).toBeTruthy();
  });

  it('falls back to first 2 chars when single-word name', () => {
    render(<Avatar name="GM" />);
    expect(screen.getByText('GM')).toBeTruthy();
  });

  it('renders an <img> when src provided', () => {
    render(<Avatar name="X" src="/x.png" />);
    // role="img" is on both <span> wrapper and <img> — pick the actual <img>
    const imgs = screen.getAllByRole('img', { name: 'X' });
    expect(imgs.some((el) => el.tagName.toLowerCase() === 'img')).toBe(true);
  });
});
