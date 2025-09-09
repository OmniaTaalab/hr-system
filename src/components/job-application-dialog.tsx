
"use client";
import React, { useState, useEffect, useRef, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { applyForJobAction, type ApplyForJobState, type JobApplicationPayload } from "@/app/actions/job-actions";
import { Loader2, Send, AlertTriangle } from "lucide-react";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";

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

  const [state, formAction] = React.useActionState(applyForJobAction, initialState);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const isPending = isUploading || isSubmitting;

  useEffect(() => {
    if (state?.message) {
      toast({
        title: state.success ? "Success!" : "Submission Failed",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      if (state.success) {
        setIsOpen(false);
      }
    }
  }, [state, toast]);
  
  useEffect(() => {
    if (!isOpen) {
        formRef.current?.reset();
        setFile(null);
        setFileError(null);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFileError(null);
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      setFileError("Resume must be a PDF file.");
      setFile(null);
      e.target.value = "";
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setFileError("Resume must be smaller than 5MB.");
      setFile(null);
      e.target.value = "";
      return;
    }

    setFile(selectedFile);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setFileError("A resume file is required.");
      return;
    }

    const currentForm = formRef.current;
    if (!currentForm) return;

    if (!currentForm.checkValidity()) {
      currentForm.reportValidity();
      return;
    }

    setIsUploading(true);

    try {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${job.id}-${nanoid()}.${fileExtension}`;
      const filePath = `job-applications/${fileName}`;
      const fileRef = ref(storage, filePath);

      await uploadBytes(fileRef, file, { contentType: "application/pdf" });
      const resumeURL = await getDownloadURL(fileRef);
      
      const formData = new FormData(currentForm);
      
      const payload: JobApplicationPayload = {
        jobId: job.id,
        jobTitle: job.title,
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        resumeURL: resumeURL,
        salary: formData.get('salary') ? Number(formData.get('salary')) : undefined,
        netSalary: formData.get('netSalary') ? Number(formData.get('netSalary')) : undefined,
      };

      startTransition(() => {
        formAction(payload);
      });

    } catch (error) {
      console.error("Error during upload or submission:", error);
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "An unexpected error occurred during file upload. Please try again.",
      });
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
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
        <form ref={formRef} onSubmit={handleFormSubmit} noValidate>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" name="name" required disabled={isPending} />
              {state?.errors?.name && <p className="text-sm text-destructive mt-1">{state.errors.name[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" name="email" type="email" required disabled={isPending} />
              {state?.errors?.email && <p className="text-sm text-destructive mt-1">{state.errors.email[0]}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label htmlFor="salary">Expected Salary (Optional)</Label>
                <Input id="salary" name="salary" type="number" placeholder="e.g., 50000" disabled={isPending} />
                 {state?.errors?.salary && <p className="text-sm text-destructive mt-1">{state.errors.salary[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="netSalary">Expected Net Salary (Optional)</Label>
                <Input id="netSalary" name="netSalary" type="number" placeholder="e.g., 45000" disabled={isPending} />
                 {state?.errors?.netSalary && <p className="text-sm text-destructive mt-1">{state.errors.netSalary[0]}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume">Resume (PDF, max 5MB)</Label>
              <Input
                id="resume"
                name="resume"
                type="file"
                accept=".pdf"
                required
                onChange={handleFileChange}
                disabled={isPending}
              />
              {fileError && <p className="text-sm text-destructive mt-1">{fileError}</p>}
               {state?.errors?.resumeURL && <p className="text-sm text-destructive mt-1">{state.errors.resumeURL[0]}</p>}
            </div>
            {state?.errors?.form && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {state.errors.form.join(", ")}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
              Cancel
            </Button>
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
