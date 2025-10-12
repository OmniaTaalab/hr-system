
"use client";

import { ListManager } from '@/components/settings/list-manager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SettingsPageWrapper from '../settings-page-wrapper';
import { Settings as SettingsIcon } from 'lucide-react';

export default function OrganizationSettingsPage() {
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Lists</CardTitle>
              <CardDescription>Manage lists for roles, groups, and other organizational units used across the application.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ListManager title="Roles" collectionName="roles" />
              <ListManager title="Group Names" collectionName="groupNames" />
              <ListManager title="Stages" collectionName="stage" />
              <ListManager title="Systems" collectionName="systems" />
              <ListManager title="Campuses" collectionName="campuses" />
              <ListManager title="Subjects" collectionName="subjects" />
              <ListManager title="Leave Types" collectionName="leaveTypes" />
              <ListManager title="Report Line 1" collectionName="reportLines1" />
              <ListManager title="Report Line 2" collectionName="reportLine2" />
            </CardContent>
          </Card>
        </div>
      </SettingsPageWrapper>
    </div>
  );
}
