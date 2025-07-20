
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsForms } from '@/components/settings/settings-loader';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Settings as SettingsIcon } from 'lucide-react';


export default function GeneralSettingsPage() {
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
         <React.Suspense fallback={<SettingsSkeleton />}>
          <SettingsForms />
        </React.Suspense>
      </SettingsPageWrapper>
    </div>
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
