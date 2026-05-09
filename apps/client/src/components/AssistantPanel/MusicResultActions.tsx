import { useTranslation } from 'react-i18next';
import type { AIMusicResponse, MusicPresetKey } from '@vtt/shared';
import { useSaveAiAudio } from '../../hooks/useSaveAiAudio';
import styles from './MusicResultActions.module.css';

interface Props {
  roomId: string;
  result: AIMusicResponse;
  /** For auto-title generation. Empty string = custom mode. */
  presetKey: MusicPresetKey | '';
  /** Re-submit the current builder state for a fresh generation. */
  onRegenerate: () => void;
  /** Clear the local result preview state in the parent builder. */
  onDiscard: () => void;
}

export default function MusicResultActions({
  roomId,
  result,
  presetKey,
  onRegenerate,
  onDiscard,
}: Props): JSX.Element {
  const { t } = useTranslation('assistant');

  // Default room-track title for the freshly-generated preview. The
  // history-row variant in MusicHistoryList passes the persisted asset.name
  // (which is now the mood-derived label from S5.5 P1), so the two surfaces
  // converge on the same naming model after one refresh.
  function buildAutoTitle(): string {
    const presetLabel = presetKey
      ? (t(`musicBuilder.presets.${presetKey}`) as string)
      : (t('musicResult.customLabel') as string);
    const time = new Date().toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return `${presetLabel} — ${time}`;
  }

  const { pending, savedTrackId, save } = useSaveAiAudio(
    roomId,
    result.assetId,
    buildAutoTitle(),
  );

  return (
    <div className={styles.wrapper}>
      <audio controls src={result.previewUrl} className={styles.audio}>
        {t('conversation.audioUnsupported')}
      </audio>
      <div className={styles.actions} role="group" aria-label={t('musicResult.groupLabel')}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => void save(false)}
          disabled={pending !== null || savedTrackId !== null}
        >
          {savedTrackId !== null
            ? t('musicResult.savedLabel')
            : pending === 'save'
            ? t('musicResult.savingLabel')
            : t('musicResult.saveLabel')}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={onRegenerate}
          disabled={pending !== null}
        >
          {t('musicResult.regenerateLabel')}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={onDiscard}
          disabled={pending !== null}
        >
          {t('musicResult.discardLabel')}
        </button>
      </div>
    </div>
  );
}
