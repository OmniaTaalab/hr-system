
"use client";

import React from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
          Manage user roles and permissions for the application.
        </p>
      </header>
       <SettingsPageWrapper>
          <Card>
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>
                Define roles and assign permissions to control access to different parts of the system.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                <h3 className="text-xl font-semibold">Coming Soon</h3>
                <p className="mt-2">Access control management will be available here.</p>
              </div>
            </CardContent>
          </Card>
      </SettingsPageWrapper>
    </div>
  );
}
