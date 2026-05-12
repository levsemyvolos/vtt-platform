import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Check, ChevronDown, Film, PanelRightClose, PanelRightOpen, RotateCw } from 'lucide-react';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { activateScene, loadScenes } from '../../store/scenes';
import { endSession } from '../../store/room';
import { logout, selectIsObserver } from '../../store/session';
import { addToast } from '../../store/toast';
import { toggleSoundMuted } from '../../store/notifications';
import { peerManagerRef } from '../../infrastructure/webrtc/peerManagerRef';
import { Logo, Badge, Avatar, IconButton } from '../ui';
import ThemeToggle from '../Header/ThemeToggle';
import LanguageSwitcher from '../Header/LanguageSwitcher';
import { useWssConnected } from '../../api/useWssConnected';
import styles from './GameRoomTopBar.module.css';

interface GameRoomTopBarProps {
  myRole: Role;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

// eslint-disable-next-line complexity
export default function GameRoomTopBar({ myRole, sidebarCollapsed, onToggleSidebar }: GameRoomTopBarProps): JSX.Element {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation('gameroom');
  const { t: tRoom } = useTranslation('room');

  const currentRoom = useAppSelector((s) => s.room.currentRoom);
  const currentUser = useAppSelector((s) => s.session.currentUser);
  const members = useAppSelector((s) => s.room.members);
  const sceneList = useAppSelector((s) => s.scenes.list);
  const activeScene = useAppSelector((s) => s.scene.current);
  const wssConnected = useWssConnected();
  const isObserver = useAppSelector(selectIsObserver);
  const callJoined = useAppSelector((s) => s.media.callJoined);
  const soundMuted = useAppSelector((s) => s.notifications.soundMuted);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const sceneMenuRef = useRef<HTMLDivElement>(null);

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
    document.addEventListener('click', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Scene popover — same click-outside/Escape pattern.
  useEffect(() => {
    if (!sceneMenuOpen) return;
    const onMouseDown = (e: MouseEvent): void => {
      if (sceneMenuRef.current && !sceneMenuRef.current.contains(e.target as Node)) {
        setSceneMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSceneMenuOpen(false);
    };
    document.addEventListener('click', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sceneMenuOpen]);

  useEffect(() => {
    if (currentRoom?.id) {
      void dispatch(loadScenes(currentRoom.id));
    }
  }, [currentRoom?.id, dispatch]);

  function handleBack(): void {
    if (isObserver) {
      void dispatch(logout());
    } else {
      // Clear sessionActive so RoomLobbyRoute doesn't bounce back to /session
      dispatch(endSession());
      navigate(`/rooms/${currentRoom?.id ?? ''}`);
    }
  }

  function handleSceneChange(sceneId: string): void {
    if (myRole !== 'GM') return;
    setSceneMenuOpen(false);
    if (sceneId === activeScene?.id) return;
    void dispatch(activateScene(sceneId));
  }

  function handleReconnect(): void {
    const manager = peerManagerRef.current;
    if (!manager || !currentUser) return;
    // Hard reconnect (close + re-call) — mimics F5 so peers that never
    // connected on first try, or roster gaps, get a clean negotiation pass.
    // ICE restart alone (the previous behaviour) only helps already-paired
    // peers and missed first-connect failures entirely.
    const memberIds = members.map((m) => m.userId);
    manager.fullReconnect(memberIds);
    dispatch(addToast('info', t('topBar.reconnectToast')));
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
          aria-label={isObserver ? t('topBar.logout') : t('topBar.dashboardLabel')}
        >
          <Logo size={28} />
        </button>
        <span className={styles.sep} aria-hidden>·</span>
        <span className={styles.roomName}>{currentRoom?.name ?? ''}</span>

        {sceneList.length > 0 && (
          <>
            <span className={styles.sep} aria-hidden>·</span>
            <div className={styles.sceneDropdownWrap} ref={sceneMenuRef}>
              <Film size={12} className={styles.sceneIcon} aria-hidden />
              <span className={styles.sceneLabel}>{t('topBar.sceneLabel')}</span>
              {myRole === 'GM' ? (
                <>
                  <button
                    type="button"
                    className={styles.sceneTrigger}
                    onClick={() => setSceneMenuOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={sceneMenuOpen}
                    aria-label={t('topBar.sceneLabel')}
                  >
                    <span className={styles.sceneTriggerText}>
                      {activeScene?.name ?? t('topBar.noScene')}
                    </span>
                    <ChevronDown
                      size={12}
                      className={`${styles.sceneChevron} ${sceneMenuOpen ? styles.sceneChevronOpen : ''}`}
                      aria-hidden
                    />
                  </button>
                  {sceneMenuOpen && (
                    <div className={styles.sceneListbox} role="listbox">
                      {sceneList.map((s) => {
                        const isActive = s.id === activeScene?.id;
                        return (
                          <button
                            type="button"
                            key={s.id}
                            role="option"
                            aria-selected={isActive}
                            className={`${styles.sceneOption} ${isActive ? styles.sceneOptionActive : ''}`}
                            onClick={() => handleSceneChange(s.id)}
                          >
                            <span className={styles.sceneOptionCheck} aria-hidden>
                              {isActive && <Check size={12} />}
                            </span>
                            <span className={styles.sceneOptionLabel}>{s.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <span className={styles.sceneTriggerReadOnly}>
                  {activeScene?.name ?? t('topBar.noScene')}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.right}>
        <IconButton
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t('topBar.showSidebar') : t('topBar.hideSidebar')}
          aria-label={sidebarCollapsed ? t('topBar.showSidebar') : t('topBar.hideSidebar')}
        >
          {sidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </IconButton>
        {callJoined && (
          <IconButton
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            title={t('topBar.reconnect')}
            aria-label={t('topBar.reconnect')}
          >
            <RotateCw size={16} />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="sm"
          onClick={() => dispatch(toggleSoundMuted())}
          aria-label={t(soundMuted ? 'topBar.unmuteNotifications' : 'topBar.muteNotifications')}
          title={t(soundMuted ? 'topBar.unmuteNotifications' : 'topBar.muteNotifications')}
        >
          {soundMuted ? <BellOff size={16} /> : <Bell size={16} />}
        </IconButton>
        <span
          className={`${styles.wssDot} ${wssConnected ? styles.wssOnline : styles.wssOffline}`}
          title={wssConnected ? t('topBar.wssHealthOnline') : t('topBar.wssHealthOffline')}
          aria-label={wssConnected ? t('topBar.wssHealthOnline') : t('topBar.wssHealthOffline')}
          role="img"
        />
        <span className={styles.wssLabel} aria-hidden>WSS</span>
        <span className={styles.sep} aria-hidden>·</span>
        <LanguageSwitcher />
        <ThemeToggle />
        <span className={styles.sep} aria-hidden>·</span>

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
