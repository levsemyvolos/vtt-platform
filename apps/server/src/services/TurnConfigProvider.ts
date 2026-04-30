import { createHmac } from 'crypto';
import type { IceServer, TurnConfigResponse } from '@vtt/shared';

export interface TurnConfigOptions {
  /** Public STUN endpoint. Defaults to Google's public STUN. */
  stunUrl?: string | undefined;
  /** TURN host (e.g. `turn.vtt.example.com`). When empty, only STUN is returned. */
  turnHost?: string | undefined;
  /** TURN realm (must match `realm` in turnserver.conf). */
  turnRealm?: string | undefined;
  /** coturn `static-auth-secret` — must NOT leak to clients (HMAC only). */
  staticAuthSecret?: string | undefined;
  /** Credential lifetime, seconds. Default 1 hour per RFC 7635. */
  ttlSeconds?: number | undefined;
}

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';
const DEFAULT_TTL = 3600;

/**
 * Issues short-lived TURN credentials per RFC 7635 (REST API for TURN auth)
 * combined with coturn's `use-auth-secret` mode.
 *
 * Username scheme: `<expiry-unix-seconds>:<userId>` — coturn parses this and
 * validates the HMAC-SHA1 signature against `static-auth-secret`. Credential
 * is the base64-encoded HMAC. The shared secret never leaves the server.
 *
 * Returns `IceServer[]` (the structural form of W3C `RTCIceServer`); when no
 * TURN host is configured, only the STUN entry is returned — useful for local
 * dev where coturn is not provisioned yet (Чат 6 dev fallback).
 */
export class TurnConfigProvider {
  private readonly stunUrl: string;
  private readonly turnHost: string | undefined;
  private readonly turnRealm: string | undefined;
  private readonly secret: string | undefined;
  private readonly ttlSeconds: number;

  constructor(opts: TurnConfigOptions = {}) {
    this.stunUrl = opts.stunUrl ?? DEFAULT_STUN;
    this.turnHost = opts.turnHost?.trim() || undefined;
    this.turnRealm = opts.turnRealm?.trim() || undefined;
    this.secret = opts.staticAuthSecret?.trim() || undefined;
    this.ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL;
  }

  /**
   * Builds the ICE-server bundle for a given user. Idempotent and side-effect
   * free; the same input within the same second yields the same credential.
   */
  getIceServers(userId: string, now: number = Date.now()): TurnConfigResponse {
    const iceServers: IceServer[] = [{ urls: this.stunUrl }];

    if (this.turnHost && this.secret) {
      const expiry = Math.floor(now / 1000) + this.ttlSeconds;
      const username = `${expiry}:${userId}`;
      const credential = createHmac('sha1', this.secret).update(username).digest('base64');
      const realmSuffix = this.turnRealm ? `?realm=${encodeURIComponent(this.turnRealm)}` : '';

      iceServers.push({
        urls: [
          `turn:${this.turnHost}:3478?transport=udp${realmSuffix.replace(/^\?/, '&')}`,
          `turns:${this.turnHost}:5349?transport=tcp${realmSuffix.replace(/^\?/, '&')}`,
        ],
        username,
        credential,
      });
    }

    return { iceServers, ttlSecondsRemaining: this.ttlSeconds };
  }
}
