
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
import { Textarea } from "./ui/textarea";


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
    // Personal Info
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

    // Job Requirements
    { id: 'howDidYouHear', label: 'How did you learn about N.I.S.?', required: false },
    { id: 'previouslyWorkedAtNIS', label: 'Previously worked at NIS?', required: false },
    { id: 'positionApplyingFor', label: 'Position Applying for', required: false },
    { id: 'yearsOfExperience', label: 'Years of Experience', required: false },
    { id: 'expectedSalary', label: 'Expected Salary', required: false },
    { id: 'schoolType', label: 'School Type Experience', required: false },
    { id: 'noticePeriod', label: 'Notice Period', required: false },
    { id: 'availableStartDate', label: 'Available Start Date', required: false },
    { id: 'needsBus', label: 'Needs School Bus?', required: false },
    { id: 'insideContact', label: 'Inside Contact?', required: false },
    { id: 'references', label: 'References', required: false },
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
  const [availableStartDate, setAvailableStartDate] = useState<Date | undefined>();

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
        setAvailableStartDate(undefined);
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
    
    // Dynamically build payload
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
    if(visibleFields.has('howDidYouHear')) payload.howDidYouHear = formData.get('howDidYouHear') as string;
    if(visibleFields.has('previouslyWorkedAtNIS')) payload.previouslyWorkedAtNIS = formData.get('previouslyWorkedAtNIS') as any;
    if(visibleFields.has('positionApplyingFor')) {
        payload.positionJobTitle = formData.get('positionJobTitle') as string;
        payload.positionSubject = formData.get('positionSubject') as string;
    }
    if(visibleFields.has('yearsOfExperience')) payload.yearsOfExperience = Number(formData.get('yearsOfExperience'));
    if(visibleFields.has('expectedSalary')) payload.expectedSalary = Number(formData.get('expectedSalary'));
    if(visibleFields.has('schoolType')) payload.schoolType = formData.get('schoolType') as any;
    if(visibleFields.has('noticePeriod')) payload.noticePeriod = Number(formData.get('noticePeriod'));
    if(visibleFields.has('availableStartDate')) payload.availableStartDate = availableStartDate;
    if(visibleFields.has('needsBus')) payload.needsBus = formData.get('needsBus') as any;
    if(visibleFields.has('insideContact')) payload.insideContact = formData.get('insideContact') as any;
    if(visibleFields.has('references')) {
        payload.reference1_name = formData.get('reference1_name') as string;
        payload.reference1_jobTitle = formData.get('reference1_jobTitle') as string;
        payload.reference1_company = formData.get('reference1_company') as string;
        payload.reference1_phone = formData.get('reference1_phone') as string;
        payload.reference2_name = formData.get('reference2_name') as string;
        payload.reference2_jobTitle = formData.get('reference2_jobTitle') as string;
        payload.reference2_company = formData.get('reference2_company') as string;
        payload.reference2_phone = formData.get('reference2_phone') as string;
        payload.reference3_name = formData.get('reference3_name') as string;
        payload.reference3_jobTitle = formData.get('reference3_jobTitle') as string;
        payload.reference3_company = formData.get('reference3_company') as string;
        payload.reference3_phone = formData.get('reference3_phone') as string;
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
      <DialogContent className="max-w-3xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Apply for {job.title}</DialogTitle>
          <DialogDescription>
            Fill in your details and upload your resume to apply.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleFormSubmit} noValidate className="flex-grow overflow-hidden">
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
                
                <Separator />
                <h3 className="font-semibold text-lg border-b pb-2">Job Requirements</h3>
                
                {visibleFields.has('howDidYouHear') && (
                    <div className="space-y-2">
                        <Label htmlFor="howDidYouHear">How did you learn about N.I.S.?</Label>
                        <Input id="howDidYouHear" name="howDidYouHear" disabled={isPending} />
                    </div>
                )}

                {visibleFields.has('previouslyWorkedAtNIS') && (
                    <div className="space-y-2">
                        <Label>Did you previously work at NIS?</Label>
                        <RadioGroup name="previouslyWorkedAtNIS" defaultValue="No" className="flex gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="prev-yes" /><Label htmlFor="prev-yes">Yes</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="prev-no" /><Label htmlFor="prev-no">No</Label></div>
                        </RadioGroup>
                    </div>
                )}

                {visibleFields.has('positionApplyingFor') && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="positionJobTitle">Job Title</Label>
                            <Input id="positionJobTitle" name="positionJobTitle" disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="positionSubject">Subject</Label>
                            <Input id="positionSubject" name="positionSubject" disabled={isPending} />
                        </div>
                    </div>
                )}

                {visibleFields.has('yearsOfExperience') && (
                    <div className="space-y-2">
                        <Label htmlFor="yearsOfExperience">Years of Experience in that position</Label>
                        <Input id="yearsOfExperience" name="yearsOfExperience" type="number" min="0" disabled={isPending} />
                    </div>
                )}
                
                {visibleFields.has('expectedSalary') && (
                    <div className="space-y-2">
                        <Label htmlFor="expectedSalary">Expected monthly salary</Label>
                        <Input id="expectedSalary" name="expectedSalary" type="number" min="0" disabled={isPending} />
                    </div>
                )}
                
                {visibleFields.has('schoolType') && (
                    <div className="space-y-2">
                        <Label>School Type Experience</Label>
                        <RadioGroup name="schoolType" className="flex gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="National" id="school-national" /><Label htmlFor="school-national">National</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="International" id="school-international" /><Label htmlFor="school-international">International</Label></div>
                        </RadioGroup>
                    </div>
                )}

                {visibleFields.has('noticePeriod') && (
                    <div className="space-y-2">
                        <Label htmlFor="noticePeriod">Minimum notice period in days to leave your current job</Label>
                        <Input id="noticePeriod" name="noticePeriod" type="number" min="0" disabled={isPending} />
                    </div>
                )}

                {visibleFields.has('availableStartDate') && (
                    <div className="space-y-2">
                        <Label>Available to start work on</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !availableStartDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {availableStartDate ? format(availableStartDate, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={availableStartDate} onSelect={setAvailableStartDate} initialFocus />
                            </PopoverContent>
                        </Popover>
                    </div>
                )}

                {visibleFields.has('needsBus') && (
                    <div className="space-y-2">
                        <Label>Do you need school transportation “School Bus”?</Label>
                        <RadioGroup name="needsBus" className="flex gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="bus-yes" /><Label htmlFor="bus-yes">Yes</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="bus-no" /><Label htmlFor="bus-no">No</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="Flexible" id="bus-flexible" /><Label htmlFor="bus-flexible">Flexible</Label></div>
                        </RadioGroup>
                    </div>
                )}

                {visibleFields.has('insideContact') && (
                     <div className="space-y-2">
                        <Label>Do you have any contacts [relatives, friends] in our School?</Label>
                        <RadioGroup name="insideContact" defaultValue="No" className="flex gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="contact-yes" /><Label htmlFor="contact-yes">Yes</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="contact-no" /><Label htmlFor="contact-no">No</Label></div>
                        </RadioGroup>
                    </div>
                )}

                {visibleFields.has('references') && (
                    <>
                        <Separator />
                        <h3 className="font-semibold text-lg border-b pb-2">References</h3>
                        <p className="text-sm text-muted-foreground">Please provide at least three professional references. Do not include family members.</p>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 border rounded-lg space-y-2">
                                <Label className="font-medium">Reference {i}</Label>
                                <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-1">
                                        <Label htmlFor={`ref-name-${i}`} className="text-xs">Reference Name</Label>
                                        <Input id={`ref-name-${i}`} name={`reference${i}_name`} disabled={isPending} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`ref-title-${i}`} className="text-xs">Job Title</Label>
                                        <Input id={`ref-title-${i}`} name={`reference${i}_jobTitle`} disabled={isPending} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`ref-company-${i}`} className="text-xs">Company</Label>
                                        <Input id={`ref-company-${i}`} name={`reference${i}_company`} disabled={isPending} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`ref-phone-${i}`} className="text-xs">Phone Number</Label>
                                        <Input id={`ref-phone-${i}`} name={`reference${i}_phone`} type="tel" disabled={isPending} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
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
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
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
