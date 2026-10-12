
"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from './app-provider';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { usePathname } from 'next/navigation';
import { Skeleton } from '../ui/skeleton';

import { useI18n } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/language-switcher';

interface PublicLayoutProps {
  children: React.ReactNode;
}

function PublicHeader() {
  const { user, loading } = useApp();
  const { t, isRTL } = useI18n();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
           <Icons.NisLogo className="h-8 w-8" />
           <span className="font-headline text-lg font-bold">
             {isRTL ? "بوابة الموارد البشرية" : "HR Portal"}
           </span>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="header" />
          <nav>
            {loading ? (
               <Skeleton className="h-10 w-24 rounded-md" />
            ) : user ? (
              <Button asChild>
                <Link href="/">{t("sidebar.dashboard", "Dashboard")}</Link>
              </Button>
            ) : (
               <Button asChild variant="secondary">
                  <Link href={`/login?redirect=${pathname}`}>{t("auth.sign_in", "Login")}</Link>
              </Button>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}


export function PublicLayout({ children }: PublicLayoutProps) {
  return (
      <div className="relative flex min-h-screen flex-col bg-background">
          <PublicHeader />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
              {children}
          </main>
      </div>
  );
}
