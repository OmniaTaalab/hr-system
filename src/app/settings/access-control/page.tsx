
"use client";

import React from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Shield } from 'lucide-react';

export default function AccessControlPage() {
  return (
    <div className="space-y-8">
       <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <Shield className="mr-3 h-8 w-8 text-primary" />
          Access Control
        </h1>
        <p className="text-muted-foreground">
          Manage user roles and permissions across the application.
        </p>
      </header>
       <SettingsPageWrapper>
        <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Access Control Panel</h3>
            <p className="mt-2">This section is under construction. Role and permission management will be available here.</p>
        </div>
      </SettingsPageWrapper>
    </div>
  );
}
