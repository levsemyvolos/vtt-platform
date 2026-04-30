import { useEffect, useState } from 'react';
import type { AssetDTO } from '@vtt/shared';
import { listRoomAssets } from '../../api/assets';

interface AssetPickerProps {
  roomId: string;
  onPick: (assetId: string) => void;
}

export default function AssetPicker({ roomId, onPick }: AssetPickerProps): JSX.Element {
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listRoomAssets(roomId)
      .then((list) => {
        setAssets(list.filter((a) => a.type.startsWith('image/')));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Не вдалося завантажити зображення');
      })
      .finally(() => setLoading(false));
  }, [roomId]);

  function handlePick(assetId: string): void {
    setSelected(assetId);
    onPick(assetId);
  }

  if (loading) return <p className="asset-picker__status">Завантаження галереї…</p>;
  if (error) return <p className="asset-picker__status asset-picker__status--error">{error}</p>;

  return (
    <div className="asset-picker">
      {assets.length === 0 ? (
        <p className="asset-picker__empty">Зображень ще немає. Завантажте перше через форму вище.</p>
      ) : (
        <ul className="asset-picker__grid" role="listbox" aria-label="Галерея зображень">
          {assets.map((asset) => (
            <li key={asset.id} role="option" aria-selected={selected === asset.id}>
              <button
                type="button"
                className={`asset-picker__item${selected === asset.id ? ' asset-picker__item--selected' : ''}`}
                onClick={() => handlePick(asset.id)}
                title={asset.name}
                aria-label={`Обрати зображення ${asset.name}`}
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="asset-picker__thumb"
                  loading="lazy"
                />
                <span className="asset-picker__name">{asset.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
