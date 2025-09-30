
"use client";
import React, { useState, useEffect, useRef, useTransition, useMemo } from "react";
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
import { Loader2, Send, AlertTriangle, Calendar as CalendarIcon } from "lucide-react";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";


interface JobOpening {
  id: string;
  title: string;
  applicationFields?: string[];
}

interface JobApplicationDialogProps {
  job: JobOpening;
}

// Configuration for all possible fields
export const applicationFieldsConfig = [
    { id: 'nameEn', label: 'Name (English)', required: true },
    { id: 'nameAr', label: 'Name (Arabic)', required: true },
    { id: 'dateOfBirth', label: 'Date of Birth', required: true },
    { id: 'placeOfBirth', label: 'Place of Birth', required: true },
    { id: 'nationalities', label: 'Nationality(ies)', required: true },
    { id: 'socialTitle', label: 'Social Title', required: true },
    { id: 'isParentAtNIS', label: 'Parent at NIS?', required: true },
    { id: 'maritalStatus', label: 'Marital Status', required: true },
    { id: 'numberOfChildren', label: 'Number of Children', required: false },
    { id: 'address', label: 'Current Address', required: false },
    { id: 'contactNumbers', label: 'Contact Numbers', required: true },
    { id: 'emails', label: 'Email Addresses', required: true },
];

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

  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();

  const [state, formAction] = React.useActionState(applyForJobAction, initialState);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const isPending = isUploading || isSubmitting;

  const visibleFields = useMemo(() => {
    if (!job.applicationFields || job.applicationFields.length === 0) {
      // Default to all required fields if none are specified
      return new Set(applicationFieldsConfig.filter(f => f.required).map(f => f.id));
    }
    return new Set(job.applicationFields);
  }, [job.applicationFields]);

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
        setDateOfBirth(undefined);
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
    const formData = new FormData(currentForm);
    
    // Only construct payload with visible fields
    const payload: Partial<JobApplicationPayload> = {
      jobId: job.id,
      jobTitle: job.title,
    };

    if (visibleFields.has('nameEn')) {
      payload.firstNameEn = formData.get('firstNameEn') as string;
      payload.middleNameEn = formData.get('middleNameEn') as string;
      payload.lastNameEn = formData.get('lastNameEn') as string;
    }
    if (visibleFields.has('nameAr')) {
      payload.firstNameAr = formData.get('firstNameAr') as string;
      payload.fatherNameAr = formData.get('fatherNameAr') as string;
      payload.familyNameAr = formData.get('familyNameAr') as string;
    }
    if (visibleFields.has('dateOfBirth')) payload.dateOfBirth = dateOfBirth;
    if (visibleFields.has('placeOfBirth')) payload.placeOfBirth = formData.get('placeOfBirth') as string;
    if (visibleFields.has('nationalities')) payload.nationalities = formData.get('nationalities') as string;
    if (visibleFields.has('socialTitle')) payload.socialTitle = formData.get('socialTitle') as any;
    if (visibleFields.has('isParentAtNIS')) payload.isParentAtNIS = formData.get('isParentAtNIS') as any;
    if (visibleFields.has('maritalStatus')) payload.maritalStatus = formData.get('maritalStatus') as any;
    if (visibleFields.has('numberOfChildren')) payload.numberOfChildren = Number(formData.get('numberOfChildren'));
    if (visibleFields.has('address')) {
      payload.country = formData.get('country') as string;
      payload.city = formData.get('city') as string;
      payload.area = formData.get('area') as string;
      payload.street = formData.get('street') as string;
      payload.building = formData.get('building') as string;
      payload.apartment = formData.get('apartment') as string;
    }
    if (visibleFields.has('contactNumbers')) {
      payload.homePhone = formData.get('homePhone') as string;
      payload.mobilePhone = formData.get('mobilePhone') as string;
      payload.otherPhone = formData.get('otherPhone') as string;
    }
    if (visibleFields.has('emails')) {
      payload.email1 = formData.get('email1') as string;
      payload.email2 = formData.get('email2') as string;
    }


    try {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${job.id}-${nanoid()}.${fileExtension}`;
      const filePath = `job-applications/${fileName}`;
      const fileRef = ref(storage, filePath);

      await uploadBytes(fileRef, file, { contentType: "application/pdf" });
      const resumeURL = await getDownloadURL(fileRef);
      payload.resumeURL = resumeURL;
      
      startTransition(() => {
        formAction(payload as JobApplicationPayload);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply for {job.title}</DialogTitle>
          <DialogDescription>
            Fill in your details and upload your resume to apply.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleFormSubmit} noValidate>
          <ScrollArea className="h-[60vh] pr-6">
            <div className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Personal Info</h3>
                
                {visibleFields.has('nameEn') && (
                <div className="space-y-2">
                    <Label>Name in English (as in official documents)</Label>
                    <div className="grid grid-cols-3 gap-2">
                        <Input name="firstNameEn" placeholder="First Name" required disabled={isPending} />
                        <Input name="middleNameEn" placeholder="Middle Name" disabled={isPending} />
                        <Input name="lastNameEn" placeholder="Last Name" required disabled={isPending} />
                    </div>
                </div>
                )}

                {visibleFields.has('nameAr') && (
                <div className="space-y-2">
                    <Label>Name in Arabic (as in I.D.)</Label>
                    <div className="grid grid-cols-3 gap-2">
                        <Input name="firstNameAr" placeholder="الاسم الأول" required disabled={isPending} dir="rtl" />
                        <Input name="fatherNameAr" placeholder="اسم الأب" disabled={isPending} dir="rtl" />
                        <Input name="familyNameAr" placeholder="العائلة" required disabled={isPending} dir="rtl" />
                    </div>
                </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                    {visibleFields.has('dateOfBirth') && (
                    <div className="space-y-2">
                        <Label>Date of Birth</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                            </PopoverContent>
                        </Popover>
                    </div>
                    )}
                     {visibleFields.has('placeOfBirth') && (
                    <div className="space-y-2">
                        <Label htmlFor="placeOfBirth">Place of Birth</Label>
                        <Input id="placeOfBirth" name="placeOfBirth" required disabled={isPending} />
                    </div>
                    )}
                </div>

                 {visibleFields.has('nationalities') && (
                 <div className="space-y-2">
                    <Label htmlFor="nationalities">Nationality(ies)</Label>
                    <Input id="nationalities" name="nationalities" required disabled={isPending} />
                </div>
                 )}

                 {visibleFields.has('socialTitle') && (
                 <div className="space-y-2">
                    <Label>Social Title</Label>
                    <RadioGroup name="socialTitle" defaultValue="Mr" className="flex gap-4">
                        <div className="flex items-center space-x-2"><RadioGroupItem value="Mr" id="title-mr" /><Label htmlFor="title-mr">Mr</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="Miss" id="title-miss" /><Label htmlFor="title-miss">Miss</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="Mrs" id="title-mrs" /><Label htmlFor="title-mrs">Mrs</Label></div>
                    </RadioGroup>
                </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                     {visibleFields.has('isParentAtNIS') && (
                    <div className="space-y-2">
                         <Label>Are you a parent at NIS?</Label>
                        <RadioGroup name="isParentAtNIS" defaultValue="No" className="flex gap-4">
                             <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="is-parent-yes" /><Label htmlFor="is-parent-yes">Yes</Label></div>
                             <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="is-parent-no" /><Label htmlFor="is-parent-no">No</Label></div>
                        </RadioGroup>
                    </div>
                    )}
                     {visibleFields.has('maritalStatus') && (
                    <div className="space-y-2">
                        <Label>Marital Status</Label>
                         <Select name="maritalStatus" required>
                            <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Single">Single</SelectItem>
                                <SelectItem value="Engaged">Engaged</SelectItem>
                                <SelectItem value="Married">Married</SelectItem>
                                <SelectItem value="Divorced">Divorced</SelectItem>
                                <SelectItem value="Separated">Separated</SelectItem>
                                <SelectItem value="Widowed">Widowed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     )}
                </div>

                {visibleFields.has('numberOfChildren') && (
                <div className="space-y-2">
                    <Label htmlFor="numberOfChildren">Number of children (if any)</Label>
                    <Input id="numberOfChildren" name="numberOfChildren" type="number" min="0" defaultValue="0" disabled={isPending} />
                </div>
                )}
                
                {visibleFields.has('address') && (
                    <>
                    <Separator />
                    <h3 className="font-semibold text-lg border-b pb-2">Current Address</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="country">Country</Label>
                            <Input id="country" name="country" disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="city">City</Label>
                            <Input id="city" name="city" disabled={isPending} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="area">Area</Label>
                            <Input id="area" name="area" disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="street">Street</Label>
                            <Input id="street" name="street" disabled={isPending} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="building">Building/Floor</Label>
                            <Input id="building" name="building" disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="apartment">Apartment Number</Label>
                            <Input id="apartment" name="apartment" disabled={isPending} />
                        </div>
                    </div>
                    </>
                )}

                {visibleFields.has('contactNumbers') && (
                    <>
                    <Separator />
                     <h3 className="font-semibold text-lg border-b pb-2">Contact Info</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="homePhone">Home Telephone</Label>
                            <Input id="homePhone" name="homePhone" type="tel" disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobilePhone">Mobile Number</Label>
                            <Input id="mobilePhone" name="mobilePhone" type="tel" required disabled={isPending} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="otherPhone">Other Telephone Numbers</Label>
                        <Input id="otherPhone" name="otherPhone" type="tel" disabled={isPending} />
                    </div>
                    </>
                )}

                 {visibleFields.has('emails') && (
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="email1">Email address (1)</Label>
                        <Input id="email1" name="email1" type="email" required disabled={isPending} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email2">Email address (2)</Label>
                        <Input id="email2" name="email2" type="email" disabled={isPending} />
                    </div>
                </div>
                )}

                 <div className="space-y-2 pt-4">
                    <Label htmlFor="resume">Resume (PDF, max 5MB)</Label>
                    <Input id="resume" name="resume" type="file" accept=".pdf" required onChange={handleFileChange} disabled={isPending} />
                    {fileError && <p className="text-sm text-destructive mt-1">{fileError}</p>}
                    {state?.errors?.resumeURL && <p className="text-sm text-destructive mt-1">{state.errors.resumeURL[0]}</p>}
                </div>
            </div>
            
            </ScrollArea>
             {state?.errors?.form && (
              <div className="text-sm text-destructive flex items-center gap-2 mt-4">
                <AlertTriangle className="h-4 w-4" />
                {state.errors.form.join(", ")}
              </div>
            )}
          <DialogFooter className="pt-4 border-t">
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
