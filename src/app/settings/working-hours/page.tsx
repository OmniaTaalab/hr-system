"use client";

import React, { useState, useEffect, useActionState, useTransition } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { manageCampusWorkingHoursAction, type CampusWorkingHoursState } from "@/app/actions/settings-actions";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, PlusCircle, Trash2, Edit, Save, AlertTriangle, Building2, Shield, Users, Clock } from 'lucide-react';
import { TimePicker } from '@/components/ui/time-picker';
import { useOrganizationLists, type ListItem } from "@/hooks/use-organization-lists";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { useUserProfile } from '@/components/layout/app-layout';

interface CampusWorkingHours {
  id: string;
  campusName: string;
  // Legacy fields
  checkInStartTime?: string;
  checkInEndTime?: string;
  checkOutStartTime?: string;
  checkOutEndTime?: string;
  // SLT fields
  sltCheckInStartTime?: string;
  sltCheckInEndTime?: string;
  sltCheckOutStartTime?: string;
  sltCheckOutEndTime?: string;
  sltHours?: {
    checkInStartTime?: string;
    checkInEndTime?: string;
    checkOutStartTime?: string;
    checkOutEndTime?: string;
  };
  // Staff (Teacher, Administrative / Support) fields
  staffCheckInStartTime?: string;
  staffCheckInEndTime?: string;
  staffCheckOutStartTime?: string;
  staffCheckOutEndTime?: string;
  staffHours?: {
    checkInStartTime?: string;
    checkInEndTime?: string;
    checkOutStartTime?: string;
    checkOutEndTime?: string;
  };
}

const initialFormState: CampusWorkingHoursState = { success: false, message: null, errors: {} };

function getSltSchedule(record: CampusWorkingHours) {
  const inStart = record.sltCheckInStartTime || record.sltHours?.checkInStartTime || record.checkInStartTime || "--:--";
  const inEnd = record.sltCheckInEndTime || record.sltHours?.checkInEndTime || record.checkInEndTime || "--:--";
  const outStart = record.sltCheckOutStartTime || record.sltHours?.checkOutStartTime || record.checkOutStartTime || "--:--";
  const outEnd = record.sltCheckOutEndTime || record.sltHours?.checkOutEndTime || record.checkOutEndTime || "--:--";
  return { inStart, inEnd, outStart, outEnd };
}

function getStaffSchedule(record: CampusWorkingHours) {
  const inStart = record.staffCheckInStartTime || record.staffHours?.checkInStartTime || record.checkInStartTime || "--:--";
  const inEnd = record.staffCheckInEndTime || record.staffHours?.checkInEndTime || record.checkInEndTime || "--:--";
  const outStart = record.staffCheckOutStartTime || record.staffHours?.checkOutStartTime || record.checkOutStartTime || "--:--";
  const outEnd = record.staffCheckOutEndTime || record.staffHours?.checkOutEndTime || record.checkOutEndTime || "--:--";
  return { inStart, inEnd, outStart, outEnd };
}

