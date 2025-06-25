
"use client";

import { ListManager } from '@/components/settings/list-manager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrganizationSettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Lists</CardTitle>
          <CardDescription>Manage lists for roles, groups, and other organizational units used across the application.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListManager title="Roles" collectionName="roles" />
          <ListManager title="Group Names" collectionName="groupNames" />
          <ListManager title="Systems" collectionName="systems" />
          <ListManager title="Campuses" collectionName="campuses" />
          <ListManager title="Leave Types" collectionName="leaveTypes" />
        </CardContent>
      </Card>
    </div>
  );
}
