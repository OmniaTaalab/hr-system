

"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2, AlertCircle, Loader2, UserCheck, UserX, Clock, DollarSign, Calendar as CalendarIcon, CheckIcon, ChevronsUpDown, UserPlus, ShieldCheck, UserMinus, Eye, EyeOff, KeyRound, UploadCloud, File, Download, Filter, ArrowLeft, ArrowRight, UserCircle2, Phone, Briefcase, FileDown, MailWarning, PhoneCall, UserRoundCheck, X } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef, useCallback, useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  createEmployeeAction, type CreateEmployeeState,
  updateEmployeeAction, type UpdateEmployeeState, 
  deleteEmployeeAction, type DeleteEmployeeState,
  deactivateEmployeeAction, type DeactivateEmployeeState,
  activateEmployeeAction, type ActivateEmployeeState,
  batchCreateEmployeesAction,
} from "@/lib/firebase/admin-actions";
import { 
  createAuthUserForEmployeeAction, type CreateAuthUserState,
    deleteAuthUserAction, type DeleteAuthUserState,
  updateAuthUserPasswordAction, type UpdateAuthPasswordState
} from "@/app/actions/auth-creation-actions";
import { db, storage } from '@/lib/firebase/config';
import { collection, onSnapshot, query, doc, Timestamp, where, updateDoc, arrayUnion, arrayRemove, getDocs, orderBy, limit, startAfter, endBefore, limitToLast, DocumentData, DocumentSnapshot, QueryConstraint, or } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, getYear } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageUploader } from "@/components/image-uploader";
import { useOrganizationLists, type ListItem } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { EmployeeFileManager } from "@/components/employee-file-manager";
import { Textarea } from "@/components/ui/textarea";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import * as XLSX from 'xlsx';
import { MultiSelectFilter, type OptionType } from "@/components/multi-select";


export interface EmployeeFile {
  name: string;
  url: string;
  uploadedAt: Timestamp;
}

interface EmergencyContact {
  name: string;
  relationship: string;
  number: string;
}

export interface Employee {
  id: string; 
  name: string;
  nameAr?: string;
  childrenAtNIS?: 'Yes' | 'No';
  firstName?: string;
  lastName?: string;
  personalEmail?: string;
  emergencyContact?: EmergencyContact;
  reportLine1?: string;
  reportLine2?: string;
  employeeId: string; 
  department: string;
  role: string;
  stage: string;
  system: string;
  campus: string;
  email: string; // This is NIS Email
  phone: string; // This is Personal Phone
  hourlyRate?: number;
  userId?: string | null;
  photoURL?: string | null;
  dateOfBirth?: Timestamp | Date | string; // Can be either
  joiningDate?: Timestamp | Date | string; // Can be either
  leavingDate?: Timestamp | Date | null; // Can be either
  leaveBalances?: { [key: string]: number };
  documents?: EmployeeFile[];
  createdAt?: Timestamp; 
  gender?: string;
  nationalId?: string;
  religion?: string;
  subject?: string;
  title?: string;
  status?: "Active" | "deactivated";
  reasonForLeaving?: string;
}


const initialCreateEmployeeState: CreateEmployeeState = {
  message: null,
  errors: {},
  success: false,
};

const initialEditEmployeeState: UpdateEmployeeState = {
  message: null,
  errors: {},
};

const initialCreateAuthState: CreateAuthUserState = {
  message: null,
  errors: {},
  success: false,
};

const initialDeleteAuthState: DeleteAuthUserState = {
  message: null,
  errors: {},
  success: false,
};

const initialDeleteEmployeeState: DeleteEmployeeState = {
  message: null,
  errors: {},
  success: false,
};

const initialUpdatePasswordState: UpdateAuthPasswordState = {
  message: null,
  errors: {},
  success: false,
};

const initialDeactivateState: DeactivateEmployeeState = {
    message: null,
    errors: {},
    success: false,
};

const initialActivateState: ActivateEmployeeState = {
    message: null,
    errors: {},
    success: false,
};


const initialBatchCreateState: {
    message: string | null;
    errors: Record<string, any>;
    success: boolean;
} = {
    message: null,
    errors: {},
    success: false,
};


const PAGE_SIZE = 15;

// Utility to safely convert Firestore Timestamp or serialized object to JS Date
function safeToDate(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    // Handle serialized Timestamp object
    if (typeof timestamp === 'object' && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
        return new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
    }
    // Handle older serialized Timestamps
    if (typeof timestamp === 'object' && '_seconds' in timestamp && '_nanoseconds' in timestamp) {
        return new Timestamp(timestamp._seconds, timestamp._nanoseconds).toDate();
    }
    // Handle ISO strings
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}