function CampusWorkingHoursPage() {
  const [workingHours, setWorkingHours] = useState<CampusWorkingHours[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CampusWorkingHours | null>(null);

  const { campuses, isLoading: isLoadingCampuses } = useOrganizationLists();
  const { toast } = useToast();
  const { profile } = useUserProfile();

  const [formState, formAction, isFormActionPending] = useActionState(manageCampusWorkingHoursAction, initialFormState);

  useEffect(() => {
    const q = query(collection(db, "campusWorkingHours"), orderBy("campusName"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CampusWorkingHours));
      setWorkingHours(data);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching campus working hours:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load working hours data.' });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [toast]);

  useEffect(() => {
    if (formState?.message) {
      toast({
        title: formState.success ? "Success" : "Error",
        description: formState.message,
        variant: formState.success ? "default" : "destructive",
      });
      if (formState.success) {
        setIsFormOpen(false);
        setEditingRecord(null);
      }
    }
  }, [formState, toast]);
  
  const handleEditClick = (record: CampusWorkingHours) => {
    setEditingRecord(record);
    setIsFormOpen(true);
  };
  
  const handleAddNewClick = () => {
    setEditingRecord(null);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
     const formData = new FormData();
     formData.append('operation', 'delete');
     formData.append('id', id);
     if (profile?.id) formData.append('actorId', profile.id);
     if (profile?.email) formData.append('actorEmail', profile.email);
     if (profile?.role) formData.append('actorRole', profile.role);
     formAction(formData);
  };

  return (
    <SettingsPageWrapper>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center gap-2">
            <Clock className="h-8 w-8 text-primary" />
            Campus Working Hours
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure working hours and attendance windows per campus based on employee <strong>Position Class</strong> (SLT vs. Teacher, Administrative / Support).
          </p>
        </header>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <CardTitle>Campus Configurations</CardTitle>
                <CardDescription>
                  Rules are evaluated dynamically against each employee&apos;s assigned Position Class.
                </CardDescription>
              </div>
              <Button onClick={handleAddNewClick}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Campus Schedule
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : workingHours.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/20">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium text-base">No campus schedules defined yet</p>
                <p className="text-sm text-muted-foreground mt-1">Click &quot;Add Campus Schedule&quot; to set up your first campus schedule.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Campus</TableHead>
                      <TableHead className="min-w-[240px]">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50">
                            SLT
                          </Badge>
                          <span>Senior Leadership</span>
                        </div>
                      </TableHead>
                      <TableHead className="min-w-[240px]">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50">
                            Teacher / Admin / Support
                          </Badge>
                          <span>Staff Schedule</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-right w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workingHours.map((record) => {
                      const slt = getSltSchedule(record);
                      const staff = getStaffSchedule(record);

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-semibold text-base">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              {record.campusName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-muted-foreground">In:</span>
                                <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">{slt.inStart} – {slt.inEnd}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-muted-foreground">Out:</span>
                                <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">{slt.outStart} – {slt.outEnd}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-muted-foreground">In:</span>
                                <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">{staff.inStart} – {staff.inEnd}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-muted-foreground">Out:</span>
                                <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">{staff.outStart} – {staff.outEnd}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditClick(record)} title="Edit working hours">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)} className="text-destructive hover:text-destructive" title="Delete campus schedule">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        
        <WorkingHoursForm
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          record={editingRecord}
          campuses={campuses}
          isLoadingCampuses={isLoadingCampuses}
          formAction={formAction}
          isFormActionPending={isFormActionPending}
          formState={formState}
          profile={profile}
        />

      </div>
    </SettingsPageWrapper>
  );
}

function WorkingHoursForm({
  isOpen,
  onOpenChange,
  record,
  campuses,
  isLoadingCampuses,
  formAction,
  isFormActionPending,
  formState,
  profile
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  record: CampusWorkingHours | null;
  campuses: ListItem[];
  isLoadingCampuses: boolean;
  formAction: (payload: FormData) => void;
  isFormActionPending: boolean;
  formState: CampusWorkingHoursState;
  profile: any;
}) {
  const [campus, setCampus] = useState(record?.campusName || "");
  
  // SLT Working Hours
  const [sltFlexible, setSltFlexible] = useState(false);
  const [sltCheckInStart, setSltCheckInStart] = useState("07:00");
  const [sltCheckInEnd, setSltCheckInEnd] = useState("07:30");
  const [sltCheckOutStart, setSltCheckOutStart] = useState("15:30");
  const [sltCheckOutEnd, setSltCheckOutEnd] = useState("16:30");

  // Staff (Teacher, Administrative / Support) Working Hours
  const [staffCheckInStart, setStaffCheckInStart] = useState("07:20");
  const [staffCheckInEnd, setStaffCheckInEnd] = useState("07:30");
  const [staffCheckOutStart, setStaffCheckOutStart] = useState("15:00");
  const [staffCheckOutEnd, setStaffCheckOutEnd] = useState("16:00");

  const [isTransitionPending, startTransition] = useTransition();
  const isPending = isFormActionPending || isTransitionPending;

  useEffect(() => {
    if (isOpen) {
      if (record) {
        setCampus(record.campusName || "");
        const isFlex = 
          record.sltFlexible === true || 
          record.sltHours?.flexible === true || 
          record.sltCheckInEndTime === "flexible" || 
          !record.sltCheckInEndTime;
        setSltFlexible(isFlex);
        setSltCheckInStart(record.sltCheckInStartTime || record.sltHours?.checkInStartTime || record.checkInStartTime || "07:00");
        setSltCheckInEnd(record.sltCheckInEndTime && record.sltCheckInEndTime !== "flexible" ? record.sltCheckInEndTime : (record.sltHours?.checkInEndTime || record.checkInEndTime || "07:30"));
        setSltCheckOutStart(record.sltCheckOutStartTime || record.sltHours?.checkOutStartTime || record.checkOutStartTime || "15:30");
        setSltCheckOutEnd(record.sltCheckOutEndTime || record.sltHours?.checkOutEndTime || record.checkOutEndTime || "16:30");

        setStaffCheckInStart(record.staffCheckInStartTime || record.staffHours?.checkInStartTime || record.checkInStartTime || "07:20");
        setStaffCheckInEnd(record.staffCheckInEndTime || record.staffHours?.checkInEndTime || record.checkInEndTime || "07:30");
        setStaffCheckOutStart(record.staffCheckOutStartTime || record.staffHours?.checkOutStartTime || record.checkOutStartTime || "15:00");
        setStaffCheckOutEnd(record.staffCheckOutEndTime || record.staffHours?.checkOutEndTime || record.checkOutEndTime || "16:00");
      } else {
        setCampus("");
        setSltFlexible(false);
        setSltCheckInStart("07:00");
        setSltCheckInEnd("07:30");
        setSltCheckOutStart("15:30");
        setSltCheckOutEnd("16:30");

        setStaffCheckInStart("07:20");
        setStaffCheckInEnd("07:30");
        setStaffCheckOutStart("15:00");
        setStaffCheckOutEnd("16:00");
      }
    }
  }, [isOpen, record]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campus) return;

    const formData = new FormData();
    formData.set('operation', record ? 'update' : 'add');
    if (record) formData.set('id', record.id);
    if (profile?.id) formData.set('actorId', profile.id);
    if (profile?.email) formData.set('actorEmail', profile.email);
    if (profile?.role) formData.set('actorRole', profile.role);
    
    formData.set('campusName', campus);
    formData.set('sltFlexible', sltFlexible ? 'true' : 'false');
    formData.set('sltCheckInStartTime', sltCheckInStart);
    formData.set('sltCheckInEndTime', sltFlexible ? 'flexible' : sltCheckInEnd);
    formData.set('sltCheckOutStartTime', sltCheckOutStart);
    formData.set('sltCheckOutEndTime', sltCheckOutEnd);

    formData.set('staffCheckInStartTime', staffCheckInStart);
    formData.set('staffCheckInEndTime', staffCheckInEnd);
    formData.set('staffCheckOutStartTime', staffCheckOutStart);
    formData.set('staffCheckOutEndTime', staffCheckOutEnd);

    startTransition(() => {
      formAction(formData);
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleFormSubmit}>
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-xl">
              {record ? "Edit Campus Working Hours" : "Add Campus Working Hours"}
            </DialogTitle>
            <DialogDescription>
              Select a campus, then set specific schedules for SLT and shared schedules for Teacher, Administrative, and Support staff based on their Position Class.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* STEP 1: Select Campus */}
            <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
              <Label htmlFor="campusName" className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Step 1: Select Campus
              </Label>
              <Select
                name="campusName"
                value={campus}
                onValueChange={setCampus}
                required
                disabled={isLoadingCampuses || !!record}
              >
                <SelectTrigger id="campusName" className="bg-background">
                  <SelectValue placeholder="Choose a campus..." />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formState?.errors?.campusName && (
                <p className="text-sm text-destructive">{formState.errors.campusName[0]}</p>
              )}
            </div>

            {/* STEP 2: SLT Working Hours */}
            <div className="p-4 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-purple-200/60 dark:border-purple-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center gap-1">
                    <Shield className="h-3 w-3" /> SLT
                  </Badge>
                  <h4 className="font-semibold text-sm text-foreground">
                    Senior Leadership Team (SLT)
                  </h4>
                </div>
                <span className="text-xs text-muted-foreground">Applies to Position Class: SLT</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-purple-100/60 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-xs text-purple-950 dark:text-purple-200">
                    <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                    <span>Flexible Arrival (No Check-in Cutoff Time)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Enable this so SLT members have no fixed arrival deadline and can check in flexibly without late penalty.
                  </p>
                </div>
                <Switch
                  checked={sltFlexible}
                  onCheckedChange={setSltFlexible}
                  id="sltFlexible"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-in Start Window</Label>
                  <TimePicker value={sltCheckInStart} onChange={setSltCheckInStart} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Check-in End Window <span className="text-destructive font-semibold">(Late Threshold)</span>
                  </Label>
                  {sltFlexible ? (
                    <div className="h-9 px-3 flex items-center rounded-md border border-dashed border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 text-xs font-medium text-purple-700 dark:text-purple-300">
                      <Sparkles className="h-3 w-3 mr-1.5" /> Flexible (No late cutoff)
                    </div>
                  ) : (
                    <TimePicker value={sltCheckInEnd} onChange={setSltCheckInEnd} />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-out Start Window</Label>
                  <TimePicker value={sltCheckOutStart} onChange={setSltCheckOutStart} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-out End Window</Label>
                  <TimePicker value={sltCheckOutEnd} onChange={setSltCheckOutEnd} />
                </div>
              </div>
            </div>

            {/* STEP 3: Teacher, Administrative / Support Working Hours */}
            <div className="p-4 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-sky-200/60 dark:border-sky-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-sky-600 hover:bg-sky-700 text-white font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" /> Teacher & Staff
                  </Badge>
                  <h4 className="font-semibold text-sm text-foreground">
                    Teacher, Administrative / Support
                  </h4>
                </div>
                <span className="text-xs text-muted-foreground">Shared schedule across staff position classes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-in Start Window</Label>
                  <TimePicker value={staffCheckInStart} onChange={setStaffCheckInStart} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Check-in End Window <span className="text-destructive font-semibold">(Late Threshold)</span>
                  </Label>
                  <TimePicker value={staffCheckInEnd} onChange={setStaffCheckInEnd} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-out Start Window</Label>
                  <TimePicker value={staffCheckOutStart} onChange={setStaffCheckOutStart} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Check-out End Window</Label>
                  <TimePicker value={staffCheckOutEnd} onChange={setStaffCheckOutEnd} />
                </div>
              </div>
            </div>

            {formState?.errors?.form && (
              <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="mr-2 h-4 w-4 shrink-0" />
                {formState.errors.form[0]}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !campus}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
              Save Working Hours
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CampusWorkingHoursPage;
