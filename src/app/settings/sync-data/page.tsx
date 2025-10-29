
"use client";

import React, { useActionState, useEffect } from "react";
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import {
  syncGroupNamesFromEmployeesAction,
  syncRolesFromEmployeesAction,
  syncCampusesFromEmployeesAction,
  syncStagesFromEmployeesAction,
  syncSubjectsFromEmployeesAction,
  syncMachineNamesFromAttendanceLogsAction,
  syncReportLine1FromEmployeesAction,
  syncReportLine2FromEmployeesAction,
  correctAttendanceNamesAction,
  type SyncState,
  type CorrectionState,
} from "@/app/actions/settings-actions";
import { 
    deduplicateEmployeesAction,
    type DeduplicationState 
} from "@/lib/firebase/admin-actions";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/components/layout/app-layout";


const initialSyncState: SyncState = { success: false, message: null };
const initialCorrectionState: CorrectionState = { success: false, message: null };
const initialDeduplicationState: DeduplicationState = { success: false, message: null };


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

function CorrectionButton({
  label,
  description,
  action,
  isPending,
  state,
  actorDetails
}: {
  label: string;
  description: string;
  action: (formData: FormData) => void;
  isPending: boolean;
  state: CorrectionState | DeduplicationState;
  actorDetails: { id?: string, email?: string, role?: string }
}) {
    const { toast } = useToast();
  
    useEffect(() => {
        if (state?.message) {
            toast({
                title: state.success ? "Action Successful" : "Action Failed",
                description: state.message,
                variant: state.success ? "default" : "destructive",
                duration: 10000,
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
        <Card>
            <CardHeader>
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <form action={handleAction}>
                    <Button variant="outline" disabled={isPending}>
                         {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Run Action
                    </Button>
                </form>
                 {state?.errors?.form && (
                    <p className="mt-2 text-sm text-destructive flex items-center">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {state.errors.form.join(', ')}
                    </p>
                )}
            </CardContent>
        </Card>
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
  const [syncReportLine2State, syncReportLine2Action, isSyncReportLine2Pending] = useActionState(syncReportLine2FromEmployeesAction, initialSyncState);
  const [correctionState, correctionAction, isCorrectionPending] = useActionState(correctAttendanceNamesAction, initialCorrectionState);
  const [deduplicationState, deduplicationAction, isDeduplicationPending] = useActionState(deduplicateEmployeesAction, initialDeduplicationState);
  

  return (
    <div className="space-y-8">
       <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            Sync Data
          </h1>
          <p className="text-muted-foreground">
            Manually synchronize lists and perform data corrections.
          </p>
      </header>
       <SettingsPageWrapper>
        <div className="space-y-8">
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
                    isPending={isSyncRolesPending}
                    state={syncRolesState}
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
                    state={syncStagesState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label="Sync Subjects from Employees"
                    action={syncSubjectAction}
                    isPending={isSyncSubjectPending}
                    state={syncSubjectsState}
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
                <SyncButton 
                    label="Sync Report Line 2 from Employees"
                    action={syncReportLine2Action}
                    isPending={isSyncReportLine2Pending}
                    state={syncReportLine2State}
                    actorDetails={actorDetails}
                />
            </CardContent>
          </Card>
          
          <CorrectionButton
            label="Correct Attendance Log Names"
            description="Scans recent attendance logs and corrects entries where the employee name was recorded as a numeric ID instead of their actual name. This is useful for cleaning up data from certain attendance machines."
            action={correctionAction}
            isPending={isCorrectionPending}
            state={correctionState}
            actorDetails={actorDetails}
           />
           <CorrectionButton
            label="Remove Duplicate Employees"
            description="Scans all employee records and removes duplicates based on either the same Employee ID or the same email address, keeping only the most recently created record."
            action={deduplicationAction}
            isPending={isDeduplicationPending}
            state={deduplicationState}
            actorDetails={actorDetails}
           />

        </div>
      </SettingsPageWrapper>
    </div>
  );
}
