import 'i18next';
import type common from './locales/en/common.json';
import type auth from './locales/en/auth.json';
import type room from './locales/en/room.json';
import type campaign from './locales/en/campaign.json';
import type assistant from './locales/en/assistant.json';
import type errors from './locales/en/errors.json';

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
    };
  }
}
