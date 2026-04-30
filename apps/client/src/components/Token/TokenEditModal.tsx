import { useState, useEffect } from 'react';
import type { StatusMarker } from '@vtt/shared';
import { ALL_STATUS_MARKERS } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { upsertToken } from '../../store/scene';
import { apiUpdateToken } from '../../api/scenes';

const COLOR_PRESETS = [
  '#7c5cff', '#ff6b6b', '#51cf66', '#339af0',
  '#ffd43b', '#f76707', '#cc5de8', '#495057',
];

interface TokenEditModalProps {
  tokenId: string;
  onClose: () => void;
}

export default function TokenEditModal({ tokenId, onClose }: TokenEditModalProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.scene.current?.tokens.find((t) => t.id === tokenId));
  const members = useAppSelector((s) => s.room.members);

  const [name, setName] = useState('');
  const [hp, setHp] = useState('');
  const [maxHp, setMaxHp] = useState('');
  const [color, setColor] = useState('#7c5cff');
  const [markers, setMarkers] = useState<StatusMarker[]>([]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setName(token.name);
    setHp(token.hp != null ? String(token.hp) : '');
    setMaxHp(token.maxHp != null ? String(token.maxHp) : '');
    setColor(token.color ?? '#7c5cff');
    setMarkers((token.statusMarkers ?? []) as StatusMarker[]);
    setAssignedUserId(token.assignedUserId ?? '');
  }, [token]);

  if (!token) return null;

  function toggleMarker(m: StatusMarker): void {
    setMarkers((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiUpdateToken(tokenId, {
        name: name.trim() || token!.name,
        hp: hp !== '' ? Number(hp) : null,
        maxHp: maxHp !== '' ? Number(maxHp) : null,
        color,
        statusMarkers: markers,
        assignedUserId: assignedUserId || null,
      });
      dispatch(upsertToken(updated));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 24, width: 360, color: '#f5f5f7' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Редагувати токен</h3>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Назва</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px',
              background: '#0f0f1a', border: '1px solid #333', borderRadius: 4, color: '#f5f5f7' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>HP</span>
            <input type="number" value={hp} onChange={(e) => setHp(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px',
                background: '#0f0f1a', border: '1px solid #333', borderRadius: 4, color: '#f5f5f7' }} />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Max HP</span>
            <input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px',
                background: '#0f0f1a', border: '1px solid #333', borderRadius: 4, color: '#f5f5f7' }} />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 6 }}>Колір</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '3px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 6 }}>Статуси</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ALL_STATUS_MARKERS.map((m) => (
              <button
                key={m}
                onClick={() => toggleMarker(m)}
                style={{
                  padding: '3px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                  background: markers.includes(m) ? '#7c5cff' : '#333',
                  color: '#f5f5f7', border: 'none',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Призначений гравець</span>
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px',
              background: '#0f0f1a', border: '1px solid #333', borderRadius: 4, color: '#f5f5f7' }}
          >
            <option value="">— не призначено —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name} ({m.role})</option>
            ))}
          </select>
        </label>

        {error && <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 6, background: '#333', border: 'none',
              color: '#f5f5f7', cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={() => void handleSave()} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 6, background: '#7c5cff', border: 'none',
              color: '#fff', cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}
