
"use client";

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsForms } from '@/components/settings/settings-loader';

export default function GeneralSettingsPage() {
  return (
    <React.Suspense fallback={<SettingsSkeleton />}>
      <SettingsForms />
    </React.Suspense>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-10 w-48" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="pt-4">
            <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-10 w-48" />
      </div>
      
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
