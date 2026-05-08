import { useTranslation } from 'react-i18next';
import type { AudioLayer } from '@vtt/shared';
import { ALL_AUDIO_LAYERS } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { setMasterVolume, setLayerVolume } from '../../store/audio';
import styles from './VolumeMixer.module.css';

export default function VolumeMixer(): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const volume = useAppSelector((s) => s.audio.volume);

  return (
    <section className={styles.mixer} aria-label={t('audio.mixer.heading')}>
      <span className={`eyebrow ${styles.heading}`}>{t('audio.mixer.heading')}</span>
      <Row
        label={t('audio.mixer.master')}
        value={volume.master}
        onChange={(v) => dispatch(setMasterVolume(v))}
      />
      {ALL_AUDIO_LAYERS.map((layer: AudioLayer) => (
        <Row
          key={layer}
          label={t(`audio.mixer.${layer}`)}
          value={volume[layer]}
          onChange={(v) => dispatch(setLayerVolume({ layer, v }))}
        />
      ))}
    </section>
  );
}

interface RowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function Row({ label, value, onChange }: RowProps): JSX.Element {
  return (
    <label className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
        aria-label={label}
      />
      <span className={styles.rowValue}>{Math.round(value * 100)}%</span>
    </label>
  );
}
