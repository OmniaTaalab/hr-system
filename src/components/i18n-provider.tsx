'use client';

import { I18nProviderClient } from '@/lib/i18n';
import { getCookie } from 'cookies-next';
import { useEffect, useState, type ReactNode } from 'react';

export function I18nProvider({ children }: { children: ReactNode }) {
  // On the server and for the initial client render, default to 'en' to prevent hydration mismatch.
  const [locale, setLocale] = useState('en');

  // After the component mounts on the client, check the cookie and update the locale.
  useEffect(() => {
    const cookieLocale = getCookie('NEXT_LOCALE');
    if (typeof cookieLocale === 'string' && ['en', 'ar'].includes(cookieLocale)) {
      setLocale(cookieLocale as 'en' | 'ar');
    }
  }, []); // Empty dependency array ensures this runs only once on mount.

  useEffect(() => {
    // This effect ensures the document direction and lang are set correctly on the client side.
    if (typeof window !== 'undefined') {
        document.documentElement.lang = locale;
        document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    }
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

  return <I18nProviderClient locale={locale} key={locale}>{children}</I18nProviderClient>;
}
