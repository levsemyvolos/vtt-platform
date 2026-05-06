import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { TurnConfigProvider } from '../../src/services/TurnConfigProvider.js';

describe('TurnConfigProvider', () => {
  it('returns STUN-only bundle when TURN host is unconfigured', () => {
    const provider = new TurnConfigProvider();
    const { iceServers } = provider.getIceServers('user-1');
    expect(iceServers).toHaveLength(1);
    expect(iceServers[0]?.urls).toBe('stun:stun.l.google.com:19302');
  });

  it('issues HMAC-SHA1 username/credential per RFC 7635', () => {
    const secret = 'test-secret-32-bytes-long-aaaaaa';
    const provider = new TurnConfigProvider({
      turnHost: 'turn.vtt.example.com',
      staticAuthSecret: secret,
      ttlSeconds: 3600,
    });
    const fixedNow = 1_700_000_000_000;
    const { iceServers, ttlSecondsRemaining } = provider.getIceServers('user-42', fixedNow);

    expect(ttlSecondsRemaining).toBe(3600);
    expect(iceServers).toHaveLength(2);

    const turnEntry = iceServers[1];
    const expectedExpiry = Math.floor(fixedNow / 1000) + 3600;
    expect(turnEntry?.username).toBe(`${expectedExpiry}:user-42`);

    const expectedCredential = createHmac('sha1', secret)
      .update(`${expectedExpiry}:user-42`)
      .digest('base64');
    expect(turnEntry?.credential).toBe(expectedCredential);
  });

  it('emits RFC-7065-compliant turn:udp and turns:tcp URIs', () => {
    const provider = new TurnConfigProvider({
      turnHost: 'turn.vtt.example.com',
      staticAuthSecret: 's',
    });
    const { iceServers } = provider.getIceServers('u');
    const urls = iceServers[1]?.urls as string[];
    expect(Array.isArray(urls)).toBe(true);
    // Exact format — no extra query params (realm must not appear per RFC 7065)
    expect(urls[0]).toBe('turn:turn.vtt.example.com:3478?transport=udp');
    expect(urls[1]).toBe('turns:turn.vtt.example.com:5349?transport=tcp');
  });

  it('produces deterministic credentials within the same second', () => {
    const provider = new TurnConfigProvider({
      turnHost: 'turn.example.com',
      staticAuthSecret: 'k',
    });
    const t = 1_700_000_000_000;
    const a = provider.getIceServers('u', t);
    const b = provider.getIceServers('u', t);
    expect(a.iceServers[1]?.credential).toBe(b.iceServers[1]?.credential);
  });
});
