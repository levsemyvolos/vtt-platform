import { useTranslation } from 'react-i18next';
import styles from './SortDropdown.module.css';

export type SortField = 'lastActive' | 'created' | 'name';
export type SortOrder = 'asc' | 'desc';

export interface SortDropdownProps {
  sort: SortField;
  order: SortOrder;
  onSortChange: (sort: SortField, order: SortOrder) => void;
}

export default function SortDropdown({ sort, order, onSortChange }: SortDropdownProps) {
  const { t } = useTranslation('room');

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange(e.target.value as SortField, order);
  };

  const handleOrderToggle = () => {
    onSortChange(sort, order === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className={styles.wrap}>
      <select
        className={styles.select}
        value={sort}
        onChange={handleSortChange}
        aria-label={t('sortBy.label')}
      >
        <option value="lastActive">{t('sortBy.lastActive')}</option>
        <option value="created">{t('sortBy.created')}</option>
        <option value="name">{t('sortBy.name')}</option>
      </select>
      <button
        type="button"
        className={styles.orderBtn}
        onClick={handleOrderToggle}
        aria-label={order === 'desc' ? t('sortBy.orderDesc') : t('sortBy.orderAsc')}
        title={order === 'desc' ? '↓' : '↑'}
      >
        {order === 'desc' ? '↓' : '↑'}
      </button>
    </div>
  );
}
