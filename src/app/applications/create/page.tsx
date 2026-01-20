
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, ArrowRight, ArrowLeft, PlusCircle, Trash2, UploadCloud, Loader2 } from "lucide-react";
import { useState, useEffect, useTransition, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { useRouter } from "next/navigation";
import { applyForJobAction, type ApplyForJobState, type JobApplicationPayload } from "@/app/actions/job-actions";
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const initialState: ApplyForJobState = {
  message: null,
  errors: {},
  success: false,
};

function PersonalInfoSection() {
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold border-b pb-2">Personal Info</h3>
      
      <div className="space-y-2">
        <Label>Name in English (As in official documents)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input name="firstNameEn" placeholder="First Name *" required />
          <Input name="middleNameEn" placeholder="Middle Name" />
          <Input name="lastNameEn" placeholder="Last Name *" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Name in Arabic (As in I.D.)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input name="familyNameAr" placeholder="* العائلة" required dir="rtl" />

          <Input name="fatherNameAr" placeholder="اسم الأب" dir="rtl" />
          <Input name="firstNameAr" placeholder="* الاسم الأول" required dir="rtl" />

        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
            <Label>Date of Birth (as in official documents)</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} />
                </PopoverContent>
            </Popover>
            <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString() ?? ''} />
        </div>
        <div className="space-y-2">
            <Label htmlFor="nationalities">Nationality(ies)</Label>
            <Input id="nationalities" name="nationalities" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="placeOfBirth">Place of Birth (as in official documents)</Label>
        <Input id="placeOfBirth" name="placeOfBirth" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Social Title</Label>
          <RadioGroup name="socialTitle" className="flex items-center space-x-4 pt-2">
            <div className="flex items-center space-x-2"><RadioGroupItem value="Mr" id="title-mr" /><Label htmlFor="title-mr">Mr</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Miss" id="title-miss" /><Label htmlFor="title-miss">Miss</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Mrs" id="title-mrs" /><Label htmlFor="title-mrs">Mrs</Label></div>
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <Label>Are you a parent at NIS?</Label>
          <RadioGroup name="isParentAtNIS" defaultValue="No" className="flex items-center space-x-4 pt-2">
            <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="is-parent-yes" /><Label htmlFor="is-parent-yes">Yes</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="is-parent-no" /><Label htmlFor="is-parent-no">No</Label></div>
          </RadioGroup>
        </div>
         <div className="space-y-2">
            <Label htmlFor="numberOfChildren">Number of children (if any)</Label>
            <Input id="numberOfChildren" name="numberOfChildren" type="number" min="0" defaultValue="0" />
        </div>
      </div>
      
       <div className="space-y-2">
          <Label>Marital Status</Label>
            <RadioGroup name="maritalStatus" className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Single" id="status-single" /><Label htmlFor="status-single">Single</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Engaged" id="status-engaged" /><Label htmlFor="status-engaged">Engaged</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Married" id="status-married" /><Label htmlFor="status-married">Married</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Divorced" id="status-divorced" /><Label htmlFor="status-divorced">Divorced</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Separated" id="status-separated" /><Label htmlFor="status-separated">Separated</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Widowed" id="status-widowed" /><Label htmlFor="status-widowed">Widowed</Label></div>
          </RadioGroup>
        </div>

      <Separator />

      <h3 className="text-xl font-semibold border-b pb-2">Contact & Address</h3>
      
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" name="country" /></div>
          <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" name="city" /></div>
          <div className="space-y-2"><Label htmlFor="area">Area</Label><Input id="area" name="area" /></div>
          <div className="space-y-2"><Label htmlFor="street">Street</Label><Input id="street" name="street" /></div>
          <div className="space-y-2"><Label htmlFor="building">Building/Floor</Label><Input id="building" name="building" /></div>
          <div className="space-y-2"><Label htmlFor="apartment">Apartment Number</Label><Input id="apartment" name="apartment" /></div>
          <div className="space-y-2"><Label htmlFor="homePhone">Home Telephone Number</Label><Input id="homePhone" name="homePhone" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="mobilePhone">Mobile</Label><Input id="mobilePhone" name="mobilePhone" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="otherPhone">Other Telephone Numbers</Label><Input id="otherPhone" name="otherPhone" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="email1">Email address (1)</Label><Input id="email1" name="email1" type="email"/></div>
          <div className="space-y-2"><Label htmlFor="email2">Email address (2)</Label><Input id="email2" name="email2" type="email"/></div>
       </div>
    </div>
  );
}

