

"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Loader2, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { KpiEntryState } from "@/app/actions/kpi-actions";
import type { User } from 'firebase/auth';

const appraisalQuestions = [
  {
    category: '1. Planning & Preparation',
    questions: [
      { id: 'lesson-plans', text: '• Lesson plans are clear & aligned to curriculum.' },
      { id: 'differentiation', text: '• Differentiation for student needs.' },
      { id: 'assessment-data', text: '• Uses assessment data to inform planning.' },
    ],
  },
  {
    category: '2. Instruction & Engagement',
    questions: [
        { id: 'learning-objectives', text: '• Clear learning objectives.' },
        { id: 'student-engagement', text: '• Student engagement & participation.' },
        { id: 'teaching-strategies', text: '• Uses varied teaching strategies.' },
        { id: 'questioning-techniques', text: '• Effective questioning techniques.' },
    ]
  },
  {
      category: '3. Assessment for Learning',
      questions: [
        { id: 'feedback', text: '• Provides timely, constructive feedback.' },
        { id: 'formative-assessment', text: '• Uses formative assessment to adjust teaching.' },
        { id: 'self-assessment', text: '• Encourages student self-assessment.' },
      ]
  },
  {
    category: '4. Professionalism & Contribution',
    questions: [
        { id: 'reliability', text: '• Reliability & meeting deadlines.' },
        { id: 'collaboration', text: '• Productive collaboration with colleagues.' },
        { id: 'school-initiatives', text: '• Active/positive contribution to school initiatives and expectations.' },
        { id: 'parent-communication', text: '• Communication with parents is timely and professional.' },
    ]
  },
  {
    category: '5. Growth & Development ',
    questions: [
        { id: 'reflection', text: '• Reflects on practice.' },
        { id: 'feedback-implementation', text: '• Implements feedback from ELEOT/TOT.' },
        { id: 'coaching-mentoring', text: '• Engages in coaching/ mentoring.' },
    ]
  }
];

const ratingOptions = [
    { value: '1', label: 'Needs Improvement' },
    { value: '2', label: 'Developing' },
    { value: '3', label: 'Effective' },
];


interface AppraisalFormProps {
    formAction: (payload: FormData) => void;
    isPending: boolean;
    serverState: KpiEntryState | null;
    employeeDocId: string;
    actorProfile: { id?: string; email?: string; role?: string; name?: string } | null;
    onSuccess: () => void;
}

export function AppraisalForm({ formAction, isPending, serverState, employeeDocId, actorProfile, onSuccess }: AppraisalFormProps) {
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

          {appraisalQuestions.map((group, groupIndex) => (
            <div key={groupIndex} className="p-4 border rounded-lg">
              <h3 className="font-semibold text-md mb-3">{group.category}</h3>
              <div className="space-y-4">
                {group.questions.map((question, questionIndex) => (
                    <div key={question.id}>
                        <p className="text-sm font-medium mb-2">{question.text}</p>
                        <RadioGroup name={`rating-${groupIndex}-${questionIndex}`} className="flex gap-4" required>
                            {ratingOptions.map(option => (
                                <div key={option.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option.value} id={`q-${groupIndex}-${questionIndex}-${option.value}`} />
                                    <Label htmlFor={`q-${groupIndex}-${questionIndex}-${option.value}`} className="font-normal">{option.label} ({option.value})</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                ))}
              </div>
            </div>
          ))}
            <div className="p-4 border rounded-lg">
                <Label htmlFor="comments" className="font-semibold text-md mb-3 block">General Comments</Label>
                <Textarea id="comments" name="comments" placeholder="Add any overall comments, strengths, or areas for development..."/>
            </div>
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
