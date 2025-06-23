'use client';

import { I18nProviderClient } from '@/lib/i18n';
import type { ReactNode } from 'react';

export function I18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>;
}