function JobRequirementsSection() {
    const [availableStartDate, setAvailableStartDate] = useState<Date | undefined>();
    const [schoolType, setSchoolType] = useState<string>('');
    const { campuses, isLoading: isLoadingCampuses } = useOrganizationLists();

    return (
    <div className="space-y-6">
        <h3 className="text-xl font-semibold border-b pb-2">Job Requirements</h3>
        <div className="space-y-2">
            <Label htmlFor="howDidYouHear">How did you learn about N.I.S.?</Label>
            <Input id="howDidYouHear" name="howDidYouHear" />
        </div>
        <div className="space-y-2">
            <Label>Did you previously work at NIS?</Label>
            <RadioGroup name="previouslyWorkedAtNIS" defaultValue="No" className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="prev-yes" /><Label htmlFor="prev-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="prev-no" /><Label htmlFor="prev-no">No</Label></div>
            </RadioGroup>
        </div>
         <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="positionJobTitle">Job Title</Label>
                <Input id="positionJobTitle" name="positionJobTitle" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="positionSubject">Subject</Label>
                <Input id="positionSubject" name="positionSubject" />
            </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="yearsOfExperience">Years of Experience in that position</Label>
            <Input id="yearsOfExperience" name="yearsOfExperience" type="number" min="0" />
        </div>
        <div className="space-y-2">
            <Label htmlFor="expectedSalary">Expected monthly salary</Label>
            <Input id="expectedSalary" name="expectedSalary" type="number" min="0" />
        </div>
        <div className="space-y-2">
            <Label>School Type Experience</Label>
            <RadioGroup name="schoolType" onValueChange={setSchoolType} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="National" id="school-national" /><Label htmlFor="school-national">National</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="International" id="school-international" /><Label htmlFor="school-international">International</Label></div>
            </RadioGroup>
        </div>
        {(schoolType === 'National' || schoolType === 'International') && (
        <div className="space-y-2">
            <Label htmlFor="nationalCampus">Campus</Label>
            <Select name="nationalCampus" disabled={isLoadingCampuses}>
                <SelectTrigger>
                    <SelectValue placeholder={isLoadingCampuses ? "Loading campuses..." : "Select a campus"} />
                </SelectTrigger>
                <SelectContent>
                    {campuses.map(campus => (
                        <SelectItem key={campus.id} value={campus.name}>{campus.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        )}
        <div className="space-y-2">
            <Label htmlFor="noticePeriod">Minimum notice period in days to leave your current job</Label>
            <Input id="noticePeriod" name="noticePeriod" type="number" min="0" />
        </div>
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
                    <Calendar mode="single" selected={availableStartDate} onSelect={setAvailableStartDate} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} />
                </PopoverContent>
            </Popover>
            <input type="hidden" name="availableStartDate" value={availableStartDate?.toISOString() ?? ''} />
        </div>
        <div className="space-y-2">
            <Label>Do you need school transportation “School Bus”?</Label>
            <RadioGroup name="needsBus" className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="bus-yes" /><Label htmlFor="bus-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="bus-no" /><Label htmlFor="bus-no">No</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Flexible" id="bus-flexible" /><Label htmlFor="bus-flexible">Flexible</Label></div>
            </RadioGroup>
        </div>
        <div className="space-y-2">
            <Label>Do you have any contacts [relatives, friends] in our School?</Label>
            <RadioGroup name="insideContact" defaultValue="No" className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="contact-yes" /><Label htmlFor="contact-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="contact-no" /><Label htmlFor="contact-no">No</Label></div>
            </RadioGroup>
        </div>
    </div>
    )
}

function EducationalHistorySection() {
    const [schoolStartDate, setSchoolStartDate] = useState<Date | undefined>();
    const [schoolEndDate, setSchoolEndDate] = useState<Date | undefined>();
    const [universityStartDate, setUniversityStartDate] = useState<Date | undefined>();
    const [universityEndDate, setUniversityEndDate] = useState<Date | undefined>();

    return (
    <div className="space-y-6">
        <h3 className="text-xl font-semibold border-b pb-2">Educational History</h3>
         <p className="text-sm text-muted-foreground">Please give exact titles in their original language.</p>
        
        <div className="p-4 border rounded-lg space-y-4">
            <Label className="font-medium">School (highest degree)</Label>
            <div className="grid grid-cols-2 gap-4">
                <Input name="school_name" placeholder="School Name" />
                <Input name="school_major" placeholder="Major" />
                <Input name="school_cityCountry" placeholder="City, Country" />
                <Input name="school_overall" placeholder="Overall" />
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{schoolStartDate ? format(schoolStartDate, "PPP") : <span>From</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={schoolStartDate} onSelect={setSchoolStartDate} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} /></PopoverContent></Popover>
                <input type="hidden" name="school_startDate" value={schoolStartDate?.toISOString() ?? ''} />
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{schoolEndDate ? format(schoolEndDate, "PPP") : <span>To</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={schoolEndDate} onSelect={setSchoolEndDate} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} /></PopoverContent></Popover>
                <input type="hidden" name="school_endDate" value={schoolEndDate?.toISOString() ?? ''} />
                <div className="col-span-2"><RadioGroup name="school_completed" className="flex gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="school-completed-yes" /><Label htmlFor="school-completed-yes">Completed</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="No" id="school-completed-no" /><Label htmlFor="school-completed-no">Not Completed</Label></div></RadioGroup></div>
            </div>
        </div>

        <div className="p-4 border rounded-lg space-y-4">
            <Label className="font-medium">University</Label>
            <div className="grid grid-cols-2 gap-4">
                <Input name="university_name" placeholder="University Name" />
                <Input name="university_faculty" placeholder="Faculty" />
                <Input name="university_major" placeholder="Major" />
                <Input name="university_cityCountry" placeholder="City, Country" />
                <Input name="university_overall" placeholder="Overall" />
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{universityStartDate ? format(universityStartDate, "PPP") : <span>From</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={universityStartDate} onSelect={setUniversityStartDate} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} /></PopoverContent></Popover>
                <input type="hidden" name="university_startDate" value={universityStartDate?.toISOString() ?? ''} />
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{universityEndDate ? format(universityEndDate, "PPP") : <span>To</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={universityEndDate} onSelect={setUniversityEndDate} captionLayout="dropdown-buttons" fromYear={1920} toYear={2026} /></PopoverContent></Popover>
                <input type="hidden" name="university_endDate" value={universityEndDate?.toISOString() ?? ''} />
                <div className="col-span-2"><RadioGroup name="university_completed" className="flex gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="uni-completed-yes" /><Label htmlFor="uni-completed-yes">Completed</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="No" id="uni-completed-no" /><Label htmlFor="uni-completed-no">Not Completed</Label></div></RadioGroup></div>
            </div>
        </div>

         <div className="p-4 border rounded-lg space-y-4">
            <Label className="font-medium">Diplomas & Courses</Label>
             <div className="grid grid-cols-3 items-center gap-4">
                 <Input name="diploma1_name" placeholder="Course Name" />
                 <Input name="diploma1_institution" placeholder="Institution Name" />
                 <RadioGroup name="diploma1_completed" className="flex gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="completed" id="d1-completed-yes" /><Label htmlFor="d1-completed-yes">Completed</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="not completed" id="d1-completed-no" /><Label htmlFor="d1-completed-no">Not Completed</Label></div></RadioGroup>
             </div>
             <div className="grid grid-cols-3 items-center gap-4">
                 <Input name="diploma2_name" placeholder="Course Name" />
                 <Input name="diploma2_institution" placeholder="Institution Name" />
                 <RadioGroup name="diploma2_completed" className="flex gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="completed" id="d2-completed-yes" /><Label htmlFor="d2-completed-yes">Completed</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="not completed" id="d2-completed-no" /><Label htmlFor="d2-completed-no">Not Completed</Label></div></RadioGroup>
             </div>
        </div>
    </div>
    )
}

function LanguageAndSkillsSection() {
     const ProficiencySelect = () => (
        <SelectContent>
            <SelectItem value="Poor">Poor</SelectItem><SelectItem value="Fair">Fair</SelectItem><SelectItem value="Very good">Very good</SelectItem><SelectItem value="Excellent">Excellent</SelectItem>
        </SelectContent>
    );
     const SkillSelect = () => (
        <SelectContent>
            <SelectItem value="None">None</SelectItem><SelectItem value="Beginner">Beginner</SelectItem><SelectItem value="Intermediate">Intermediate</SelectItem><SelectItem value="Advanced">Advanced</SelectItem>
        </SelectContent>
    );
    return (
    <div className="space-y-6">
        <h3 className="text-xl font-semibold border-b pb-2">Language & Computer Skills</h3>
        <div className="p-4 border rounded-lg space-y-4">
            <Label className="font-medium">Language Skills</Label>
            {['english', 'french', 'arabic', 'german'].map(lang => (
                <div key={lang} className="space-y-2">
                    <Label className="capitalize">{lang}</Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <Select name={`lang_${lang}_speak`}><SelectTrigger><SelectValue placeholder="Speak" /></SelectTrigger><ProficiencySelect/></Select>
                        <Select name={`lang_${lang}_understand`}><SelectTrigger><SelectValue placeholder="Understand" /></SelectTrigger><ProficiencySelect/></Select>
                        <Select name={`lang_${lang}_read`}><SelectTrigger><SelectValue placeholder="Read" /></SelectTrigger><ProficiencySelect/></Select>
                        <Select name={`lang_${lang}_write`}><SelectTrigger><SelectValue placeholder="Write" /></SelectTrigger><ProficiencySelect/></Select>
                        <Input name={`lang_${lang}_typing`} type="number" placeholder="w/m" />
                    </div>
                </div>
            ))}
        </div>
        <div className="p-4 border rounded-lg space-y-4">
            <Label className="font-medium">Computer Skills</Label>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Microsoft Office</Label><Select name="skill_ms_office"><SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger><SkillSelect/></Select></div>
                <div className="space-y-2"><Label>Smart Board</Label><Select name="skill_smart_board"><SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger><SkillSelect/></Select></div>
                <div className="space-y-2"><Label>E-Learning Platforms</Label><Select name="skill_e_learning"><SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger><SkillSelect/></Select></div>
                <div className="space-y-2"><Label>Google Classroom/Zoom</Label><Select name="skill_gclass_zoom"><SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger><SkillSelect/></Select></div>
                 <div className="space-y-2 col-span-2"><Label>Oracle Database</Label><Select name="skill_oracle_db"><SelectTrigger><SelectValue placeholder="Select level..." /></SelectTrigger><SkillSelect/></Select></div>
            </div>
        </div>
    </div>
    )
}

function WorkExperienceSection() {
  const [workExperiences, setWorkExperiences] = useState<{ id: string }[]>([]);
  const handleAddWorkExperience = () => setWorkExperiences(prev => [...prev, { id: `exp-${Date.now()}` }]);
  const handleRemoveWorkExperience = (id: string) => setWorkExperiences(prev => prev.filter(exp => exp.id !== id));

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold border-b pb-2">Work Experience</h3>
      <p className="text-sm text-muted-foreground">Starting with the present post, but in reverse the order of every employment you have had. Use a separate block for each post.</p>
      
      <div className="space-y-4">
        {workExperiences.map((exp, index) => (
          <div key={exp.id} className="p-4 border rounded-lg space-y-4 relative">
             <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => handleRemoveWorkExperience(exp.id)}>
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove Work Experience</span>
              </Button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`company-${exp.id}`}>Full Name of Company/School</Label>
                <Input id={`company-${exp.id}`} name={`workExperience[${index}][companyName]`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`jobTitle-${exp.id}`}>Job Title</Label>
                <Input id={`jobTitle-${exp.id}`} name={`workExperience[${index}][jobTitle]`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`stage-${exp.id}`}>Stage</Label>
                <Input id={`stage-${exp.id}`} name={`workExperience[${index}][stage]`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`department-${exp.id}`}>Department</Label>
                <Input id={`department-${exp.id}`} name={`workExperience[${index}][department]`} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`address-${exp.id}`}>Address</Label>
              <Input id={`address-${exp.id}`} name={`workExperience[${index}][address]`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`telephone-${exp.id}`}>Telephone</Label>
              <Input id={`telephone-${exp.id}`} name={`workExperience[${index}][telephone]`} type="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`duties-${exp.id}`}>Description of your duties</Label>
              <Textarea id={`duties-${exp.id}`} name={`workExperience[${index}][duties]`} />
            </div>
             <div className="space-y-2">
              <Label htmlFor={`supervisedCount-${exp.id}`}>Number of employees supervised by you</Label>
              <Input id={`supervisedCount-${exp.id}`} name={`workExperience[${index}][supervisedCount]`} type="number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`reasonForLeaving-${exp.id}`}>Reason for Leaving</Label>
              <Input id={`reasonForLeaving-${exp.id}`} name={`workExperience[${index}][reasonForLeaving]`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`supervisorName-${exp.id}`}>Full Name of your Supervisor</Label>
              <Input id={`supervisorName-${exp.id}`} name={`workExperience[${index}][supervisorName]`} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label htmlFor={`salary-${exp.id}`}>Basic salary / month</Label>
                <Input id={`salary-${exp.id}`} name={`workExperience[${index}][salary]`} type="number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`benefits-${exp.id}`}>Benefits</Label>
                <Input id={`benefits-${exp.id}`} name={`workExperience[${index}][benefits]`} />
              </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>From</Label>
                    <Input type="date" name={`workExperience[${index}][fromDate]`} />
                </div>
                 <div className="space-y-2">
                    <Label>To</Label>
                    <Input type="date" name={`workExperience[${index}][toDate]`} />
                </div>
             </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={handleAddWorkExperience}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Work Experience
        </Button>
      </div>

      <Separator className="my-8" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
                <Label htmlFor="cv">CV *</Label>
                <div className="flex items-center gap-2">
                    <Input id="cv" name="cv" type="file" required className="flex-1" />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="nationalId">National ID / Passport</Label>
                 <div className="flex items-center gap-2">
                    <Input id="nationalId" name="nationalId" type="file" className="flex-1" accept="image/*,.pdf" />
                </div>
            </div>
        </div>
        
        <div className="space-y-2 pt-6">
            <Label>Were you contacted by the school's HR? *</Label>
            <RadioGroup name="contactedByHR" required className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="hr-yes" /><Label htmlFor="hr-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="hr-no" /><Label htmlFor="hr-no">No</Label></div>
            </RadioGroup>
        </div>
    </div>
  );
}

export default function CreateApplicationPage() {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const { toast } = useToast();
  const [isSubmitting, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);


  useEffect(() => {
    if (state.success && state.applicationId) {
      toast({ title: "Success", description: state.message });
      router.push(`/form/${state.applicationId}`); // Redirect with the new ID
    } else if (!state.success && state.message) {
      toast({ title: "Error", description: state.message, variant: "destructive" });
    }
  }, [state, toast, router]);

  const nextStep = () => {
    const form = formRef.current;
    if (!form) return;

    const currentStepContainer = form.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!currentStepContainer) {
        setStep(s => s + 1); // Failsafe in case the selector fails
        return;
    };
    
    // Find all required native inputs
    const inputs = Array.from(
      currentStepContainer.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input[required], select[required], textarea[required]'
      )
    );

    let firstInvalidInput: HTMLElement | null = null;

    // Check validity for native elements
    for (const input of inputs) {
        if (input.offsetParent !== null) { // is visible
            if (!input.checkValidity()) {
                if (!firstInvalidInput) {
                    firstInvalidInput = input;
                }
            }
        }
    }
    
    if (firstInvalidInput) {
        firstInvalidInput.focus();
        (firstInvalidInput as HTMLInputElement).reportValidity();
        toast({
            title: "Missing Information",
            description: "Please fill out all required fields marked with an asterisk (*).",
            variant: "destructive",
        });
        return;
    }

    // If all native inputs are valid, we can add special checks for custom components here if needed in the future

    // If all good, proceed
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  };
  const prevStep = () => setStep(s => s - 1);
  
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formRef.current!;

    // Final validation before submitting
    if (!form.checkValidity()) {
        form.reportValidity();
        toast({
            title: "Missing Information",
            description: "Please ensure all required fields are filled out before submitting.",
            variant: "destructive",
        });
        return;
    }

    const formData = new FormData(form);
    const cvFile = formData.get('cv') as File | null;
    const nationalIdFile = formData.get('nationalId') as File | null;
    const contactedByHR = formData.get('contactedByHR');

    if (!cvFile || cvFile.size === 0) {
        toast({ variant: 'destructive', title: 'CV Required', description: 'Please upload your CV.' });
        return;
    }
    if (!contactedByHR) {
        toast({ variant: 'destructive', title: 'HR Contact confirmation Required', description: 'Please specify if you were contacted by HR.' });
        return;
    }

    startTransition(async () => {
        try {
            const cvUrl = await uploadFile(cvFile, 'cv');
            let nationalIdUrl: string | undefined = undefined;
            if (nationalIdFile && nationalIdFile.size > 0) {
                nationalIdUrl = await uploadFile(nationalIdFile, 'nationalId');
            }

            const rawPayload = Object.fromEntries(formData.entries());

            const workExperiences: any[] = [];
            formData.forEach((value, key) => {
              const match = key.match(/workExperience\[(\d+)\]\[([^\]]+)\]/);
              if (match) {
                    const index = parseInt(match[1], 10);
                    const field = match[2];
                    if (!workExperiences[index]) {
                        workExperiences[index] = { id: `exp-${index}`};
                    }
                    workExperiences[index][field] = value;
                }
            });

            const payload = {
              ...rawPayload,
              jobId: 'online-application',
              jobTitle: 'Online Application',
              cvUrl,
              nationalIdUrl,
              workExperience: workExperiences.filter(Boolean),
            } as JobApplicationPayload;


            // Remove file objects from payload to avoid serialization errors
            delete (payload as any).cv;
            delete (payload as any).nationalId;

            const result = await applyForJobAction(payload);
            setState(result);

        } catch (error) {
            console.error("Submission error:", error);
            setState({ success: false, message: "An error occurred during file upload." });
        }
    });
  };

  const uploadFile = async (file: File, type: string): Promise<string> => {
    const filePath = `online-applications/${nanoid()}-${type}-${file.name}`;
    const fileRef = ref(storage, filePath);
    const snapshot = await uploadBytes(fileRef, file);
    return getDownloadURL(snapshot.ref);
  };


  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Online Application
          </h1>
          <p className="text-muted-foreground">
            Please fill out the form below to apply.
          </p>
        </header>
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Application Form - Step {step} of 5</CardTitle>
                <CardDescription>All fields marked with * are required.</CardDescription>
            </CardHeader>
            <CardContent>
                <form ref={formRef} onSubmit={handleFormSubmit}>
                 <div data-step="1" className={step === 1 ? "block" : "hidden"}>
                    <PersonalInfoSection />
                </div>
                <div data-step="2" className={step === 2 ? "block" : "hidden"}>
                    <JobRequirementsSection />
                </div>
                <div data-step="3" className={step === 3 ? "block" : "hidden"}>
                    <EducationalHistorySection />
                </div>
                <div data-step="4" className={step === 4 ? "block" : "hidden"}>
                    <LanguageAndSkillsSection />
                </div>
                <div data-step="5" className={step === 5 ? "block" : "hidden"}>
                    <WorkExperienceSection />
                </div>
                    <div className="flex justify-between mt-8">
                        {step > 1 && (
                            <Button type="button" variant="outline" onClick={prevStep}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Previous
                            </Button>
                        )}
                        {step < 5 ? (
                             <Button type="button" onClick={nextStep} className={cn(step === 1 && 'ml-auto')}>
                                Next
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit Application
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
