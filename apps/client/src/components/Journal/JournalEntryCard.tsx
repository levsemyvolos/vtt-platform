import { Lock, Users, Image as ImageIcon, FileText } from 'lucide-react';
import type { JournalEntryDTO } from '@vtt/shared';
import styles from './JournalEntryCard.module.css';

interface Props {
  entry: JournalEntryDTO;
  myUserId: string;
  onClick: () => void;
}

export default function JournalEntryCard({ entry, onClick }: Props): JSX.Element {
  const isImage = entry.assetMime?.startsWith('image/') ?? false;
  return (
    <li className={styles.card}>
      <button type="button" className={styles.cardBtn} onClick={onClick}>
        {entry.assetUrl && isImage ? (
          <img src={entry.assetUrl} alt="" className={styles.thumb} loading="lazy" />
        ) : entry.assetUrl ? (
          <span className={styles.thumbPlaceholder} aria-hidden><FileText size={20} /></span>
        ) : (
          <span className={styles.thumbPlaceholder} aria-hidden><ImageIcon size={20} /></span>
        )}
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{entry.title}</span>
            {entry.visibility === 'private'
              ? <Lock size={12} className={styles.visIcon} aria-label="private" />
              : <Users size={12} className={styles.visIcon} aria-label="shared" />}
          </div>
          <span className={styles.date}>{new Date(entry.updatedAt).toLocaleDateString()}</span>
        </div>
      </button>
    </li>
  );
}
