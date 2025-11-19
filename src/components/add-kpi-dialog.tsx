
"use client";

import React, { useState, useEffect, useActionState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { addKpiEntryAction, type KpiEntryState } from "@/app/actions/kpi-actions";
import { useUserProfile } from "@/components/layout/app-layout";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Plus, Calendar as CalendarIcon, Save } from "lucide-react";
import { AppraisalForm } from './appraisal-form';

interface AddKpiDialogProps {
  employee: {
    id: string;
    name: string;
    employeeId?: string;
  };
  kpiType: 'eleot' | 'tot' | 'appraisal';
}

const initialKpiState: KpiEntryState = { success: false };

export function AddKpiDialog({ employee, kpiType }: AddKpiDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [addState, addAction, isAddPending] = useActionState(addKpiEntryAction, initialKpiState);
  const { profile } = useUserProfile();

  useEffect(() => {
    if (addState?.message) {
      toast({
        title: addState.success ? "Success" : "Error",
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) {
        setIsOpen(false);
        setSelectedDate(new Date());
      }
    }
  }, [addState, toast]);
  
  const title = `Add ${kpiType.toUpperCase()} Entry`;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            {kpiType.toUpperCase()}
        </Button>
      </DialogTrigger>
      <DialogContent className={cn(kpiType === 'appraisal' && "max-w-3xl")}>
        {kpiType === 'appraisal' ? (
          <AppraisalForm 
            formAction={addAction} 
            isPending={isAddPending} 
            serverState={addState} 
            employeeDocId={employee.id}
            actorProfile={profile}
            onSuccess={() => setIsOpen(false)}
          />
        ) : (
          <form action={addAction}>
            <input type="hidden" name="kpiType" value={kpiType} />
            <input type="hidden" name="employeeDocId" value={employee.id || ''} />
            <input type="hidden" name="date" value={selectedDate?.toISOString() ?? ''} />
            <input type="hidden" name="actorId" value={profile?.id || ''} />
            <input type="hidden" name="actorEmail" value={profile?.email || ''} />
            <input type="hidden" name="actorRole" value={profile?.role || ''} />
            <input type="hidden" name="actorName" value={profile?.name || ''} />
            <DialogHeader>
              <DialogTitle>{title} for {employee.name}</DialogTitle>
              <DialogDescription>
                Select a date and enter the points for this entry.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="date" className="text-right">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn("w-[240px] pl-3 text-left font-normal col-span-3", !selectedDate && "text-muted-foreground")}
                    >
                      {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                  </PopoverContent>
                </Popover>
                {addState?.errors?.date && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.date.join(', ')}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="points" className="text-right">Point</Label>
                <Input id="points" name="points" type="number" max="4" step="0.1" className="col-span-3" required />
                {addState?.errors?.points && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.points.join(', ')}</p>}
              </div>
            </div>
            {addState?.errors?.form && <p className="text-sm text-destructive text-center mb-2">{addState.errors.form.join(', ')}</p>}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={isAddPending}>
                {isAddPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Confirm
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