// Internal component for Add Employee Form
function AddEmployeeFormContent({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const [addState, addAction, isAddPending] = useActionState(createEmployeeAction, initialCreateEmployeeState);
  const { roles, stage: stages, systems, campuses, isLoading: isLoadingLists } = useOrganizationLists();
  
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();
  const [joiningDate, setJoiningDate] = useState<Date | undefined>();
  const [role, setRole] = useState("");
  const [campus, setCampus] = useState("");
  const [system, setSystem] = useState("");
  const [gender, setGender] = useState("");
  const [stage, setStage] = useState("");
  const [childrenAtNIS, setChildrenAtNIS] = useState<'Yes' | 'No'>('No');

  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState.message) {
      toast({
        title: addState.success ? "Success" : "Error",
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) {
        onSuccess(); // Close dialog on success
      }
    }
  }, [addState, toast, onSuccess]);


  return (
    <>
      <DialogHeader>
        <DialogTitle>Add New Employee</DialogTitle>
        <DialogDescription>
          Enter the new employee's details. An employee ID will be generated automatically if left blank.
        </DialogDescription>
      </DialogHeader>
       <form
        ref={addFormRef}
        action={addAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="actorId" value={profile?.id} />
        <input type="hidden" name="actorEmail" value={profile?.email} />
        <input type="hidden" name="actorRole" value={profile?.role} />
        {/* Hidden inputs for controlled Selects */}
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="campus" value={campus} />
        <input type="hidden" name="system" value={system} />
        <input type="hidden" name="gender" value={gender || ''} />
        <input type="hidden" name="stage" value={stage || ''} />
        <input type="hidden" name="childrenAtNIS" value={childrenAtNIS} />
        <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString() ?? ''} />
        <input type="hidden" name="joiningDate" value={joiningDate?.toISOString() ?? ''} />

        <ScrollArea className="flex-grow min-h-[150px] max-h-[60vh]">
          <div className="space-y-6 p-4 pr-6">
            <h3 className="text-lg font-semibold flex items-center"><UserCircle2 className="mr-2 h-5 w-5 text-primary" />Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="add-firstName">First Name *</Label>
                  <Input id="add-firstName" name="firstName" required />
                  {addState?.errors?.firstName && <p className="text-sm text-destructive">{addState.errors.firstName.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                  <Label htmlFor="add-lastName">Last Name</Label>
                  <Input id="add-lastName" name="lastName" />
                  {addState?.errors?.lastName && <p className="text-sm text-destructive">{addState.errors.lastName.join(', ')}</p>}
              </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="add-name-ar">Full Name (Arabic)</Label>
                <Input id="add-name-ar" name="nameAr" dir="rtl" />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="add-personalEmail">Personal Email</Label>
                  <Input id="add-personalEmail" name="personalEmail" type="email" />
                  {addState?.errors?.personalEmail && <p className="text-sm text-destructive">{addState.errors.personalEmail.join(', ')}</p>}
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="add-phone">Personal Phone</Label>
                  <Input id="add-phone" name="personalPhone" placeholder="Numbers only" />
                </div>
            </div>
            <div className="space-y-2">
                <h4 className="font-medium flex items-center text-sm"><PhoneCall className="mr-2 h-4 w-4"/>Emergency Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                     <div className="space-y-2"><Label htmlFor="add-emergencyContactName">Name</Label><Input id="add-emergencyContactName" name="emergencyContactName" /></div>
                     <div className="space-y-2"><Label htmlFor="add-emergencyContactRelationship">Relationship</Label><Input id="add-emergencyContactRelationship" name="emergencyContactRelationship" /></div>
                     <div className="space-y-2"><Label htmlFor="add-emergencyContactNumber">Number</Label><Input id="add-emergencyContactNumber" name="emergencyContactNumber" /></div>
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-dateOfBirth">Date of Birth</Label>
                    <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={2025} initialFocus /></PopoverContent></Popover>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-gender">Gender</Label>
                    <Select value={gender} onValueChange={setGender}><SelectTrigger><SelectValue placeholder="Select Gender" /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><Label htmlFor="add-nationalId">National ID</Label><Input id="add-nationalId" name="nationalId" /></div>
                <div className="space-y-2"><Label htmlFor="add-religion">Religion</Label><Input id="add-religion" name="religion" /></div>
            </div>
             <div className="space-y-2"><Label>Do they have children enrolled at NIS?</Label><RadioGroup name="childrenAtNIS" value={childrenAtNIS} onValueChange={(val) => setChildrenAtNIS(val as 'Yes' | 'No')} className="flex items-center space-x-4"><div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="add-children-yes" /><Label htmlFor="add-children-yes">Yes</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="No" id="add-children-no" /><Label htmlFor="add-children-no">No</Label></div></RadioGroup></div>
            <Separator />
            <h3 className="text-lg font-semibold flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" />Work Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-employeeId">Employee ID </Label>
                    <Input id="add-employeeId" name="employeeId" />
                    {addState?.errors?.employeeId && <p className="text-sm text-destructive">{addState.errors.employeeId.join(', ')}</p>}
                </div>
                <div className="space-y-2"><Label htmlFor="add-nisEmail">NIS Email</Label><Input id="add-nisEmail" name="nisEmail" type="email" /><p className="text-xs text-destructive">{addState?.errors?.email && addState.errors.email.join(', ')}</p></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="add-title">Title</Label><Input id="add-title" name="title" /></div>
               <div className="space-y-2"><Label htmlFor="add-department">Department</Label><Input id="add-department" name="department" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Role</Label><Select value={role} onValueChange={setRole} disabled={isLoadingLists}><SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Role"} /></SelectTrigger><SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Stage</Label><Select value={stage} onValueChange={setStage} disabled={isLoadingLists}><SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Stage"} /></SelectTrigger><SelectContent>{stages.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-subject">Subject</Label>
                <Input id="add-subject" name="subject" />
              </div>
               <div className="space-y-2">
                <Label>System</Label>
                <Select value={system} onValueChange={setSystem} disabled={isLoadingLists}><SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select System"} /></SelectTrigger><SelectContent>{systems.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campus</Label>
                <Select value={campus} onValueChange={setCampus} disabled={isLoadingLists}><SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Campus"} /></SelectTrigger><SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="add-reportLine1">Report Line 1 (Manager's Email)</Label><Input id="add-reportLine1" name="reportLine1" type="email" /></div>
                <div className="space-y-2"><Label htmlFor="add-reportLine2">Report Line 2 (Manager's Email)</Label><Input id="add-reportLine2" name="reportLine2" type="email" /></div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="add-hourlyRate" name="hourlyRate" type="number" step="0.01" placeholder="e.g., 25.50" />
                </div>
                <div className="space-y-2"><Label htmlFor="add-joiningDate">Joining Date</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !joiningDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{joiningDate ? format(joiningDate, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={joiningDate} onSelect={setJoiningDate} captionLayout="dropdown-buttons" fromYear={new Date().getFullYear() - 20} toYear={2025} initialFocus /></PopoverContent></Popover></div>
            </div>
             {(addState?.errors?.form) && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>{addState.errors.form.join(', ')}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="pt-4 flex-shrink-0 border-t">
          <DialogClose asChild><Button type="button" variant="outline" onClick={() => onSuccess()}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={isAddPending}>
              {isAddPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</>) : "Add Employee"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}


// Internal component for Edit Employee Form content
function EditEmployeeFormContent({ employee, onSuccess }: { employee: Employee; onSuccess: () => void }) {
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const [serverState, formAction, isPending] = useActionState(updateEmployeeAction, initialEditEmployeeState);
  const { roles, stage: stages, systems, campuses, subjects, isLoading: isLoadingLists } = useOrganizationLists();
  const [formClientError, setFormClientError] = useState<string | null>(null);

  // State for controlled components
  const [role, setRole] = useState(employee.role || '');
  const [system, setSystem] = useState(employee.system || '');
  const [campus, setCampus] = useState(employee.campus || '');
  const [gender, setGender] = useState(employee.gender || "");
  const [stage, setStage] = useState(employee.stage || "");
  const [childrenAtNIS, setChildrenAtNIS] = useState<'Yes' | 'No'>(employee.childrenAtNIS || 'No');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(safeToDate(employee.dateOfBirth));
  const [joiningDate, setJoiningDate] = useState<Date | undefined>(safeToDate(employee.joiningDate));
  const [leavingDate, setLeavingDate] = useState<Date | undefined | null>(safeToDate(employee.leavingDate));

  useEffect(() => {
    if (!serverState) return;
    
    if (serverState.success) {
      toast({
        title: "Employee Updated",
        description: serverState.message,
      });
      onSuccess();
    } else if (serverState.message) {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: serverState.message,
        });
        setFormClientError(serverState.message);
    }
  }, [serverState, toast, onSuccess]);
  
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Edit Employee: {employee.name}</AlertDialogTitle>
        <AlertDialogDescription>
          Update the details for {employee.name}. Photo and documents are updated here.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="edit-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="employeeDocId" defaultValue={employee.id} />
        <input type="hidden" name="actorId" value={profile?.id} />
        <input type="hidden" name="actorEmail" value={profile?.email} />
        <input type="hidden" name="actorRole" value={profile?.role} />
        {/* Hidden inputs for controlled Selects */}
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="system" value={system || ''} />
        <input type="hidden" name="campus" value={campus || ''} />
        <input type="hidden" name="gender" value={gender || ''} />
        <input type="hidden" name="stage" value={stage || ''} />
        <input type="hidden" name="childrenAtNIS" value={childrenAtNIS} />
        <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString() ?? ''} />
        <input type="hidden" name="joiningDate" value={joiningDate?.toISOString() ?? ''} />
        <input type="hidden" name="leavingDate" value={leavingDate?.toISOString() ?? ''} />
        
        <ScrollArea className="flex-grow min-h-[150px] max-h-[60vh]">
          <div className="space-y-6 p-4 pr-6">
            <div className="space-y-2">
              <Label>Employee Photo</Label>
              <ImageUploader 
                employeeId={employee.id} 
                employeeName={employee.name}
                currentPhotoUrl={employee.photoURL} 
              />
              <p className="text-xs text-muted-foreground">Upload a square image. Max 5MB. Photo updates are saved immediately.</p>
            </div>
            
            <Separator />
             <h3 className="text-lg font-semibold flex items-center"><UserCircle2 className="mr-2 h-5 w-5 text-primary" />Personal Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-firstName">First Name</Label>
                    <Input id="edit-firstName" name="firstName" defaultValue={employee.firstName || (typeof employee.name === 'string' ? employee.name.split(' ')[0] : '') || ''}  />
                    {serverState?.errors?.firstName && <p className="text-sm text-destructive">{serverState.errors.firstName.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-lastName">Last Name</Label>
                    <Input id="edit-lastName" name="lastName" defaultValue={employee.lastName || (typeof employee.name === 'string' ? employee.name.split(' ').slice(1).join(' ') : '') || ''}  />
                    {serverState?.errors?.lastName && <p className="text-sm text-destructive">{serverState.errors.lastName.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="edit-name-ar">Full Name (Arabic)</Label>
                <Input id="edit-name-ar" name="nameAr" defaultValue={employee.nameAr || ''} dir="rtl" />
                {serverState?.errors?.nameAr && <p className="text-sm text-destructive">{serverState.errors.nameAr.join(', ')}</p>}
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="edit-personalEmail">Personal Email</Label>
                  <Input id="edit-personalEmail" name="personalEmail" type="email" defaultValue={employee.personalEmail || ''} />
                  {serverState?.errors?.personalEmail && <p className="text-sm text-destructive">{serverState.errors.personalEmail.join(', ')}</p>}
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="edit-phone">Personal Phone</Label>
                  <Input id="edit-phone" name="phone" defaultValue={employee.phone} placeholder="Numbers only" />
                  {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <h4 className="font-medium flex items-center text-sm"><PhoneCall className="mr-2 h-4 w-4"/>Emergency Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md">
                     <div className="space-y-2">
                        <Label htmlFor="edit-emergencyContactName">Name</Label>
                        <Input id="edit-emergencyContactName" name="emergencyContactName" defaultValue={employee.emergencyContact?.name || ''} />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="edit-emergencyContactRelationship">Relationship</Label>
                        <Input id="edit-emergencyContactRelationship" name="emergencyContactRelationship" defaultValue={employee.emergencyContact?.relationship || ''} />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="edit-emergencyContactNumber">Number</Label>
                        <Input id="edit-emergencyContactNumber" name="emergencyContactNumber" defaultValue={employee.emergencyContact?.number || ''} />
                     </div>
                </div>
            </div>
            
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-dateOfBirth">Date of Birth</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1970} toYear={2035} initialFocus />
                        </PopoverContent>
                    </Popover>
                    {serverState?.errors?.dateOfBirth && <p className="text-sm text-destructive">{serverState.errors.dateOfBirth.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-gender">Gender</Label>
                    <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger><SelectValue placeholder="Select Gender" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                    {serverState?.errors?.gender && <p className="text-sm text-destructive">{serverState.errors.gender.join(', ')}</p>}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label htmlFor="edit-nationalId">National ID</Label>
                    <Input id="edit-nationalId" name="nationalId" defaultValue={employee.nationalId} />
                    {serverState?.errors?.nationalId && <p className="text-sm text-destructive">{serverState.errors.nationalId.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-religion">Religion</Label>
                    <Input id="edit-religion" name="religion" defaultValue={employee.religion} />
                    {serverState?.errors?.religion && <p className="text-sm text-destructive">{serverState.errors.religion.join(', ')}</p>}
                </div>
            </div>
             <div className="space-y-2">
                <Label>Do they have children enrolled at NIS?</Label>
                <RadioGroup name="childrenAtNIS" value={childrenAtNIS} onValueChange={(val) => setChildrenAtNIS(val as 'Yes' | 'No')} className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Yes" id="edit-children-yes" />
                        <Label htmlFor="edit-children-yes">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="No" id="edit-children-no" />
                        <Label htmlFor="edit-children-no">No</Label>
                    </div>
                </RadioGroup>
                {serverState?.errors?.childrenAtNIS && <p className="text-sm text-destructive">{serverState.errors.childrenAtNIS.join(', ')}</p>}
            </div>

            <Separator />
            <h3 className="text-lg font-semibold flex items-center"><Briefcase className="mr-2 h-5 w-5 text-primary" />Work Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-employeeId">Employee ID</Label>
                  <Input id="edit-employeeId" name="employeeId" defaultValue={employee.employeeId} />
                  {serverState?.errors?.employeeId && <p className="text-sm text-destructive">{serverState.errors.employeeId.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">NIS Email</Label>
                  <Input id="edit-email" name="nisEmail" type="email" defaultValue={employee.email}  />
                  {serverState?.errors?.nisEmail && <p className="text-sm text-destructive">{serverState.errors.nisEmail.join(', ')}</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input id="edit-department" name="department" defaultValue={employee.department} />
                  {serverState?.errors?.department && <p className="text-sm text-destructive">{serverState.errors.department.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Role"} /></SelectTrigger>
                      <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.role && <p className="text-sm text-destructive">{serverState.errors.role.join(', ')}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={stage} onValueChange={setStage} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Stage"} /></SelectTrigger>
                      <SelectContent>{stages.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.stage && <p className="text-sm text-destructive">{serverState.errors.stage.join(', ')}</p>}
              </div>
               <div className="space-y-2">
                    <Label htmlFor="edit-subject">Subject</Label>
                    <Input id="edit-subject" name="subject" defaultValue={employee.subject || ''} />
                    {serverState?.errors?.subject && <p className="text-sm text-destructive">{serverState.errors.subject.join(', ')}</p>}
                </div>
            </div>
             <div className="space-y-2">
                  <Label>Campus</Label>
                   <Select value={campus} onValueChange={setCampus} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Campus"} /></SelectTrigger>
                      <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.campus && <p className="text-sm text-destructive">{serverState.errors.campus.join(', ')}</p>}
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>System</Label>
                    <Select value={system} onValueChange={setSystem} disabled={isLoadingLists}>
                        <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select System"} /></SelectTrigger>
                        <SelectContent>{systems.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {serverState?.errors?.system && <p className="text-sm text-destructive">{serverState.errors.system.join(', ')}</p>}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-reportLine1">Report Line 1</Label>
                    <Input id="edit-reportLine1" name="reportLine1" defaultValue={employee.reportLine1} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-reportLine2">Report Line 2</Label>
                    <Input id="edit-reportLine2" name="reportLine2" defaultValue={employee.reportLine2} />
                </div>
            </div>
           
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="edit-hourlyRate" name="hourlyRate" type="number" step="0.01" defaultValue={employee.hourlyRate || 0} placeholder="e.g., 25.50" />
                    {serverState?.errors?.hourlyRate && <p className="text-sm text-destructive">{serverState.errors.hourlyRate.join(', ')}</p>}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="edit-joiningDate">Joining Date</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !joiningDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {joiningDate ? format(joiningDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={joiningDate} onSelect={setJoiningDate} captionLayout="dropdown-buttons" fromYear={1970} toYear={2035} initialFocus />
                        </PopoverContent>
                    </Popover>
                    {serverState?.errors?.joiningDate && <p className="text-sm text-destructive">{serverState.errors.joiningDate.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="edit-leavingDate">Leaving Date (Optional)</Label>
                    {leavingDate && <Button variant="ghost" size="sm" onClick={() => setLeavingDate(null)}>Clear</Button>}
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !leavingDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {leavingDate ? format(leavingDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={leavingDate || undefined} onSelect={setLeavingDate} captionLayout="dropdown-buttons" fromYear={1970} toYear={2035} />
                    </PopoverContent>
                </Popover>
                {serverState?.errors?.leavingDate && <p className="text-sm text-destructive">{serverState.errors.leavingDate.join(', ')}</p>}
            </div>

            <EmployeeFileManager employee={employee} />
            
            {(formClientError || serverState?.errors?.form) && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>{formClientError || serverState?.errors?.form?.join(', ')}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
          <AlertDialogCancel type="button" onClick={() => { onSuccess(); setFormClientError(null); }}>Cancel</AlertDialogCancel>
          <Button type="submit" form="edit-employee-form" disabled={isPending}>
              {isPending ? (
                  <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                  </>
              ) : "Save Changes"}
          </Button>
        </AlertDialogFooter>
      </form>
    </>
  );
}

// New Component for Deactivating an Employee
function DeactivateEmployeeDialog({ employee, open, onOpenChange }: { employee: Employee | null; open: boolean; onOpenChange: (open: boolean) => void; }) {
    const { toast } = useToast();
    const { profile } = useUserProfile();
    const [deactivateState, deactivateAction, isDeactivatePending] = useActionState(deactivateEmployeeAction, initialDeactivateState);
    const [leavingDate, setLeavingDate] = useState<Date | undefined>(new Date());

    useEffect(() => {
        if (!open) {
            setLeavingDate(new Date()); // Reset date when dialog closes
        }
    }, [open]);
    
    useEffect(() => {
        if (deactivateState?.message) {
            if (deactivateState.success) {
                toast({ title: "Success", description: deactivateState.message });
                onOpenChange(false);
            } else {
                const errorMessage = Object.values(deactivateState.errors || {}).flat().join(' ');
                toast({ variant: "destructive", title: "Error", description: errorMessage || "Failed to deactivate employee." });
            }
        }
    }, [deactivateState, toast, onOpenChange]);

    if (!employee) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form action={deactivateAction}>
                    <input type="hidden" name="employeeDocId" value={employee.id} />
                    <input type="hidden" name="actorId" value={profile?.id} />
                    <input type="hidden" name="actorEmail" value={profile?.email} />
                    <input type="hidden" name="actorRole" value={profile?.role} />
                    <DialogHeader>
                        <DialogTitle>Deactivate Employee: {employee.name}</DialogTitle>
                        <DialogDescription>
                            Set the leaving date and reason for deactivating this employee. This will set their status to "deactivated".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="leavingDate">Leaving Date</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !leavingDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {leavingDate ? format(leavingDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={leavingDate} onSelect={setLeavingDate} captionLayout="dropdown-buttons" fromYear={1970} toYear={2035} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <input type="hidden" name="leavingDate" value={leavingDate?.toISOString() ?? ''} />
                            {deactivateState?.errors?.leavingDate && <p className="text-sm text-destructive">{deactivateState.errors.leavingDate.join(', ')}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reasonForLeaving">Reason for Leaving</Label>
                            <Textarea id="reasonForLeaving" name="reasonForLeaving" placeholder="Enter reason..." required />
                             {deactivateState?.errors?.reasonForLeaving && <p className="text-sm text-destructive">{deactivateState.errors.reasonForLeaving.join(', ')}</p>}
                        </div>
                    </div>
                     {deactivateState?.errors?.form && <p className="text-sm text-destructive text-center mb-2">{deactivateState.errors.form.join(', ')}</p>}
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" variant="destructive" disabled={isDeactivatePending}>
                             {isDeactivatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Deactivate
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// New component for batch import
function BatchImportDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [batchState, batchAction, isBatchPending] = useActionState(batchCreateEmployeesAction, initialBatchCreateState);
  const [_isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (batchState.message) {
      toast({
        title: batchState.success ? "Batch Import Complete" : "Batch Import Failed",
        description: batchState.message,
        variant: batchState.success ? "default" : "destructive",
        duration: 10000,
      });
      if (batchState.success) {
        onOpenChange(false);
        setSelectedFile(null);
      }
    }
  }, [batchState, toast, onOpenChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({ variant: "destructive", title: "No File Selected", description: "Please select an Excel file to import." });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = event.target?.result;
      if (!data) {
        toast({ variant: "destructive", title: "Error Reading File", description: "Could not read the selected file." });
        return;
      }
      try {
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const formData = new FormData();
        formData.append('recordsJson', JSON.stringify(json));
        
        startTransition(() => {
          (batchAction as any)(formData);
        });
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast({ variant: "destructive", title: "Parsing Error", description: "Failed to parse the Excel file. Please ensure it's a valid .xlsx file." });
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Employees from Excel</DialogTitle>
          <DialogDescription>
            Upload an .xlsx file with employee data. The system will attempt to map columns automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="excel-file">Excel File (.xlsx)</Label>
            <Input id="excel-file" type="file" accept=".xlsx" onChange={handleFileChange} />
             {batchState?.errors?.file && <p className="text-sm text-destructive mt-1">{batchState.errors.file.join(', ')}</p>}
          </div>
        </div>
         {batchState?.errors?.form && <p className="text-sm text-destructive text-center mb-2">{batchState.errors.form.join(', ')}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleImport} disabled={isBatchPending || !selectedFile}>
            {isBatchPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4" />}
            Import Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function EmployeeManagementContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { toast } = useToast();
  const { campuses, stage: stages, subjects, reportLines1, reportLines2, isLoading: isLoadingLists } = useOrganizationLists();
  
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || "");
  const [statusFilters, setStatusFilters] = useState(() => searchParams.getAll('status') || []);
  const [campusFilters, setCampusFilters] = useState(() => searchParams.getAll('campus') || []);
  const [titleFilters, setTitleFilters] = useState(() => searchParams.getAll('title') || []);
  const [stageFilters, setStageFilters] = useState(() => searchParams.getAll('stage') || []);
  const [subjectFilters, setSubjectFilters] = useState(() => searchParams.getAll('subject') || []);
  const [genderFilters, setGenderFilters] = useState(() => searchParams.getAll('gender') || []);
  const [religionFilters, setReligionFilters] = useState(() => searchParams.getAll('religion') || []);
  const [reportLineFilters, setReportLineFilters] = useState(() => searchParams.getAll('reportLine') || []);
  const [dobStartYear, setDobStartYear] = useState(() => searchParams.get('dobStart') || "");
  const [dobEndYear, setDobEndYear] = useState(() => searchParams.get('dobEnd') || "");
  const [joiningStartYear, setJoiningStartYear] = useState(() => searchParams.get('joinStart') || "");
  const [joiningEndYear, setJoiningEndYear] = useState(() => searchParams.get('joinEnd') || "");
  const [currentPage, setCurrentPage] = useState(() => parseInt(searchParams.get('page') || '1', 10));

  const yearRange = useMemo(() => {
    const currentYear = getYear(new Date());
    const years = [];
    for (let y = currentYear; y >= 1970; y--) {
      years.push(y.toString());
    }
    return years;
  }, []);

  const clearAllFilters = () => {
      setSearchTerm("");
      setStatusFilters([]);
      setCampusFilters([]);
      setTitleFilters([]);
      setStageFilters([]);
      setSubjectFilters([]);
      setGenderFilters([]);
      setReligionFilters([]);
      setReportLineFilters([]);
      setDobStartYear("");
      setDobEndYear("");
      setJoiningStartYear("");
      setJoiningEndYear("");
      setCurrentPage(1);
  };
  
  // URL update effect
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    statusFilters.forEach(s => params.append('status', s));
    campusFilters.forEach(c => params.append('campus', c));
    titleFilters.forEach(t => params.append('title', t));
    stageFilters.forEach(s => params.append('stage', s));
    subjectFilters.forEach(s => params.append('subject', s));
    genderFilters.forEach(g => params.append('gender', g));
    religionFilters.forEach(r => params.append('religion', r));
    reportLineFilters.forEach(r => params.append('reportLine', r));
    if (dobStartYear) params.set('dobStart', dobStartYear);
    if (dobEndYear) params.set('dobEnd', dobEndYear);
    if (joiningStartYear) params.set('joinStart', joiningStartYear);
    if (joiningEndYear) params.set('joinEnd', joiningEndYear);
    if (currentPage > 1) params.set('page', currentPage.toString());

    // Using push to update the URL.
    router.push(`${pathname}?${params.toString()}`);
  }, [
    searchTerm, statusFilters, campusFilters, titleFilters, stageFilters,
    subjectFilters, genderFilters, religionFilters, reportLineFilters,
    dobStartYear, dobEndYear, joiningStartYear, joiningEndYear, currentPage,
    router, pathname
  ]);


  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [editFormKey, setEditFormKey] = useState(0);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteEmployeeAction, initialDeleteEmployeeState);

  const [isCreateLoginDialogOpen, setIsCreateLoginDialogOpen] = useState(false);
  const [employeeToCreateLogin, setEmployeeToCreateLogin] = useState<Employee | null>(null);
  const [createLoginServerState, createLoginFormAction, isCreateLoginPending] = useActionState(createAuthUserForEmployeeAction, initialCreateAuthState);
  
  const [isDeleteLoginDialogOpen, setIsDeleteLoginDialogOpen] = useState(false);
  const [employeeToDeleteLogin, setEmployeeToDeleteLogin] = useState<Employee | null>(null);
  const [deleteLoginServerState, deleteLoginFormAction, isDeleteLoginPending] = useActionState(deleteAuthUserAction, initialDeleteAuthState);

  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
  const [employeeToChangePassword, setEmployeeToChangePassword] = useState<Employee | null>(null);
  const [changePasswordServerState, changePasswordFormAction, isChangePasswordPending] = useActionState(updateAuthUserPasswordAction, initialUpdatePasswordState);

  const [showPassword, setShowPassword] = useState(false);
  
  const [employeeToDeactivate, setEmployeeToDeactivate] = useState<Employee | null>(null);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  
  const [activateState, activateAction, isActivatePending] = useActionState(activateEmployeeAction, initialActivateState);
  const [isActivateTransitionPending, startActivateTransition] = useTransition();

  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);

  useEffect(() => {
    if (isLoadingProfile) return;

    setIsLoading(true);
    const userRole = profile?.role?.toLowerCase();
    let q;
    const employeeCollection = collection(db, "employee");

    if (userRole && userRole !== "admin" && userRole !== "hr" && profile?.email) {
      q = query(
        employeeCollection,
        or(
          where("reportLine1", "==", profile.email),
          where("reportLine2", "==", profile.email)
        )
      );
    } else {
      q = query(employeeCollection);
    }


    const unsubscribe = onSnapshot(q, (snapshot) => {
        const employeeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
        employeeData.sort((a,b) => a.name.localeCompare(b.name));
        setAllEmployees(employeeData);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching employees:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load employees. This may be a permissions issue or a missing Firestore index.",
        });
        setIsLoading(false);
    });

    return () => unsubscribe();
}, [profile, isLoadingProfile, toast]);
  
  useEffect(() => {
    if (createLoginServerState?.message) {
      if (createLoginServerState.success) {
        toast({
          title: "Success!",
          description: createLoginServerState.message,
        });
        closeCreateLoginDialog();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Create Login",
          description: createLoginServerState.errors?.form?.join(", ") || createLoginServerState.message,
        });
      }
    }
  }, [createLoginServerState, toast]);

  useEffect(() => {
    if (deleteLoginServerState?.message) {
        if (deleteLoginServerState.success) {
            toast({
                title: "Success",
                description: deleteLoginServerState.message,
            });
            closeDeleteLoginDialog();
        } else {
            toast({
                variant: "destructive",
                title: "Failed to Delete Login",
                description: deleteLoginServerState.errors?.form?.join(", ") || deleteLoginServerState.message,
            });
        }
    }
  }, [deleteLoginServerState, toast]);
  
  useEffect(() => {
    if (deleteState?.message) {
      if (deleteState.success) {
        toast({
          title: "Employee Deleted",
          description: deleteState.message,
        });
        closeDeleteConfirmDialog();
      } else {
        toast({
          variant: "destructive",
          title: "Deletion Failed",
          description: deleteState.errors?.form?.join(", ") || deleteState.message,
        });
      }
    }
  }, [deleteState, toast]);

  useEffect(() => {
    if (changePasswordServerState?.message) {
      if (changePasswordServerState.success) {
        toast({
          title: "Success!",
          description: changePasswordServerState.message,
        });
        closeChangePasswordDialog();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Change Password",
          description: changePasswordServerState.errors?.form?.join(", ") || changePasswordServerState.message,
        });
      }
    }
  }, [changePasswordServerState, toast]);

  useEffect(() => {
    if (activateState.message) {
        toast({
            title: activateState.success ? "Success" : "Error",
            description: activateState.message,
            variant: activateState.success ? "default" : "destructive",
        });
    }
  }, [activateState, toast]);
  
  const normalizeTitle = (title?: string) => {
    if (!title || typeof title !== 'string') return null;
    const cleanedTitle = title.trim();
    if (["", "null", "undefined", "title"].includes(cleanedTitle.toLowerCase())) return null;
    return cleanedTitle
      .toLowerCase()
      .replace(/\s+/g, " ")
      .split(/[,/]/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('/');
};


  const uniqueTitles = useMemo(() => {
    const titleSet = new Set<string>();
  
    allEmployees.forEach(emp => {
      const normalized = normalizeTitle(emp.title);
      if (normalized) titleSet.add(normalized);
    });
  
    return Array.from(titleSet)
      .sort()
      .map(t => ({
        label: t,
        value: t
      }));
  }, [allEmployees]);
  
  const uniqueSubjects = useMemo(() => {
    const subjectSet = new Set<string>();
    allEmployees.forEach(e => {
        if(e.subject) subjectSet.add(e.subject);
    });
    return Array.from(subjectSet).sort().map(s => ({label: s, value: s}));
  }, [allEmployees]);

  const uniqueReligions = useMemo(() => {
    const religionSet = new Set<string>();
    allEmployees.forEach(e => {
        if(e.religion) religionSet.add(e.religion);
    });
    return Array.from(religionSet).sort().map(r => ({label: r, value: r}));
  }, [allEmployees]);
  

  const uniqueReportLines = useMemo(() => {
    const lines = new Set<string>();
  
    const addIfValid = (email?: string) => {
      if (!email) return;
      const normalized = email.trim().toLowerCase();
      lines.add(normalized);
    };
  
    reportLines1.forEach(l => addIfValid(l.name));
    reportLines2.forEach(l => addIfValid(l.name));
  
    return Array.from(lines)
      .sort()
      .map(l => ({ label: l, value: l }));
  }, [reportLines1, reportLines2]);
  const filteredEmployees = useMemo(() => {
    let listToFilter = allEmployees;

    if (campusFilters.length > 0) listToFilter = listToFilter.filter(emp => emp.campus && campusFilters.includes(emp.campus));
    if (stageFilters.length > 0) listToFilter = listToFilter.filter(emp => emp.stage && stageFilters.includes(emp.stage));
    if (subjectFilters.length > 0) listToFilter = listToFilter.filter(emp => emp.subject && subjectFilters.includes(emp.subject));
    if (genderFilters.length > 0) listToFilter = listToFilter.filter(emp => emp.gender && genderFilters.includes(emp.gender));
    if (religionFilters.length > 0) listToFilter = listToFilter.filter(emp => emp.religion && religionFilters.includes(emp.religion));
    if (titleFilters.length > 0) {
        listToFilter = listToFilter.filter(emp => {
            const normalizedEmpTitle = normalizeTitle(emp.title);
            return normalizedEmpTitle && titleFilters.includes(normalizedEmpTitle);
        });
    }
    if (reportLineFilters.length > 0) {
        listToFilter = listToFilter.filter(emp => (emp.reportLine1 && reportLineFilters.includes(emp.reportLine1)) || (emp.reportLine2 && reportLineFilters.includes(emp.reportLine2)));
    }
    if (statusFilters.length > 0) {
        listToFilter = listToFilter.filter(emp => {
            const empStatus = emp.status === 'deactivated' ? 'Deactivated' : 'Active';
            return statusFilters.includes(empStatus);
        });
    }

    if (dobStartYear) {
      const start = getYear(new Date(Number(dobStartYear), 0, 1));
      listToFilter = listToFilter.filter(emp => {
        const dob = safeToDate(emp.dateOfBirth);
        return dob && getYear(dob) >= start;
      });
    }
    if (dobEndYear) {
      const end = getYear(new Date(Number(dobEndYear), 11, 31));
      listToFilter = listToFilter.filter(emp => {
        const dob = safeToDate(emp.dateOfBirth);
        return dob && getYear(dob) <= end;
      });
    }
    if (joiningStartYear) {
      const start = getYear(new Date(Number(joiningStartYear), 0, 1));
      listToFilter = listToFilter.filter(emp => {
        const joiningDate = safeToDate(emp.joiningDate);
        return joiningDate && getYear(joiningDate) >= start;
      });
    }
    if (joiningEndYear) {
       const end = getYear(new Date(Number(joiningEndYear), 11, 31));
       listToFilter = listToFilter.filter(emp => {
        const joiningDate = safeToDate(emp.joiningDate);
        return joiningDate && getYear(joiningDate) <= end;
      });
    }
    
    const lowercasedFilter = searchTerm.toLowerCase();
    if (searchTerm.trim()) {
      listToFilter = listToFilter.filter(employee => {
          const searchableFields = [
              employee.name,
              employee.employeeId,
              employee.department,
              employee.role,
              employee.stage,
              employee.campus,
              employee.email,
              employee.personalEmail,
              employee.subject,
              employee.title,
              employee.religion,
              employee.nameAr,
          ];
          return searchableFields.some(field =>
              typeof field === 'string' && field.toLowerCase().includes(lowercasedFilter)
          );
      });
    }
    
    return listToFilter;
  }, [allEmployees, searchTerm, campusFilters, stageFilters, subjectFilters, genderFilters, religionFilters, titleFilters, statusFilters, dobStartYear, dobEndYear, joiningStartYear, joiningEndYear, reportLineFilters]);
  
  const activeEmployeesCount = useMemo(() => {
    return filteredEmployees.filter(emp => emp.status !== 'deactivated').length;
  }, [filteredEmployees]);

  const totalPages = useMemo(() => Math.ceil(filteredEmployees.length / PAGE_SIZE), [filteredEmployees]);
  const isLastPage = currentPage >= totalPages;

  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    return filteredEmployees.slice(startIndex, endIndex);
  }, [filteredEmployees, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, campusFilters, stageFilters, subjectFilters, genderFilters, religionFilters, titleFilters, statusFilters, dobStartYear, dobEndYear, joiningStartYear, joiningEndYear, reportLineFilters]);


  const goToNextPage = () => {
    if (isLastPage) return;
    setCurrentPage(prev => prev + 1);
  };

  const goToPrevPage = () => {
    if (currentPage === 1) return;
    setCurrentPage(prev => prev - 1);
  };
  
  const canManageEmployee = useCallback((employee: Employee) => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase();
    if (userRole === 'admin' || userRole === 'hr') return true;
    if (employee.reportLine1 === profile.email) return true;
    return false;
  }, [profile]);


  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditFormKey(prevKey => prevKey + 1); 
    setIsEditDialogOpen(true);
  };
  const closeEditDialog = () => {
    setEditingEmployee(null);
    setIsEditDialogOpen(false);
  };
  
  const openDeleteConfirmDialog = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteConfirmDialog = () => {
    setEmployeeToDelete(null);
    setIsDeleteDialogOpen(false);
  };
  
  const openCreateLoginDialog = (employee: Employee) => {
    setEmployeeToCreateLogin(employee);
    setIsCreateLoginDialogOpen(true);
  };
  
  const closeCreateLoginDialog = () => {
    setEmployeeToCreateLogin(null);
    setIsCreateLoginDialogOpen(false);
    setShowPassword(false);
  };

  const openDeleteLoginDialog = (employee: Employee) => {
    setEmployeeToDeleteLogin(employee);
    setIsDeleteLoginDialogOpen(true);
  };

  const closeDeleteLoginDialog = () => {
    setEmployeeToDeleteLogin(null);
    setIsDeleteLoginDialogOpen(false);
  };

  const openChangePasswordDialog = (employee: Employee) => {
    setEmployeeToChangePassword(employee);
    setIsChangePasswordDialogOpen(true);
  };

  const closeChangePasswordDialog = () => {
    setEmployeeToChangePassword(null);
    setIsChangePasswordDialogOpen(false);
    setShowPassword(false);
  };
  
  const openDeactivateDialog = (employee: Employee) => {
    setEmployeeToDeactivate(employee);
    setIsDeactivateDialogOpen(true);
  };
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const handleExportExcel = () => {
    if (filteredEmployees.length === 0) {
      toast({
        title: "No Data",
        description: "There are no employees to export in the current view.",
        variant: "destructive"
      });
      return;
    }
    
    const dataToExport = filteredEmployees.map(emp => {
        const dob = safeToDate(emp.dateOfBirth);
        const joined = safeToDate(emp.joiningDate);
        return {
            'Employee ID': emp.employeeId,
            'Name': emp.name,
            'Title': emp.title,
            'Role': emp.role,
            'childrenAtNIS': emp.childrenAtNIS,
            'Department': emp.department,
            'Campus': emp.campus,
            'Stage': emp.stage,
            'Subject': emp.subject,
            'NIS Email': emp.email,
            'Personal Email': emp.personalEmail,
            'Phone': emp.phone,
            'NameAr':emp.nameAr,
            'Date of Birth': dob ? format(dob, 'yyyy-MM-dd') : '-',
            'Joining Date': joined ? format(joined, 'yyyy-MM-dd') : '-',
            'Gender': emp.gender,
            'National ID': emp.nationalId,
            'Religion': emp.religion,
            'Hourly Rate': emp.hourlyRate,
            'Status': emp.status || "Active",
            'Emergency Contact Name': emp.emergencyContact?.name,
            'Emergency Contact Relationship': emp.emergencyContact?.relationship,
            'Emergency Contact Number': emp.emergencyContact?.number,
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(workbook, `Employee_List_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export Successful",
      description: "The employee list has been exported to Excel.",
    });
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Employee ID", "Name", "NameAr", "childrenAtNIS", "NIS Email", "Title",
      "Department", "Campus", "Stage", "Status", "Subject", "personal Email",
      "Phone", "Date Of Birth", "joining Date", "Gender", "National ID", "Religion",
      "Emergency Contact Name", "Emergency Contact Relationship", "Emergency Contact Number",
      "ReportLine1", "ReportLine2"
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Import Template");

    // Adjust column widths
    const columnWidths = headers.map(header => ({ wch: header.length + 5 }));
    worksheet['!cols'] = columnWidths;

    XLSX.writeFile(workbook, "Employee_Import_Template.xlsx");
    toast({
      title: "Template Downloaded",
      description: "The employee import template has been downloaded.",
    });
  };
  
  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Employee Management
          </h1>
          <p className="text-muted-foreground">
            Manage employee records, add new hires, and update details.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold sm:text-2xl">{isLoading || isLoadingProfile ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : filteredEmployees.length}</div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Active Employees</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold sm:text-2xl">{isLoading || isLoadingProfile ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : activeEmployeesCount}</div>
            </CardContent>
          </Card>
        </div>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
               <div className="relative flex-grow w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by ID, name, email, title, department..."
                  className="w-full pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {isLoadingProfile ? (
                    <Skeleton className="h-10 w-[190px]" />
                ) : (profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr') && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button className="w-full" onClick={handleDownloadTemplate} variant="outline">
                           <Download className="mr-2 h-4 w-4" />
                           Download Template
                        </Button>
                        <Button className="w-full" onClick={() => setIsBatchImportOpen(true)}>
                           <UploadCloud className="mr-2 h-4 w-4" />
                           Import Excel
                        </Button>
                        <Button className="w-full" onClick={handleExportExcel} variant="outline">
                           <FileDown className="mr-2 h-4 w-4" />
                           Export to Excel
                        </Button>
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add New Employee
                              </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <AddEmployeeFormContent onSuccess={() => setIsAddDialogOpen(false)} />
                          </DialogContent>
                        </Dialog>
                    </div>
                )}
              </div>
            </div>
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="filters">
                    <AccordionTrigger>
                        <div className="flex items-center gap-2 text-sm">
                            <Filter className="h-4 w-4" />
                            Advanced Filters
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <MultiSelectFilter
                                placeholder="Filter by status..."
                                options={[{label: 'Active', value: 'Active'}, {label: 'Deactivated', value: 'Deactivated'}]}
                                selected={statusFilters}
                                onChange={setStatusFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by campus..."
                                options={campuses.map(c => ({ label: c.name, value: c.name }))}
                                selected={campusFilters}
                                onChange={setCampusFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by title..."
                                options={uniqueTitles}
                                selected={titleFilters}
                                onChange={setTitleFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by stage..."
                                options={stages.map(s => ({label: s.name, value: s.name}))}
                                selected={stageFilters}
                                onChange={setStageFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by subject..."
                                options={uniqueSubjects}
                                selected={subjectFilters}
                                onChange={setSubjectFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by gender..."
                                options={[{label: 'Male', value: 'Male'}, {label: 'Female', value: 'Female'}]}
                                selected={genderFilters}
                                onChange={setGenderFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Filter by religion..."
                                options={uniqueReligions}
                                selected={religionFilters}
                                onChange={setReligionFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                            <MultiSelectFilter
                                placeholder="Reports to..."
                                options={uniqueReportLines}
                                selected={reportLineFilters}
                                onChange={setReportLineFilters}
                                className="w-full sm:w-auto flex-1 min-w-[150px]"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            <div className="flex items-center gap-2">
                                <Label>Birth Year:</Label>
                                <Select value={dobStartYear} onValueChange={setDobStartYear}>
                                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="From..." /></SelectTrigger>
                                    <SelectContent>{yearRange.map(y => <SelectItem key={`dob-start-${y}`} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                                -
                                <Select value={dobEndYear} onValueChange={setDobEndYear}>
                                        <SelectTrigger className="w-[120px]"><SelectValue placeholder="To..." /></SelectTrigger>
                                        <SelectContent>{yearRange.map(y => <SelectItem key={`dob-end-${y}`} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                                <div className="flex items-center gap-2">
                                <Label>Joining Year:</Label>
                                <Select value={joiningStartYear} onValueChange={setJoiningStartYear}>
                                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="From..." /></SelectTrigger>
                                    <SelectContent>{yearRange.map(y => <SelectItem key={`join-start-${y}`} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                                -
                                <Select value={joiningEndYear} onValueChange={setJoiningEndYear}>
                                        <SelectTrigger className="w-[120px]"><SelectValue placeholder="To..." /></SelectTrigger>
                                        <SelectContent>{yearRange.map(y => <SelectItem key={`join-end-${y}`} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                                <Button variant="outline" onClick={clearAllFilters} className="ml-auto">
                                <X className="mr-2 h-4 w-4" />
                                Clear All Filters
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">Loading employees...</p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEmployees.length > 0 ? (
                paginatedEmployees.map((employee) => (
                  <TableRow key={employee.id} className={cn(employee.status === 'deactivated' && 'bg-destructive/20 hover:bg-destructive/30')}>
                    <TableCell className="font-medium">
                      <Link href={`/employees/${employee.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar>
                            <AvatarImage src={employee.photoURL || undefined} alt={employee.name || ''} />
                            <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                        </Avatar>
                        {employee.name || '-'}
                      </Link>
                    </TableCell>
                    <TableCell>{employee.employeeId || '-'}</TableCell>
                    <TableCell>{employee.title || '-'}</TableCell>
                    <TableCell>{employee.subject || '-'}</TableCell>
                    <TableCell>{employee.stage || '-'}</TableCell>
                    <TableCell>{employee.campus || '-'}</TableCell>
                    <TableCell>
                       <Badge
                        variant={employee.status === 'deactivated' ? 'destructive' : 'secondary'}
                        className={cn(employee.status !== 'deactivated' && 'bg-green-100 text-green-800')}
                      >
                        {employee.status || "Active"}
                      </Badge>
                    </TableCell>
                      <TableCell className="text-right">
                       {canManageEmployee(employee) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                           <DropdownMenuItem onSelect={() => router.push(`/employees/${employee.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Full Profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Login Management
                              </DropdownMenuSubTrigger>
                              <DropdownMenuPortal>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem onClick={() => openCreateLoginDialog(employee)} disabled={!!employee.userId}>
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Create Login
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openChangePasswordDialog(employee)} disabled={!employee.userId}>
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Change Password
                                  </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openDeleteLoginDialog(employee)} disabled={!employee.userId} className="text-destructive focus:text-destructive">
                                      <UserMinus className="mr-2 h-4 w-4" />
                                      Delete Login
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuItem onSelect={() => openEditDialog(employee)}>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit Employee
                            </DropdownMenuItem>
                             {employee.status === 'deactivated' ? (
                                <DropdownMenuItem onSelect={() => {
                                    startActivateTransition(() => {
                                        const formData = new FormData();
                                        formData.append('employeeDocId', employee.id);
                                        if (profile?.id) formData.append('actorId', profile.id);
                                        if (profile?.email) formData.append('actorEmail', profile.email);
                                        if (profile?.role) formData.append('actorRole', profile.role);
                                        activateAction(formData);
                                    });
                                }}>
                                    {isActivateTransitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserRoundCheck className="mr-2 h-4 w-4" />}
                                    Activate Employee
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onSelect={() => openDeactivateDialog(employee)}>
                                   <UserMinus className="mr-2 h-4 w-4" />
                                   Deactivate Employee
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => openDeleteConfirmDialog(employee)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Employee
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                       )}
                      </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    {allEmployees.length === 0 ? "No employees found." : "No employees match your current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
        {totalPages > 1 && (
            <CardContent>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevPage}
                    disabled={currentPage <= 1 || isLoading}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Previous
                </Button>
                <span className="text-sm font-medium">Page {currentPage} of {totalPages}</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={isLastPage || isLoading}
                >
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
            </CardContent>
        )}
      </Card>
      
      {isEditDialogOpen && editingEmployee && (
        <AlertDialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) closeEditDialog(); else setIsEditDialogOpen(true); }}>
          <AlertDialogContent className="max-w-2xl">
              <EditEmployeeFormContent key={`edit-form-${editFormKey}-${editingEmployee.id}`} employee={editingEmployee} onSuccess={closeEditDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}
      
      <DeactivateEmployeeDialog 
        employee={employeeToDeactivate}
        open={isDeactivateDialogOpen}
        onOpenChange={setIsDeactivateDialogOpen}
      />
      
      <BatchImportDialog open={isBatchImportOpen} onOpenChange={setIsBatchImportOpen} />

      {isDeleteDialogOpen && employeeToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { if(!open) closeDeleteConfirmDialog(); else setIsDeleteDialogOpen(true); }}>
          <AlertDialogContent>
            <form action={deleteAction}>
                <input type="hidden" name="employeeDocId" value={employeeToDelete.id} />
                 <input type="hidden" name="actorId" value={profile?.id} />
                <input type="hidden" name="actorEmail" value={profile?.email} />
                <input type="hidden" name="actorRole" value={profile?.role} />
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the employee record for <strong>{employeeToDelete.name}</strong> and all their associated files (photo, documents).
                </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteState.errors?.form && (
                    <p className="text-sm font-medium text-destructive mt-2">{deleteState.errors.form.join(", ")}</p>
                )}
                <AlertDialogFooter className="mt-4">
                <AlertDialogCancel type="button" onClick={closeDeleteConfirmDialog}>Cancel</AlertDialogCancel>
                <Button
                    type="submit"
                    className={cn(buttonVariants({ variant: "destructive" }), "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                    disabled={isDeletePending}
                >
                    {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Delete Employee
                </Button>
                </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isCreateLoginDialogOpen && employeeToCreateLogin && (
        <Dialog open={isCreateLoginDialogOpen} onOpenChange={(open) => { if (!open) closeCreateLoginDialog(); }}>
          <DialogContent>
            <form action={createLoginFormAction}>
              <DialogHeader>
                <DialogTitle>Create Login for {employeeToCreateLogin.name}</DialogTitle>
                <DialogDescription>
                  Choose which email to use for the login account and create a secure password.
                </DialogDescription>
              </DialogHeader>
              
              <input type="hidden" name="employeeDocId" value={employeeToCreateLogin.id} />
              <input type="hidden" name="name" value={employeeToCreateLogin.name} />
              <input type="hidden" name="actorId" value={profile?.id} />
              <input type="hidden" name="actorEmail" value={profile?.email} />
              <input type="hidden" name="actorRole" value={profile?.role} />
              
              <div className="grid gap-4 py-4">
                <div className="space-y-3">
                  <Label>Email for Login</Label>
                  <RadioGroup name="emailType" defaultValue="work" className="grid grid-cols-2 gap-4">
                    <div>
                      <RadioGroupItem value="work" id="emailType-work" className="peer sr-only" />
                      <Label htmlFor="emailType-work" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                        Work Email
                        <span className="font-normal text-xs mt-1 truncate">{employeeToCreateLogin.email}</span>
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="personal" id="emailType-personal" className="peer sr-only" disabled={!employeeToCreateLogin.personalEmail} />
                      <Label htmlFor="emailType-personal" className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 ${!employeeToCreateLogin.personalEmail ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary'}`}>
                        Personal Email
                        <span className="font-normal text-xs mt-1 truncate">{employeeToCreateLogin.personalEmail || 'Not available'}</span>
                      </Label>
                    </div>
                  </RadioGroup>
                   {createLoginServerState?.errors?.email && (
                      <p className="text-sm text-destructive mt-1">{createLoginServerState.errors.email.join(', ')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                  {createLoginServerState?.errors?.password && (
                      <p className="text-sm text-destructive mt-1">{createLoginServerState.errors.password.join(', ')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                      <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                    {createLoginServerState?.errors?.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">{createLoginServerState.errors.confirmPassword.join(', ')}</p>
                  )}
                </div>
              </div>
              
              {createLoginServerState?.errors?.form && (
                <div className="text-sm text-destructive text-center mb-2">{createLoginServerState.errors.form.join(", ")}</div>
              )}
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" onClick={closeCreateLoginDialog}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isCreateLoginPending}>
                  {isCreateLoginPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      
      {isDeleteLoginDialogOpen && employeeToDeleteLogin && (
        <AlertDialog open={isDeleteLoginDialogOpen} onOpenChange={closeDeleteLoginDialog}>
            <AlertDialogContent>
                <form action={deleteLoginFormAction}>
                    <input type="hidden" name="employeeDocId" value={employeeToDeleteLogin.id} />
                    <input type="hidden" name="userId" value={employeeToDeleteLogin.userId ?? ''} />
                    <input type="hidden" name="employeeName" value={employeeToDeleteLogin.name} />
                    <input type="hidden" name="actorId" value={profile?.id} />
                    <input type="hidden" name="actorEmail" value={profile?.email} />
                    <input type="hidden" name="actorRole" value={profile?.role} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Login Account?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the login account for <strong>{employeeToDeleteLogin.name}</strong> from Firebase Authentication. The employee record will remain but will be unlinked. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteLoginServerState?.errors?.form && (
                        <p className="text-sm font-medium text-destructive mt-2">{deleteLoginServerState.errors.form.join(", ")}</p>
                    )}
                    <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                        <Button type="submit" variant="destructive" disabled={isDeleteLoginPending}>
                            {isDeleteLoginPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm & Delete Login"}
                        </Button>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
      )}

      {isChangePasswordDialogOpen && employeeToChangePassword && (
        <Dialog open={isChangePasswordDialogOpen} onOpenChange={(open) => { if (!open) closeChangePasswordDialog(); }}>
          <DialogContent>
            <form action={changePasswordFormAction}>
              <DialogHeader>
                <DialogTitle>Change Password for {employeeToChangePassword.name}</DialogTitle>
                <DialogDescription>
                  Enter a new secure password for <strong>{employeeToChangePassword.email}</strong>.
                </DialogDescription>
              </DialogHeader>
              
              <input type="hidden" name="userId" value={employeeToChangePassword.userId ?? ''} />
              <input type="hidden" name="employeeName" value={employeeToChangePassword.name} />
              <input type="hidden" name="actorId" value={profile?.id} />
              <input type="hidden" name="actorEmail" value={profile?.email} />
              <input type="hidden" name="actorRole" value={profile?.role} />
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="change-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="change-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                  {changePasswordServerState?.errors?.password && (
                      <p className="text-sm text-destructive mt-1">{changePasswordServerState.errors.password.join(', ')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="change-confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="change-confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                      <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                    {changePasswordServerState?.errors?.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">{changePasswordServerState.errors.confirmPassword.join(', ')}</p>
                  )}
                </div>
              </div>
              
              {changePasswordServerState?.errors?.form && (
                <div className="text-sm text-destructive text-center mb-2">{changePasswordServerState.errors.form.join(", ")}</div>
              )}
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" onClick={closeChangePasswordDialog}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isChangePasswordPending}>
                  {isChangePasswordPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function EmployeeManagementPage() {
  return (
    <AppLayout>
      <EmployeeManagementContent />
    </AppLayout>
  );
}
