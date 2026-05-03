import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { activateScene, loadScenes } from '../../store/scenes';
import { logout, selectIsObserver } from '../../store/session';
import { Logo, Badge, Avatar } from '../ui';
import ThemeToggle from '../Header/ThemeToggle';
import LanguageSwitcher from '../Header/LanguageSwitcher';
import { getSocket } from '../../api/socket';
import styles from './GameRoomTopBar.module.css';

interface GameRoomTopBarProps {
  myRole: Role;
}

function useWssConnected(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let sock: ReturnType<typeof getSocket>;
    try {
      sock = getSocket();
    } catch {
      return;
    }
    setConnected(sock.connected);
    const onConnect = (): void => setConnected(true);
    const onDisconnect = (): void => setConnected(false);
    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
    };
  }, []);
  return connected;
}

export default function GameRoomTopBar({ myRole }: GameRoomTopBarProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');
  const { t: tRoom } = useTranslation('room');

  const currentRoom = useAppSelector((s) => s.room.currentRoom);
  const currentUser = useAppSelector((s) => s.session.currentUser);
  const sceneList = useAppSelector((s) => s.scenes.list);
  const activeScene = useAppSelector((s) => s.scene.current);
  const wssConnected = useWssConnected();
  const isObserver = useAppSelector(selectIsObserver);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown on click-outside or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (currentRoom?.id) {
      void dispatch(loadScenes(currentRoom.id));
    }
  }, [currentRoom?.id, dispatch]);

  function handleBack(): void {
    // Observers have no Dashboard to return to — dispatch logout instead.
    if (isObserver) {
      void dispatch(logout());
    } else {
      dispatch(clearRoom());
    }
  }

  function handleSceneChange(sceneId: string): void {
    if (myRole === 'GM') {
      void dispatch(activateScene(sceneId));
    }
  }

  function handleLogout(): void {
    dispatch(logout());
    setMenuOpen(false);
  }

  return (
    <header className={styles.topBar} role="banner">
      <div className={styles.left}>
        <button
          type="button"
          className={styles.logoBtn}
          onClick={handleBack}
          aria-label={isObserver ? t('topBar.logout') : 'Dashboard'}
        >
          <Logo size={28} />
        </button>
        <span className={styles.sep} aria-hidden>/</span>
        <span className={styles.breadcrumb}>{t('topBar.breadcrumb')}</span>
        <span className={styles.sep} aria-hidden>/</span>
        <span className={styles.roomName}>{currentRoom?.name ?? ''}</span>

        {sceneList.length > 0 && (
          <div className={styles.sceneDropdownWrap}>
            <Film size={14} className={styles.sceneIcon} aria-hidden />
            <select
              className={styles.sceneSelect}
              value={activeScene?.id ?? ''}
              onChange={(e) => handleSceneChange(e.target.value)}
              aria-label={t('topBar.noScene')}
              disabled={myRole !== 'GM'}
            >
              {!activeScene && (
                <option value="" disabled>
                  {t('topBar.noScene')}
                </option>
              )}
              {sceneList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={styles.right}>
        <span
          className={`${styles.wssDot} ${wssConnected ? styles.wssOnline : styles.wssOffline}`}
          title={wssConnected ? t('topBar.wssHealthOnline') : t('topBar.wssHealthOffline')}
          aria-label={wssConnected ? t('topBar.wssHealthOnline') : t('topBar.wssHealthOffline')}
        />
        <span className={styles.wssLabel} aria-hidden>WSS</span>

        <Badge variant="role">
          {tRoom(`roles.${myRole}`)}
        </Badge>

        <div className={styles.avatarWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.avatarBtn}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Avatar
              name={currentUser?.name ?? '?'}
              size="sm"
            />
          </button>
          {menuOpen && (
            <div className={styles.dropdown} role="menu">
              <div className={styles.menuSection}>
                <ThemeToggle />
              </div>
              <div className={styles.menuSection}>
                <LanguageSwitcher />
              </div>
              <button
                type="button"
                className={styles.menuItem}
                onClick={handleLogout}
                role="menuitem"
              >
                {t('topBar.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
