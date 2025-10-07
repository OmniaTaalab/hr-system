

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
  syncSubjectsFromEmployeesAction,
  syncMachineNamesFromAttendanceLogsAction,
  syncReportLine1FromEmployeesAction,
  type SyncState
} from "@/app/actions/settings-actions";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/components/layout/app-layout";


const initialSyncState: SyncState = { success: false, message: null };

function SyncButton({
  label,
  action,
  isPending,
  state,
  actorDetails
}: {
  label: string;
  action: (formData: FormData) => void;
  isPending: boolean;
  state: SyncState;
  actorDetails: { id?: string, email?: string, role?: string }
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
  
  const handleAction = () => {
    const formData = new FormData();
    if(actorDetails.id) formData.append('actorId', actorDetails.id);
    if(actorDetails.email) formData.append('actorEmail', actorDetails.email);
    if(actorDetails.role) formData.append('actorRole', actorDetails.role);
    action(formData);
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <p className="font-medium">{label}</p>
      <form action={handleAction}>
        <Button size="sm" variant="secondary" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync Now
        </Button>
      </form>
    </div>
  );
}


export default function SyncDataPage() {
  const { profile } = useUserProfile();
  const actorDetails = { id: profile?.id, email: profile?.email, role: profile?.role };

  const [syncGroupState, syncGroupAction, isSyncGroupPending] = useActionState(syncGroupNamesFromEmployeesAction, initialSyncState);
  const [syncRoleState, syncRoleAction, isSyncRolePending] = useActionState(syncRolesFromEmployeesAction, initialSyncState);
  const [syncCampusState, syncCampusAction, isSyncCampusPending] = useActionState(syncCampusesFromEmployeesAction, initialSyncState);
  const [syncStageState, syncStageAction, isSyncStagePending] = useActionState(syncStagesFromEmployeesAction, initialSyncState);
  const [syncSubjectState, syncSubjectAction, isSyncSubjectPending] = useActionState(syncSubjectsFromEmployeesAction, initialSyncState);
  const [syncMachineState, syncMachineAction, isSyncMachinePending] = useActionState(syncMachineNamesFromAttendanceLogsAction, initialSyncState);
  const [syncReportLine1State, syncReportLine1Action, isSyncReportLine1Pending] = useActionState(syncReportLine1FromEmployeesAction, initialSyncState);


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
                    label="Sync Roles from Employees"
                    action={syncRoleAction}
                    isPending={isSyncRolePending}
                    state={syncRoleState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Campuses from Employees"
                    action={syncCampusAction}
                    isPending={isSyncCampusPending}
                    state={syncCampusState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Stages from Employees"
                    action={syncStageAction}
                    isPending={isSyncStagePending}
                    state={syncStageState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Subjects from Employees"
                    action={syncSubjectAction}
                    isPending={isSyncSubjectPending}
                    state={syncSubjectState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Group Names from Employees"
                    action={syncGroupAction}
                    isPending={isSyncGroupPending}
                    state={syncGroupState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Machine Names from Attendance Logs"
                    action={syncMachineAction}
                    isPending={isSyncMachinePending}
                    state={syncMachineState}
                    actorDetails={actorDetails}
                />
                <SyncButton 
                    label="Sync Report Line 1 from Employees"
                    action={syncReportLine1Action}
                    isPending={isSyncReportLine1Pending}
                    state={syncReportLine1State}
                    actorDetails={actorDetails}
                />
            </CardContent>
          </Card>
      </SettingsPageWrapper>
    </div>
  );
}
