import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Tabs, { type TabItem } from '../Tabs';

afterEach(() => cleanup());

type Id = 'a' | 'b' | 'c';

const items: ReadonlyArray<TabItem<Id>> = [
  { id: 'a', label: 'Alpha', count: 3 },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma', unbound: true },
];

describe('Tabs', () => {
  it('marks the selected tab via aria-selected', () => {
    render(<Tabs<Id> items={items} value="b" onChange={() => {}} ariaLabel="x" />);
    expect(
      screen.getByRole('tab', { name: /alpha/i }).getAttribute('aria-selected'),
    ).toBe('false');
    expect(
      screen.getByRole('tab', { name: /beta/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('fires onChange for normal tabs and onUnboundClick for unbound ones', () => {
    const onChange = vi.fn();
    const onUnboundClick = vi.fn();
    render(
      <Tabs<Id>
        items={items}
        value="a"
        onChange={onChange}
        onUnboundClick={onUnboundClick}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith('b');

    fireEvent.click(screen.getByRole('tab', { name: /gamma/i }));
    expect(onUnboundClick).toHaveBeenCalledWith('c');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders count chip when count is provided', () => {
    render(<Tabs<Id> items={items} value="a" onChange={() => {}} />);
    expect(screen.getByText('3')).toBeTruthy();
  });
});
