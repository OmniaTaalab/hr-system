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
  syncSystemsFromEmployeesAction,
  correctAttendanceNamesAction,
  type SyncState,
} from "@/app/actions/settings-actions";
import { 
    deduplicateEmployeesAction,
    type DeduplicationState,
} from "@/lib/firebase/admin-actions";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/components/layout/app-layout";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";


const initialSyncState: SyncState = { success: false, message: null };
const initialCorrectionState: DeduplicationState = { success: false, message: null };
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
  const { isRTL } = useI18n();
  
  useEffect(() => {
    if (state?.message) {
      toast({
        title: state.success ? (isRTL ? "تمت المزامنة" : "Sync Complete") : (isRTL ? "فشلت المزامنة" : "Sync Failed"),
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
    }
  }, [state, toast, isRTL]);
  
  const handleAction = () => {
    const formData = new FormData();
    if(actorDetails.id) formData.append('actorId', actorDetails.id);
    if(actorDetails.email) formData.append('actorEmail', actorDetails.email);
    if(actorDetails.role) formData.append('actorRole', actorDetails.role);
    action(formData);
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg gap-4">
      <p className="font-medium text-sm">{label}</p>
      <form action={handleAction}>
        <Button size="sm" variant="secondary" disabled={isPending}>
          {isPending ? <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")} /> : <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />}
          {isRTL ? "مزامنة الآن" : "Sync Now"}
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
  state: DeduplicationState;
  actorDetails: { id?: string, email?: string, role?: string }
}) {
    const { toast } = useToast();
    const { isRTL } = useI18n();
  
    useEffect(() => {
        if (state?.message) {
            toast({
                title: state.success ? (isRTL ? "نجاح العملية" : "Action Successful") : (isRTL ? "فشلت العملية" : "Action Failed"),
                description: state.message,
                variant: state.success ? "default" : "destructive",
                duration: 10000,
            });
        }
    }, [state, toast, isRTL]);

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
                         {isPending ? <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")} /> : <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />}
                        {isRTL ? "تنفيذ الإجراء" : "Run Action"}
                    </Button>
                </form>
                 {state?.errors?.form && (
                    <p className="mt-2 text-sm text-destructive flex items-center">
                        <AlertTriangle className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                        {state.errors.form.join(', ')}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}



export default function SyncDataPage() {
  const { profile } = useUserProfile();
  const { isRTL, tText } = useI18n();
  const actorDetails = { id: profile?.id, email: profile?.email, role: profile?.role };

  const [syncGroupState, syncGroupAction, isSyncGroupPending] = useActionState(syncGroupNamesFromEmployeesAction, initialSyncState);
  const [syncRoleState, syncRoleAction, isSyncRolesPending] = useActionState(syncRolesFromEmployeesAction, initialSyncState);
  const [syncCampusState, syncCampusAction, isSyncCampusPending] = useActionState(syncCampusesFromEmployeesAction, initialSyncState);
  const [syncStageState, syncStageAction, isSyncStagePending] = useActionState(syncStagesFromEmployeesAction, initialSyncState);
  const [syncSubjectState, syncSubjectAction, isSyncSubjectPending] = useActionState(syncSubjectsFromEmployeesAction, initialSyncState);
  const [syncMachineState, syncMachineAction, isSyncMachinePending] = useActionState(syncMachineNamesFromAttendanceLogsAction, initialSyncState);
  const [syncReportLine1State, syncReportLine1Action, isSyncReportLine1Pending] = useActionState(syncReportLine1FromEmployeesAction, initialSyncState);
  const [syncReportLine2State, syncReportLine2Action, isSyncReportLine2Pending] = useActionState(syncReportLine2FromEmployeesAction, initialSyncState);
  const [syncSystemState, syncSystemAction, isSyncSystemPending] = useActionState(syncSystemsFromEmployeesAction, initialSyncState);
  const [correctionState, correctionAction, isCorrectionPending] = useActionState(correctAttendanceNamesAction, initialCorrectionState);
  const [deduplicationState, deduplicationAction, isDeduplicationPending] = useActionState(deduplicateEmployeesAction, initialDeduplicationState);
  

  return (
    <div className="space-y-8">
       <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            {isRTL ? "مزامنة وتكامل البيانات" : "Sync Data"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isRTL ? "مزامنة القوائم يدوياً وإجراء تصحيحات البيانات المؤسسية." : "Manually synchronize lists and perform data corrections."}
          </p>
      </header>
       <SettingsPageWrapper>
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? "مزامنة البيانات المؤسسية" : "Data Synchronization"}</CardTitle>
              <CardDescription>
                {isRTL
                  ? "قم بتشغيل هذه العمليات لتحديث قوائم الاختيار من مصادر البيانات الرئيسية. هذا مفيد إذا قمت باستيراد بيانات مجمعة وتريد التأكد من توفر جميع الخيارات في النماذج والفلاتر عبر التطبيق."
                  : "Run these actions to update dropdown lists from your main data sources. This is useful if you have bulk-imported data and want to ensure all options are available in forms and filters across the app."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <SyncButton 
                    label={isRTL ? "مزامنة الأدوار من بيانات الموظفين" : "Sync Roles from Employees"}
                    action={syncRoleAction}
                    isPending={isSyncRolesPending}
                    state={syncRoleState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label={isRTL ? "مزامنة الفروع من بيانات الموظفين" : "Sync Campuses from Employees"}
                    action={syncCampusAction}
                    isPending={isSyncCampusPending}
                    state={syncCampusState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label={isRTL ? "مزامنة المراحل الدراسية من بيانات الموظفين" : "Sync Stages from Employees"}
                    action={syncStageAction}
                    isPending={isSyncStagePending}
                    state={syncStageState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label={isRTL ? "مزامنة المواد الدراسية من بيانات الموظفين" : "Sync Subjects from Employees"}
                    action={syncSubjectAction}
                    isPending={isSyncSubjectPending}
                    state={syncSubjectState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label={isRTL ? "مزامنة أسماء المجموعات من بيانات الموظفين" : "Sync Group Names from Employees"}
                    action={syncGroupAction}
                    isPending={isSyncGroupPending}
                    state={syncGroupState}
                    actorDetails={actorDetails}
                />
                 <SyncButton 
                    label={isRTL ? "مزامنة أسماء الأجهزة من سجلات الحضور" : "Sync Machine Names from Attendance Logs"}
                    action={syncMachineAction}
                    isPending={isSyncMachinePending}
                    state={syncMachineState}
                    actorDetails={actorDetails}
                />
                <SyncButton 
                    label={isRTL ? "مزامنة خط التقرير الأول من بيانات الموظفين" : "Sync Report Line 1 from Employees"}
                    action={syncReportLine1Action}
                    isPending={isSyncReportLine1Pending}
                    state={syncReportLine1State}
                    actorDetails={actorDetails}
                />
                <SyncButton 
                    label={isRTL ? "مزامنة خط التقرير الثاني من بيانات الموظفين" : "Sync Report Line 2 from Employees"}
                    action={syncReportLine2Action}
                    isPending={isSyncReportLine2Pending}
                    state={syncReportLine2State}
                    actorDetails={actorDetails}
                />
                <SyncButton 
                    label={isRTL ? "مزامنة الأنظمة الأكاديمية من بيانات الموظفين" : "Sync Systems from Employees"}
                    action={syncSystemAction}
                    isPending={isSyncSystemPending}
                    state={syncSystemState}
                    actorDetails={actorDetails}
                />
            </CardContent>
          </Card>
          
          <CorrectionButton
            label={isRTL ? "تصحيح أسماء سجلات الحضور" : "Correct Attendance Log Names"}
            description={isRTL ? "يقوم بفحص سجلات الحضور الحديثة وتصحيح المدخلات التي تم تسجيل اسم الموظف فيها كرقم معرف بدلاً من اسمه الفعلي." : "Scans recent attendance logs and corrects entries where the employee name was recorded as a numeric ID instead of their actual name."}
            action={correctionAction}
            isPending={isCorrectionPending}
            state={correctionState}
            actorDetails={actorDetails}
           />
           <CorrectionButton
            label={isRTL ? "إزالة الموظفين المكررين" : "Remove Duplicate Employees"}
            description={isRTL ? "يفحص جميع سجلات الموظفين ويزيل المكرر منها بناءً على الرقم الوظيفي أو البريد الإلكتروني، مع الاحتفاظ بالسجل الأحدث إنشاءً." : "Scans all employee records and removes duplicates based on either the same Employee ID or email address, keeping the most recent."}
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
