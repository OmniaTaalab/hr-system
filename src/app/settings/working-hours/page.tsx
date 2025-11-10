
"use client";

import React, { useState, useEffect, useActionState, useTransition } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { manageCampusWorkingHoursAction, type CampusWorkingHoursState } from "@/actions/settings-actions";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, PlusCircle, Trash2, Edit, Save, AlertTriangle } from 'lucide-react';
import { TimePicker } from '@/components/ui/time-picker';
import { useOrganizationLists, type ListItem } from "@/hooks/use-organization-lists";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { useUserProfile } from '@/components/layout/app-layout';

interface CampusWorkingHours {
  id: string;
  campusName: string;
  checkInStartTime: string;
  checkInEndTime: string;
  checkOutStartTime: string;
  checkOutEndTime: string;
}

const initialFormState: CampusWorkingHoursState = { success: false, message: null, errors: {} };

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
     // Since this is a simple action, we can call it directly in a formAction context
     // However, for consistency and to avoid the same error, we should also wrap it or use a form.
     // For now, assuming the error is only in the main form.
     formAction(formData);
  };

  return (
    <SettingsPageWrapper>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            Campus Working Hours
          </h1>
          <p className="text-muted-foreground">
            Define check-in and check-out windows for each campus.
          </p>
        </header>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Configurations</CardTitle>
              <Button onClick={handleAddNewClick}><PlusCircle className="mr-2 h-4 w-4" /> Add New</Button>
            </div>
            <CardDescription>Manage the working hour rules for all campuses.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campus</TableHead>
                    <TableHead>Check-in Window</TableHead>
                    <TableHead>Check-out Window</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workingHours.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.campusName}</TableCell>
                      <TableCell>{record.checkInStartTime} - {record.checkInEndTime}</TableCell>
                      <TableCell>{record.checkOutStartTime} - {record.checkOutEndTime}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(record)}><Edit className="h-4 w-4"/></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

function WorkingHoursForm({ isOpen, onOpenChange, record, campuses, isLoadingCampuses, formAction, isFormActionPending, formState, profile }: {
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
    const [checkInStart, setCheckInStart] = useState(record?.checkInStartTime || "");
    const [checkInEnd, setCheckInEnd] = useState(record?.checkInEndTime || "");
    const [checkOutStart, setCheckOutStart] = useState(record?.checkOutStartTime || "");
    const [checkOutEnd, setCheckOutEnd] = useState(record?.checkOutEndTime || "");
    const [campus, setCampus] = useState(record?.campusName || "");
    const [isTransitionPending, startTransition] = useTransition();

    const isPending = isFormActionPending || isTransitionPending;

    useEffect(() => {
        if(isOpen) {
            setCampus(record?.campusName || "");
            setCheckInStart(record?.checkInStartTime || "07:00");
            setCheckInEnd(record?.checkInEndTime || "08:00");
            setCheckOutStart(record?.checkOutStartTime || "15:00");
            setCheckOutEnd(record?.checkOutEndTime || "16:00");
        }
    }, [isOpen, record]);

    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set('operation', record ? 'update' : 'add');
        if (record) formData.set('id', record.id);
        if (profile?.id) formData.set('actorId', profile.id);
        if (profile?.email) formData.set('actorEmail', profile.email);
        if (profile?.role) formData.set('actorRole', profile.role);
        
        // Add time values from state, as TimePicker is a custom component
        formData.set('checkInStartTime', checkInStart);
        formData.set('checkInEndTime', checkInEnd);
        formData.set('checkOutStartTime', checkOutStart);
        formData.set('checkOutEndTime', checkOutEnd);
        formData.set('campusName', campus);

        startTransition(() => {
            formAction(formData);
        });
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleFormSubmit}>
                    <DialogHeader>
                        <DialogTitle>{record ? "Edit" : "Add"} Campus Working Hours</DialogTitle>
                        <DialogDescription>Set the time windows for check-in and check-out for a campus.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="campusName">Campus</Label>
                            <Select name="campusName" value={campus} onValueChange={setCampus} required disabled={isLoadingCampuses || !!record}>
                                <SelectTrigger><SelectValue placeholder="Select a campus..." /></SelectTrigger>
                                <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            {formState?.errors?.campusName && <p className="text-sm text-destructive">{formState.errors.campusName[0]}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Check-in Start</Label>
                                <TimePicker value={checkInStart} onChange={setCheckInStart} />
                                {formState?.errors?.checkInStartTime && <p className="text-sm text-destructive">{formState.errors.checkInStartTime[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Check-in End</Label>
                                <TimePicker value={checkInEnd} onChange={setCheckInEnd} />
                                 {formState?.errors?.checkInEndTime && <p className="text-sm text-destructive">{formState.errors.checkInEndTime[0]}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label>Check-out Start</Label>
                                <TimePicker value={checkOutStart} onChange={setCheckOutStart} />
                                 {formState?.errors?.checkOutStartTime && <p className="text-sm text-destructive">{formState.errors.checkOutStartTime[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Check-out End</Label>
                                <TimePicker value={checkOutEnd} onChange={setCheckOutEnd} />
                                 {formState?.errors?.checkOutEndTime && <p className="text-sm text-destructive">{formState.errors.checkOutEndTime[0]}</p>}
                            </div>
                        </div>
                        {formState?.errors?.form &&
                            <div className="flex items-center text-sm text-destructive">
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                {formState.errors.form[0]}
                            </div>
                        }
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default CampusWorkingHoursPage;
