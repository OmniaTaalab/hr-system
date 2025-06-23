'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentLocale, useI18n } from '@/lib/i18n';
import { Languages } from 'lucide-react';
import { setCookie } from 'cookies-next';

export function LanguageSwitcher() {
  const locale = useCurrentLocale();
  const t = useI18n();

  const changeLocale = (newLocale: 'en' | 'ar') => {
    if (newLocale !== locale) {
      setCookie('NEXT_LOCALE', newLocale, { path: '/' });
      window.location.reload();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('header.change_language')}>
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeLocale('en')} disabled={locale === 'en'}>
          {t('language.english')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLocale('ar')} disabled={locale === 'ar'}>
          {t('language.arabic')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
