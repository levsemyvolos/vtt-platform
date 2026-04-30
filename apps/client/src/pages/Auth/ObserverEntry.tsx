import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { observerJoin, clearError } from '../../store/session';
import { fetchRoom } from '../../store/room';

type Props = {
  onSwitchToLogin: () => void;
};

export default function ObserverEntry({ onSwitchToLogin }: Props) {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.session);

  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!inviteCode.trim()) return 'Введіть код запрошення';
    if (name.trim().length < 2) return "Ім'я — мінімум 2 символи";
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(clearError());
    const err = validate();
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);

    const result = await dispatch(
      observerJoin({ inviteCode: inviteCode.trim(), name: name.trim() }),
    );

    if (observerJoin.fulfilled.match(result)) {
      void dispatch(fetchRoom(result.payload.roomId));
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="auth-form">
      <h1>Вхід як Спостерігач</h1>
      <form onSubmit={(e) => void handleSubmit(e)} aria-label="форма спостерігача">
        <div className="field">
          <label htmlFor="obs-code">Код запрошення</label>
          <input
            id="obs-code"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="obs-name">{"Ваше ім'я"}</label>
          <input
            id="obs-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        {displayError && (
          <p role="alert" className="error">
            {displayError}
          </p>
        )}
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Підключення…' : 'Підключитись'}
        </button>
      </form>
      <button type="button" onClick={onSwitchToLogin}>
        Назад до входу
      </button>
    </div>
  );
}
