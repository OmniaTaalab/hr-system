
"use client";

import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import SettingsPageWrapper from './settings-page-wrapper';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <SettingsIcon className="mr-3 h-8 w-8 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage company-wide settings for holidays, weekends, and organization structure.
        </p>
      </header>
      <SettingsPageWrapper>
        {children}
      </SettingsPageWrapper>
    </div>
  );
}
