import 'i18next';
import type common from './locales/en/common.json';
import type auth from './locales/en/auth.json';
import type room from './locales/en/room.json';
import type campaign from './locales/en/campaign.json';
import type assistant from './locales/en/assistant.json';
import type errors from './locales/en/errors.json';
import type nav from './locales/en/nav.json';
import type gameroom from './locales/en/gameroom.json';
import type landing from './locales/en/landing.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      room: typeof room;
      campaign: typeof campaign;
      assistant: typeof assistant;
      errors: typeof errors;
      nav: typeof nav;
      gameroom: typeof gameroom;
      landing: typeof landing;
    };
  }
}
