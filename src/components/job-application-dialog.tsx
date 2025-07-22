
"use client";

import React, { useState, useEffect, useRef, useActionState, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { applyForJobAction, type ApplyForJobState } from '@/app/actions/job-actions';
import { Loader2, Send, AlertTriangle } from 'lucide-react';
import { storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { nanoid } from 'nanoid';

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
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  
  const [state, formAction] = useActionState(applyForJobAction, initialState);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const isPending = isUploading || isSubmitting;

  useEffect(() => {
    if (state.message) {
      if (state.success) {
         toast({
            title: "Success",
            description: state.message,
            variant: "default",
        });
        setIsOpen(false);
        formRef.current?.reset();
        setFile(null);
      } else {
        toast({
            title: "Error",
            description: state.errors?.form?.join(', ') || state.message,
            variant: "destructive",
        });
      }
    }
  }, [state, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFileError(null);
    if (selectedFile) {
        if (selectedFile.type !== 'application/pdf') {
            setFileError("Resume must be a PDF file.");
            setFile(null);
            e.target.value = "";
            return;
        }
        if (selectedFile.size > 5 * 1024 * 1024) { // 5MB
            setFileError("Resume must be smaller than 5MB.");
            setFile(null);
            e.target.value = "";
            return;
        }
        setFile(selectedFile);
    } else {
        setFile(null);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setFileError("A resume file is required.");
      return;
    }
    
    const currentForm = formRef.current;
    if (!currentForm) return;

    setIsUploading(true);

    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `${job.id}-${nanoid()}.${fileExtension}`;
      const filePath = `job-applications/${fileName}`;
      const fileRef = ref(storage, filePath);
      
      await uploadBytes(fileRef, file);
      const resumeURL = await getDownloadURL(fileRef);
      
      const formData = new FormData(currentForm);
      formData.set('resumeURL', resumeURL); // Use set to ensure it's there
      
      startTransition(() => {
          formAction(formData);
      });

    } catch (error: any) {
      console.error("Error during file upload or form submission:", error);
      let errorMessage = "Could not upload your resume. Please try again.";
      if (error.code === 'storage/retry-limit-exceeded') {
        errorMessage = "Upload failed due to network issues or permissions. Please check your connection and try again.";
      }
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: errorMessage,
      });
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
            formRef.current?.reset();
            setFile(null);
            setFileError(null);
        }
        setIsOpen(open);
    }}>
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
        <form ref={formRef} onSubmit={handleFormSubmit}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="jobTitle" value={job.title} />
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" name="name" placeholder="e.g., Jane Doe" required disabled={isPending} />
                    {state.errors?.name && <p className="text-sm text-destructive mt-1">{state.errors.name.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="e.g., jane.doe@example.com" required disabled={isPending} />
                    {state.errors?.email && <p className="text-sm text-destructive mt-1">{state.errors.email.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="resume">Resume (PDF, max 5MB)</Label>
                    <Input id="resume" name="resume" type="file" accept=".pdf" required onChange={handleFileChange} disabled={isPending} />
                    {fileError && <p className="text-sm text-destructive mt-1">{fileError}</p>}
                    {state.errors?.resumeURL && <p className="text-sm text-destructive mt-1">{state.errors.resumeURL.join(', ')}</p>}
                </div>
            </div>
            
            {state.errors?.form && (
                <div className="flex items-center p-2 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{state.errors.form.join(', ')}</span>
                </div>
            )}
            
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>Cancel</Button>
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
