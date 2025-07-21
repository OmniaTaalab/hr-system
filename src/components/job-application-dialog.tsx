
"use client";

import React, { useState, useEffect, useRef, useActionState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { applyForJobAction, type ApplyForJobState } from '@/app/actions/job-actions';
import { Loader2, Send, UploadCloud, FileText, AlertTriangle } from 'lucide-react';

interface JobOpening {
  id: string;
  title: string;
}

interface JobApplicationDialogProps {
  job: JobOpening;
}

const initialState: ApplyForJobState = {
  message: null,
  errors: {},
  success: false,
};

export function JobApplicationDialog({ job }: JobApplicationDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [state, formAction, isPending] = useActionState(applyForJobAction, initialState);

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Success" : "Error",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      if (state.success) {
        setIsOpen(false);
        setFileName("");
        // Reset the form if needed, though closing the dialog usually handles this.
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
      }
    }
  }, [state, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    } else {
      setFileName("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto group">
            Apply Now
            <Send className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Apply for {job.title}</DialogTitle>
          <DialogDescription>
            Fill in your details and upload your resume to apply.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="jobTitle" value={job.title} />
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" name="name" placeholder="e.g., Jane Doe" required />
                    {state.errors?.name && <p className="text-sm text-destructive mt-1">{state.errors.name.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="you@example.com" required />
                    {state.errors?.email && <p className="text-sm text-destructive mt-1">{state.errors.email.join(', ')}</p>}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="resume">Resume (PDF, max 5MB)</Label>
                    <Input id="resume" name="resume" type="file" accept=".pdf" required ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full justify-start">
                        <UploadCloud className="mr-2 h-4 w-4" />
                        {fileName ? <span className="flex items-center"><FileText className="mr-2 h-4 w-4"/> {fileName}</span> : 'Select PDF File'}
                    </Button>
                    {state.errors?.resume && <p className="text-sm text-destructive mt-1">{state.errors.resume.join(', ')}</p>}
                </div>
            </div>
            
            {state.errors?.form && (
                <div className="flex items-center p-2 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{state.errors.form.join(', ')}</span>
                </div>
            )}
            
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                {isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                    </>
                ) : (
                    <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Application
                    </>
                )}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
