
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/components/layout/app-layout';
import { Loader2, AlertTriangle } from 'lucide-react';

const settingsNavItems = [
  { title: "Access Control", href: "/settings/access-control"},
  { title: "General", href: "/settings/general" },
  { title: "Organization", href: "/settings/organization" },
  { title: "Sync Data", href: "/settings/sync-data" },
];

export default function SettingsPageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useUserProfile();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const userRole = profile?.role?.toLowerCase();
  const canViewSettings = userRole === 'admin' || userRole === 'hr';

  if (!canViewSettings) {
    // We check in a useEffect to avoid server-side render issues with router.
    React.useEffect(() => {
        router.replace('/');
    }, [router]);
    
    // Render a loading/access denied state while redirecting
    return (
      <div className="flex justify-center items-center h-full flex-col gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
      <aside className="-mx-4 lg:w-1/5">
        <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
          {settingsNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground px-4 py-2",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "bg-transparent",
                "justify-start"
              )}
            >
              {item.title}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 lg:max-w-4xl">{children}</div>
    </div>
  );
}
