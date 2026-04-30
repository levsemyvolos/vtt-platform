import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../../store';
import { removeToken } from '../../store/scene';
import { apiDeleteToken } from '../../api/scenes';

interface TokenContextMenuProps {
  tokenId: string;
  x: number;
  y: number;
  onEdit: () => void;
  onClose: () => void;
}

export default function TokenContextMenu({
  tokenId, x, y, onEdit, onClose,
}: TokenContextMenuProps): JSX.Element {
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  async function handleDelete(): Promise<void> {
    try {
      await apiDeleteToken(tokenId);
      dispatch(removeToken(tokenId));
    } catch {
      // server error — ignore optimistic; resync will correct
    }
    onClose();
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, background: '#1a1a2e',
    border: '1px solid #333', borderRadius: 6, padding: '4px 0',
    zIndex: 2000, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  };
  const itemStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '8px 16px', background: 'none',
    border: 'none', color: '#f5f5f7', fontSize: 13, cursor: 'pointer', textAlign: 'left',
  };

  return (
    <div ref={ref} style={menuStyle}>
      <button style={itemStyle} onClick={() => { onEdit(); onClose(); }}>Редагувати</button>
      <button style={{ ...itemStyle, color: '#ff6b6b' }} onClick={() => void handleDelete()}>
        Видалити
      </button>
    </div>
  );
}
