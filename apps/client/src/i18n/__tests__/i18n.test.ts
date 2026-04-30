import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import i18next from 'i18next';
import { initI18n } from '../index';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await initI18n();
  } else {
    await i18next.changeLanguage('en');
  }
});

afterAll(async () => {
  await i18next.changeLanguage('en');
});

describe('i18n', () => {
  it('initialises without error', () => {
    expect(i18next.isInitialized).toBe(true);
  });

  it('resolves EN common keys', () => {
    expect(i18next.t('btn.save', { ns: 'common' })).toBe('Save');
    expect(i18next.t('btn.cancel', { ns: 'common' })).toBe('Cancel');
    expect(i18next.t('btn.delete', { ns: 'common' })).toBe('Delete');
  });

  it('resolves EN cross-namespace keys via colon syntax', () => {
    expect(i18next.t('errors:network.rollFailed')).toBe('Roll failed');
    expect(i18next.t('campaign:initiative.nextTurnBtn')).toBe('Next Turn');
  });

  it('resolves EN interpolated key', () => {
    const result = i18next.t('campaign:initiative.roundLabel', { round: 3 });
    expect(result).toBe('Round: 3');
  });

  it('switches to UK and resolves translated keys', async () => {
    await i18next.changeLanguage('uk');
    expect(i18next.t('btn.save', { ns: 'common' })).toBe('Зберегти');
    expect(i18next.t('campaign:initiative.nextTurnBtn')).toBe('Наступний хід');
    expect(i18next.t('campaign:initiative.roundLabel', { round: 1 })).toBe('Раунд: 1');
  });

  it('switches back to EN', async () => {
    await i18next.changeLanguage('en');
    expect(i18next.t('btn.save', { ns: 'common' })).toBe('Save');
  });
});
