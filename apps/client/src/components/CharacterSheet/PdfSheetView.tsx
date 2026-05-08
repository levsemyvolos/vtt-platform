/**
 * PdfSheetView — renders an uploaded PDF via <iframe> or an empty-state
 * upload prompt when no URL is available.
 */
import { useTranslation } from 'react-i18next';
import styles from './CharacterSheet.module.css';

export interface PdfSheetViewProps {
  pdfUrl?: string;
  onUploadPdf?: (file: File) => void;
  disabled?: boolean;
}

export default function PdfSheetView({ pdfUrl, onUploadPdf, disabled = false }: PdfSheetViewProps): JSX.Element {
  const { t } = useTranslation('campaign');

  if (pdfUrl) {
    return (
      <iframe
        src={pdfUrl}
        title={t('dnd5e.actions.viewPdf', { defaultValue: 'View uploaded PDF' })}
        className={styles.pdfFrame}
      />
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file && onUploadPdf) {
      onUploadPdf(file);
    }
  }

  return (
    <div className={styles.pdfEmpty}>
      <p>
        {t('dnd5e.actions.uploadPdfFirst', {
          defaultValue: 'Upload a PDF first to view it here.',
        })}
      </p>
      {onUploadPdf !== undefined && (
        <label>
          <span className={styles.pdfUploadLabel}>
            {t('dnd5e.actions.uploadPdf', { defaultValue: 'Upload PDF' })}
          </span>
          <input
            type="file"
            accept="application/pdf"
            disabled={disabled}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  );
}
