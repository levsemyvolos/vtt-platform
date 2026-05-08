import { describe, it, expect } from 'vitest';
import { parseChatCommand } from './chatCommands';

describe('parseChatCommand', () => {
  // --- plain text ---
  it('returns plain for normal text', () => {
    expect(parseChatCommand('hello')).toEqual({ kind: 'plain', text: 'hello' });
  });

  it('returns plain for empty string', () => {
    expect(parseChatCommand('')).toEqual({ kind: 'plain', text: '' });
  });

  // --- /roll ---
  it('/roll 2d6 → kind=roll, expression=2d6, mode=normal, secret=false', () => {
    expect(parseChatCommand('/roll 2d6')).toEqual({
      kind: 'roll',
      expression: '2d6',
      mode: 'normal',
      secret: false,
    });
  });

  it('/roll 1d20+5 adv → mode=advantage, secret=false', () => {
    expect(parseChatCommand('/roll 1d20+5 adv')).toEqual({
      kind: 'roll',
      expression: '1d20+5',
      mode: 'advantage',
      secret: false,
    });
  });

  it('/roll 2d6 dis → mode=disadvantage, secret=false', () => {
    expect(parseChatCommand('/roll 2d6 dis')).toEqual({
      kind: 'roll',
      expression: '2d6',
      mode: 'disadvantage',
      secret: false,
    });
  });

  it('/roll 1d20 secret → mode=normal, secret=true', () => {
    expect(parseChatCommand('/roll 1d20 secret')).toEqual({
      kind: 'roll',
      expression: '1d20',
      mode: 'normal',
      secret: true,
    });
  });

  it('/roll 1d20 adv secret → mode=advantage, secret=true', () => {
    expect(parseChatCommand('/roll 1d20 adv secret')).toEqual({
      kind: 'roll',
      expression: '1d20',
      mode: 'advantage',
      secret: true,
    });
  });

  it('/roll 1d20 secret adv → mode=advantage, secret=true (order-independent)', () => {
    expect(parseChatCommand('/roll 1d20 secret adv')).toEqual({
      kind: 'roll',
      expression: '1d20',
      mode: 'advantage',
      secret: true,
    });
  });

  it('/roll 1d20 dis secret → mode=disadvantage, secret=true', () => {
    expect(parseChatCommand('/roll 1d20 dis secret')).toEqual({
      kind: 'roll',
      expression: '1d20',
      mode: 'disadvantage',
      secret: true,
    });
  });

  it('/roll 1d20 adv dis → invalid (conflicting modifiers)', () => {
    expect(parseChatCommand('/roll 1d20 adv dis')).toEqual({
      kind: 'invalid',
      reason: 'roll-syntax',
    });
  });

  it('/roll 1d20 unknownword → invalid roll-syntax', () => {
    expect(parseChatCommand('/roll 1d20 unknownword')).toEqual({
      kind: 'invalid',
      reason: 'roll-syntax',
    });
  });

  it('/roll abc → invalid roll-syntax', () => {
    expect(parseChatCommand('/roll abc')).toEqual({
      kind: 'invalid',
      reason: 'roll-syntax',
    });
  });

  it('/roll (no expression) → invalid roll-syntax', () => {
    expect(parseChatCommand('/roll')).toEqual({
      kind: 'invalid',
      reason: 'roll-syntax',
    });
  });

  // --- /w ---
  it('/w alice hi there → recipientQuery=alice, text=hi there', () => {
    expect(parseChatCommand('/w alice hi there')).toEqual({
      kind: 'whisper',
      recipientQuery: 'alice',
      text: 'hi there',
    });
  });

  it('/w alice (no text) → invalid whisper-empty', () => {
    expect(parseChatCommand('/w alice')).toEqual({
      kind: 'invalid',
      reason: 'whisper-empty',
    });
  });

  it('/w (no args) → invalid whisper-empty', () => {
    expect(parseChatCommand('/w')).toEqual({
      kind: 'invalid',
      reason: 'whisper-empty',
    });
  });

  // --- /ooc ---
  it('/ooc lol → ooc with text=lol', () => {
    expect(parseChatCommand('/ooc lol')).toEqual({
      kind: 'ooc',
      text: 'lol',
    });
  });

  it('/ooc (no text) → invalid ooc-empty', () => {
    expect(parseChatCommand('/ooc')).toEqual({
      kind: 'invalid',
      reason: 'ooc-empty',
    });
  });

  // --- /me ---
  it('/me waves → me with text=waves', () => {
    expect(parseChatCommand('/me waves')).toEqual({
      kind: 'me',
      text: 'waves',
    });
  });

  it('/me (no text) → invalid me-empty', () => {
    expect(parseChatCommand('/me')).toEqual({
      kind: 'invalid',
      reason: 'me-empty',
    });
  });

  // --- unknown command ---
  it('/foo bar → plain (unknown command)', () => {
    expect(parseChatCommand('/foo bar')).toEqual({
      kind: 'plain',
      text: '/foo bar',
    });
  });
});
