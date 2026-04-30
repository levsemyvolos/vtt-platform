import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import scenesReducer from '../../../store/scenes';
import CreateSceneModal from '../CreateSceneModal';

afterEach(() => { cleanup(); });

function makeStore() {
  return configureStore({ reducer: { scenes: scenesReducer } });
}

function renderModal(onClose = vi.fn()) {
  return render(
    <Provider store={makeStore()}>
      <CreateSceneModal roomId="room-1" onClose={onClose} />
    </Provider>,
  );
}

describe('CreateSceneModal', () => {
  it('renders all form fields', () => {
    renderModal();
    expect(screen.getByLabelText('Назва *')).toBeTruthy();
    expect(screen.getByLabelText('Ширина (кліток)')).toBeTruthy();
    expect(screen.getByLabelText('Висота (кліток)')).toBeTruthy();
    expect(screen.getByLabelText('Розмір клітинки (px)')).toBeTruthy();
  });

  it('shows validation error when name is empty', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Створити' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain("Назва сцени обов'язкова");
    });
  });

  it('shows validation error when gridWidth is out of range', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Назва *'), { target: { value: 'Бій' } });
    fireEvent.change(screen.getByLabelText('Ширина (кліток)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Створити' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Ширина');
    });
  });

  it('shows validation error when gridSize is out of range', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Назва *'), { target: { value: 'Таверна' } });
    fireEvent.change(screen.getByLabelText('Розмір клітинки (px)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Створити' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Розмір клітинки');
    });
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
