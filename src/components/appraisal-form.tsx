
"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Loader2, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { KpiEntryState } from "@/app/actions/kpi-actions";

const appraisalQuestions = [
  {
    category: '1. Planning & Preparation',
    questions: '• Lesson plans are clear &  aligned to curriculum.  • Differentiation for student needs.  • Uses assessment data to inform planning. ' 
  },
  {
    category: '2. Instruction & Engagement ',
    questions:  '• Clear learning objectives. • Student engagement & participation.  • Uses varied teaching strategies.  • Effective questioning techniques. '
  },
  {
    category: '3. Assessment for Learning ',
    questions:' • Provides timely, constructive feedback.  • Uses formative assessment  to adjust teaching.   • Encourages student self assessment. '
  },
  {
    category: '4. Professionalism & Contribution ',
    questions: '• Reliability & meeting deadlines.  • Productive collaboration with colleagues.  • Active/positive contribution to school initiatives and expectations. • Communication with parents is timely and professional. '
  },
  {
    category: '5. Growth & Development ',
    questions: '• Reflects on practice.  • Implements feedback from ELEOT/TOT.      • Engages in coaching/ mentoring. '
  }
];

const ratingOptions = [
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
];

interface AppraisalFormProps {
  formAction: (payload: FormData) => void;
  isPending: boolean;
  serverState: KpiEntryState | null;
  employeeDocId: string;
  actorProfile: { id?: string; email?: string; role?: string; name?: string } | null;
  onSuccess: () => void;
}

export function AppraisalForm({ formAction, isPending, serverState, employeeDocId, actorProfile }: AppraisalFormProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  return (
    <form action={formAction} className="flex flex-col h-full max-h-[90vh]">
      <DialogHeader>
        <DialogTitle>Teacher Appraisal Form</DialogTitle>
        <DialogDescription>
          Evaluate the teacher's performance across the following categories.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="kpiType" value="appraisal" />
      <input type="hidden" name="employeeDocId" value={employeeDocId} />
      <input type="hidden" name="date" value={selectedDate?.toISOString() ?? ''} />
      <input type="hidden" name="actorId" value={actorProfile?.id || ''} />
      <input type="hidden" name="actorEmail" value={actorProfile?.email || ''} />
      <input type="hidden" name="actorRole" value={actorProfile?.role || ''} />
      <input type="hidden" name="actorName" value={actorProfile?.name || ''} />

      <ScrollArea className="flex-grow my-4 pr-6 -mr-6">
        <div className="space-y-6">
          {/* Evaluation Date */}
          <div className="space-y-2">
            <Label htmlFor="date" className="text-base">Evaluation Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-[240px] pl-3 text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
              </PopoverContent>
            </Popover>
            {serverState?.errors?.date && <p className="text-sm text-destructive">{serverState.errors.date.join(', ')}</p>}
          </div>

          {/* Appraisal Questions */}
          {appraisalQuestions.map((group, groupIndex) => (
            <div key={groupIndex} className="p-4 border rounded-lg">
              <h3 className="font-semibold text-md mb-2">{group.category}</h3>
              <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{group.questions}</p>
              <RadioGroup name={`rating-${groupIndex}`} className="flex gap-6" required>
                {ratingOptions.map(option => (
                  <div key={option.value} className="flex items-center space-x-1">
                    <RadioGroupItem value={option.value} id={`q-${groupIndex}-${option.value}`} />
                    <Label htmlFor={`q-${groupIndex}-${option.value}`} className="font-normal text-sm">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ))}

        </div>
      </ScrollArea>

      <DialogFooter className="pt-4 border-t mt-auto">
        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Appraisal
        </Button>
      </DialogFooter>
    </form>
  );
}
