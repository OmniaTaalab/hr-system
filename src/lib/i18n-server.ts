
import { createI18nServer } from 'next-international/server';

export const { getI18n, getScopedI18n, getCurrentLocale } = createI18nServer({
  en: () => import('@/lib/locales/en'),
  ar: () => import('@/lib/locales/ar'),
});
