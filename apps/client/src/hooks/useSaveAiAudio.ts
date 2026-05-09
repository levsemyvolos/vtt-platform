import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioTrackDTO, AudioTrackFromAssetRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../api/apiFetch';
import { useAppDispatch } from '../store';
import { addToast } from '../store/toast';

/**
 * S5.5 P2 — single-call hook for "save AI audio asset as a room track".
 *
 * Centralizes the POST /api/audio/from-asset flow so both the freshly-
 * generated music result (MusicResultActions) and any history row
 * (MusicHistoryList) can offer Save / Play-in-room with consistent
 * pending state, success-toast and error-toast behavior.
 *
 * `savedTrackId` is per-asset (one hook instance per asset row), so the
 * Save button can flip to "Saved ✓" without affecting other rows.
 */
export interface UseSaveAiAudioResult {
  pending: 'save' | 'play' | null;
  savedTrackId: string | null;
  /**
   * Persists the asset as an AudioTrack and optionally broadcasts an
   * audio:play right away. Idempotent for the save-only path: a second
   * Save click no-ops once a trackId has been recorded.
   */
  save: (playImmediately: boolean) => Promise<void>;
}

export function useSaveAiAudio(
  roomId: string,
  assetId: string,
  defaultTitle: string,
): UseSaveAiAudioResult {
  const { t } = useTranslation('assistant');
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState<'save' | 'play' | null>(null);
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null);

  async function save(playImmediately: boolean): Promise<void> {
    if (pending !== null) return;
    if (!playImmediately && savedTrackId !== null) return;
    setPending(playImmediately ? 'play' : 'save');
    try {
      const body: AudioTrackFromAssetRequest = {
        roomId,
        assetId,
        title: defaultTitle.trim() || 'AI Music',
        layer: 'music',
        loop: false,
        playImmediately,
      };
      const track = await apiFetch<AudioTrackDTO>('/api/audio/from-asset', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSavedTrackId(track.id);
      dispatch(
        addToast(
          'success',
          t(playImmediately ? 'musicResult.toastPlaying' : 'musicResult.toastSaved'),
        ),
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
          ? err.message
          : t('musicResult.saveError');
      dispatch(addToast('error', msg));
    } finally {
      setPending(null);
    }
  }

  return { pending, savedTrackId, save };
}
