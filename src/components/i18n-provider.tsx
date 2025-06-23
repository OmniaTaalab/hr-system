'use client';

import { I18nProviderClient } from '@/lib/i18n';
import { getCookie } from 'cookies-next';
import { useEffect, useState, type ReactNode } from 'react';

export function I18nProvider({ children }: { children: ReactNode }) {
  // Get initial locale from cookie or default to 'en'
  const [locale, setLocale] = useState(() => {
    // On the server, default to 'en' to avoid mismatch errors during hydration.
    if (typeof window === 'undefined') return 'en';
    
    const cookieLocale = getCookie('NEXT_LOCALE');
    return typeof cookieLocale === 'string' && ['en', 'ar'].includes(cookieLocale) ? cookieLocale : 'en';
  });

  useEffect(() => {
    // This effect ensures the document direction and lang are set correctly on the client side.
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  
  // This effect listens for cookie changes from other tabs
  useEffect(() => {
    const handleStorageChange = () => {
      const cookieLocale = getCookie('NEXT_LOCALE');
      if (typeof cookieLocale === 'string' && ['en', 'ar'].includes(cookieLocale)) {
        if (locale !== cookieLocale) {
            // Reload the page to apply the new language from another tab
            window.location.reload();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [locale]);

  return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>;
}
