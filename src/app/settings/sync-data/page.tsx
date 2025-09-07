
"use client";

import React, { useActionState, useEffect } from "react";
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import {
  syncGroupNamesFromEmployeesAction,
  syncRolesFromEmployeesAction,
  syncCampusesFromEmployeesAction,
  syncStagesFromEmployeesAction,
  syncMachineNamesFromAttendanceLogsAction,
  syncSubjectsFromEmployeesAction,
  type SyncState
} from "@/app/actions/settings-actions";
import { useToast } from "@/hooks/use-toast";

const initialSyncState: SyncState = { success: false, message: null };

function SyncButton({
  label,
  action,
  isPending,
  state,
}: {
  label: string;
  action: () => void;
  isPending: boolean;
  state: SyncState;
}) {
  const { toast } = useToast();
  
  useEffect(() => {
    if (state?.message) {
      toast({
        title: state.success ? "Sync Complete" : "Sync Failed",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
    }
  }, [state, toast]);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <p className="font-medium">{label}</p>
      <form action={action}>
        <Button size="sm" variant="secondary" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync Now
        </Button>
      </form>
    </div>
  );
}


export default function SyncDataPage() {
  const [syncGroupState, syncGroupAction, isSyncGroupPending] = useActionState(syncGroupNamesFromEmployeesAction, initialSyncState);
  const [syncRoleState, syncRoleAction, isSyncRolePending] = useActionState(syncRolesFromEmployeesAction, initialSyncState);
  const [syncCampusState, syncCampusAction, isSyncCampusPending] = useActionState(syncCampusesFromEmployeesAction, initialSyncState);
  const [syncStageState, syncStageAction, isSyncStagePending] = useActionState(syncStagesFromEmployeesAction, initialSyncState);
  const [syncMachineState, syncMachineAction, isSyncMachinePending] = useActionState(syncMachineNamesFromAttendanceLogsAction, initialSyncState);
  const [syncSubjectState, syncSubjectAction, isSyncSubjectPending] = useActionState(syncSubjectsFromEmployeesAction, initialSyncState);


  return (
    <div className="space-y-8">
       <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            Sync Data
          </h1>
          <p className="text-muted-foreground">
            Manually synchronize lists from source collections to improve application performance.
          </p>
      </header>
       <SettingsPageWrapper>
          <Card>
            <CardHeader>
              <CardTitle>Data Synchronization</CardTitle>
              <CardDescription>
                Run these actions to update dropdown lists from your main data sources. This is useful if you have bulk-imported data
                and want to ensure all options are available in forms and filters across the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <SyncButton 
                    label="Sync Machine Names from Attendance"
                    action={syncMachineAction}
                    isPending={isSyncMachinePending}
                    state={syncMachineState}
                />
                <SyncButton 
                    label="Sync Roles from Employees"
                    action={syncRoleAction}
                    isPending={isSyncRolePending}
                    state={syncRoleState}
                />
                 <SyncButton 
                    label="Sync Campuses from Employees"
                    action={syncCampusAction}
                    isPending={isSyncCampusPending}
                    state={syncCampusState}
                />
                 <SyncButton 
                    label="Sync Stages from Employees"
                    action={syncStageAction}
                    isPending={isSyncStagePending}
                    state={syncStageState}
                />
                 <SyncButton 
                    label="Sync Subjects from Employees"
                    action={syncSubjectAction}
                    isPending={isSyncSubjectPending}
                    state={syncSubjectState}
                />
                 <SyncButton 
                    label="Sync Group Names from Employees"
                    action={syncGroupAction}
                    isPending={isSyncGroupPending}
                    state={syncGroupState}
                />
            </CardContent>
          </Card>
      </SettingsPageWrapper>
    </div>
  );
}

      