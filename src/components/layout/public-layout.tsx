
"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from './app-provider';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { usePathname } from 'next/navigation';

interface PublicLayoutProps {
  children: React.ReactNode;
}

function PublicHeader() {
  const { user, loading } = useApp();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center space-x-2">
           <Icons.NisLogo className="h-8 w-8" />
           <span className="font-headline text-lg font-bold">HR Assistant</span>
        </Link>
        <nav>
          {loading ? null : user ? (
            <Button asChild>
              <Link href="/">Dashboard</Link>
            </Button>
          ) : (
             <Button asChild variant="secondary">
                <Link href={`/login?redirect=${pathname}`}>Login</Link>
            </Button>
          )}
        </nav>
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
