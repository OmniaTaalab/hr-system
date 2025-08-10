
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2, AlertCircle, Loader2, UserCheck, UserX, Clock, DollarSign, Calendar as CalendarIcon, CheckIcon, ChevronsUpDown, UserPlus, ShieldCheck, UserMinus, Eye, EyeOff, KeyRound, UploadCloud, File, Download } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  createEmployeeAction, type CreateEmployeeState, 
  updateEmployeeAction, type UpdateEmployeeState, 
  deleteEmployeeAction, type DeleteEmployeeState 
} from "@/lib/firebase/admin-actions";
import { 
  createAuthUserForEmployeeAction, type CreateAuthUserState,
  deleteAuthUserAction, type DeleteAuthUserState,
  updateAuthUserPasswordAction, type UpdateAuthPasswordState
} from "@/app/actions/auth-creation-actions";
import { db, storage } from '@/lib/firebase/config';
import { collection, onSnapshot, query, doc, Timestamp, where, updateDoc, arrayUnion, arrayRemove, getCountFromServer } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageUploader } from "@/components/image-uploader";
import { useOrganizationLists, type ListItem } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";


interface EmployeeFile {
  name: string;
  url: string;
  uploadedAt: Timestamp;
}

interface Employee {
  id: string; 
  name: string;
  firstName?: string;
  lastName?: string;
  employeeId: string; 
  department: string;
  role: string;
  groupName: string;
  system: string;
  campus: string;
  email: string;
  phone: string;
  hourlyRate?: number;
  userId?: string | null;
  photoURL?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;
  leavingDate?: Timestamp | null;
  leaveBalances?: { [key: string]: number };
  documents?: EmployeeFile[];
  createdAt?: Timestamp; 
  gender?: string;
  nationalId?: string;
  religion?: string;
  stage?: string;
  subject?: string;
  title?: string;
}

const initialCreateEmployeeState: CreateEmployeeState = {
  message: null,
  errors: {},
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


const initialAddFormState = {
    firstName: "",
    lastName: "",
    email: "",
    department: "",
    role: "",
    groupName: "",
    system: "",
    campus: "",
    phone: "",
    hourlyRate: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: undefined as Date | undefined,
    joiningDate: undefined as Date | undefined,
    gender: "",
    nationalId: "",
    religion: "",
    stage: "",
    subject: "",
    title: "",
};

// Internal component for Add Employee Form content
function AddEmployeeFormContent({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [serverState, formAction, isPending] = useActionState(createEmployeeAction, initialCreateEmployeeState);
  const [formData, setFormData] = useState(initialAddFormState);
  const { roles, groupNames, systems, campuses, isLoading: isLoadingLists } = useOrganizationLists();
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: keyof typeof initialAddFormState) => (value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (!serverState) return;

    if (serverState.message && !serverState.errors) {
      toast({
        title: "Employee Added",
        description: serverState.message,
      });
      onSuccess();
    } else if (serverState.errors) {
      const errorMessages = Object.values(serverState.errors).flat().join(' ');
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: errorMessages || serverState.message || "Please check the form for errors.",
      });
    }
  }, [serverState, toast, onSuccess]);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Add New Employee</AlertDialogTitle>
        <AlertDialogDescription>
          Fill in the details below. A login account will be created simultaneously.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="add-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="role" value={formData.role} />
        <input type="hidden" name="groupNames" value={formData.groupName} />
        <input type="hidden" name="campus" value={formData.campus} />
        <input type="hidden" name="system" value={formData.system} />
        <input type="hidden" name="gender" value={formData.gender} />
        <input type="hidden" name="stage" value={formData.stage} />

        <ScrollArea className="flex-grow min-h-[150px] max-h-[60vh]">
          <div className="space-y-4 p-4 pr-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-firstName">First Name</Label>
                  <Input id="add-firstName" name="firstName" placeholder="e.g., John" value={formData.firstName} onChange={handleInputChange} />
                  {serverState?.errors?.firstName && <p className="text-sm text-destructive">{serverState.errors.firstName.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-lastName">Last Name</Label>
                  <Input id="add-lastName" name="lastName" placeholder="e.g., Doe" value={formData.lastName} onChange={handleInputChange} />
                  {serverState?.errors?.lastName && <p className="text-sm text-destructive">{serverState.errors.lastName.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" name="email" type="email" placeholder="e.g., john.doe@example.com" value={formData.email} onChange={handleInputChange} />
              {serverState?.errors?.email && <p className="text-sm text-destructive">{serverState.errors.email.join(', ')}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-department">Department</Label>
                <Input id="add-department" name="department" placeholder="e.g., Technology" value={formData.department} onChange={handleInputChange} />
                {serverState?.errors?.department && <p className="text-sm text-destructive">{serverState.errors.department.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                  <Label htmlFor="add-role">Role</Label>
                  <Select onValueChange={handleSelectChange('role')} value={formData.role} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Role"} /></SelectTrigger>
                      <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.role && <p className="text-sm text-destructive">{serverState.errors.role.join(', ')}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="add-groupName">Group Name</Label>
                  <Select onValueChange={handleSelectChange('groupName')} value={formData.groupName} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Group"} /></SelectTrigger>
                      <SelectContent>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.groupName && <p className="text-sm text-destructive">{serverState.errors.groupName.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                  <Label htmlFor="add-campus">Campus</Label>
                   <Select onValueChange={handleSelectChange('campus')} value={formData.campus} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Campus"} /></SelectTrigger>
                      <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.campus && <p className="text-sm text-destructive">{serverState.errors.campus.join(', ')}</p>}
              </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="add-system">System</Label>
                <Select onValueChange={handleSelectChange('system')} value={formData.system} disabled={isLoadingLists}>
                    <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select System"} /></SelectTrigger>
                    <SelectContent>{systems.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {serverState?.errors?.system && <p className="text-sm text-destructive">{serverState.errors.system.join(', ')}</p>}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-phone">Phone</Label>
                    <Input id="add-phone" name="phone" placeholder="e.g., 5550107 (Numbers only)" value={formData.phone} onChange={handleInputChange} />
                    {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="add-hourlyRate" name="hourlyRate" type="number" step="0.01" placeholder="e.g., 25.50" value={formData.hourlyRate} onChange={handleInputChange} />
                    {serverState?.errors?.hourlyRate && <p className="text-sm text-destructive">{serverState.errors.hourlyRate.join(', ')}</p>}
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select onValueChange={handleSelectChange('gender')} value={formData.gender}>
                    <SelectTrigger><SelectValue placeholder="Select Gender" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                </Select>
                {serverState?.errors?.gender && <p className="text-sm text-destructive">{serverState.errors.gender.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID</Label>
                <Input id="nationalId" name="nationalId" placeholder="e.g., 1234567890" value={formData.nationalId} onChange={handleInputChange} />
                {serverState?.errors?.nationalId && <p className="text-sm text-destructive">{serverState.errors.nationalId.join(', ')}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="religion">Religion</Label>
                <Input id="religion" name="religion" placeholder="e.g., Christianity" value={formData.religion} onChange={handleInputChange} />
                {serverState?.errors?.religion && <p className="text-sm text-destructive">{serverState.errors.religion.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-stage">Stage</Label>
                <Select onValueChange={handleSelectChange('stage')} value={formData.stage} disabled={isLoadingLists}>
                    <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Stage"} /></SelectTrigger>
                    <SelectContent>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
                {serverState?.errors?.stage && <p className="text-sm text-destructive">{serverState.errors.stage.join(', ')}</p>}
              </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input id="subject" name="subject" placeholder="e.g., Mathematics" value={formData.subject} onChange={handleInputChange} />
                    {serverState?.errors?.subject && <p className="text-sm text-destructive">{serverState.errors.subject.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" placeholder="e.g., Mr., Ms., Dr." value={formData.title} onChange={handleInputChange} />
                    {serverState?.errors?.title && <p className="text-sm text-destructive">{serverState.errors.title.join(', ')}</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-password">Password</Label>
                <div className="relative">
                  <Input
                    id="add-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={formData.password}
                    onChange={handleInputChange}
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
                {serverState?.errors?.password && <p className="text-sm text-destructive">{serverState.errors.password.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-confirmPassword">Confirm Password</Label>
                <div className="relative">
                    <Input
                        id="add-confirmPassword"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter password"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
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
                {serverState?.errors?.confirmPassword && <p className="text-sm text-destructive">{serverState.errors.confirmPassword.join(', ')}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-dateOfBirth">Date of Birth</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.dateOfBirth && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.dateOfBirth ? format(formData.dateOfBirth, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={formData.dateOfBirth} onSelect={(date) => setFormData(prev => ({...prev, dateOfBirth: date}))} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="dateOfBirth" value={formData.dateOfBirth?.toISOString() ?? ''} />
                    {serverState?.errors?.dateOfBirth && <p className="text-sm text-destructive">{serverState.errors.dateOfBirth.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-joiningDate">Joining Date</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.joiningDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.joiningDate ? format(formData.joiningDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={formData.joiningDate} onSelect={(date) => setFormData(prev => ({...prev, joiningDate: date}))} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="joiningDate" value={formData.joiningDate?.toISOString() ?? ''} />
                    {serverState?.errors?.joiningDate && <p className="text-sm text-destructive">{serverState.errors.joiningDate.join(', ')}</p>}
                </div>
            </div>
            
            {serverState?.errors?.form && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>{serverState.errors.form.join(', ')}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
          <AlertDialogCancel type="button" onClick={() => { onSuccess(); }}>Cancel</AlertDialogCancel>
          <Button type="submit" form="add-employee-form" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : "Add Employee"}
          </Button>
        </AlertDialogFooter>
      </form>
    </>
  );
}

// Component for managing employee documents
interface EmployeeFileManagerProps {
  employee: Employee;
}

function EmployeeFileManager({ employee }: EmployeeFileManagerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [files, setFiles] = useState<EmployeeFile[]>(employee.documents || []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "employee", employee.id), (doc) => {
        const data = doc.data();
        setFiles(data?.documents || []);
    });
    return () => unsub();
  }, [employee.id]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const filePath = `employee-documents/${employee.id}/${file.name}`;
    const fileRef = storageRef(storage, filePath);
    const employeeDocRef = doc(db, "employee", employee.id);

    try {
      if (files.some(f => f.name === file.name)) {
        toast({
          variant: "destructive",
          title: "Duplicate File Name",
          description: "A file with this name already exists. Please rename it.",
        });
        setIsUploading(false);
        return;
      }
      
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newFile: EmployeeFile = {
        name: file.name,
        url: downloadURL,
        uploadedAt: Timestamp.now(),
      };
      
      await updateDoc(employeeDocRef, {
        documents: arrayUnion(newFile)
      });
      
      toast({
        title: "Success",
        description: `File "${file.name}" uploaded successfully.`,
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Could not upload the file.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
      setIsDeleting(fileName);
      const filePath = `employee-documents/${employee.id}/${fileName}`;
      const fileRef = storageRef(storage, filePath);
      const employeeDocRef = doc(db, "employee", employee.id);

      try {
          const fileToDelete = files.find(f => f.name === fileName);
          if (!fileToDelete) throw new Error("File not found in record.");
          
          await deleteObject(fileRef);
          await updateDoc(employeeDocRef, { documents: arrayRemove(fileToDelete) });

          toast({ title: "File Removed", description: `File "${fileName}" has been removed.` });
      } catch (error: any) {
          console.error("Error removing file:", error);
          toast({
              variant: "destructive",
              title: "Removal Failed",
              description: error.message || "Could not remove the file.",
          });
      } finally {
          setIsDeleting(null);
      }
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex justify-between items-center">
        <Label className="text-base font-semibold">Employee Documents</Label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Upload File
        </Button>
      </div>
      <div className="border rounded-md">
        {files.length > 0 ? (
          <ul className="divide-y max-h-48 overflow-y-auto">
            {files.map(file => (
              <li key={file.name} className="p-2 flex justify-between items-center group">
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" />
                  {file.name}
                </a>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(file.name)} disabled={!!isDeleting}>
                  {isDeleting === file.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground text-center p-4">No documents uploaded.</p>
        )}
      </div>
    </div>
  );
}


// Internal component for Edit Employee Form content
function EditEmployeeFormContent({ employee, onSuccess }: { employee: Employee; onSuccess: () => void }) {
  const { toast } = useToast();
  const [serverState, formAction, isPending] = useActionState(updateEmployeeAction, initialEditEmployeeState);
  const { roles, groupNames, systems, campuses, leaveTypes, isLoading: isLoadingLists } = useOrganizationLists();
  const [formClientError, setFormClientError] = useState<string | null>(null);

  // State for controlled components
  const [role, setRole] = useState(employee.role);
  const [groupName, setGroupName] = useState(employee.groupName);
  const [system, setSystem] = useState(employee.system);
  const [campus, setCampus] = useState(employee.campus);
  const [gender, setGender] = useState(employee.gender || "");
  const [stage, setStage] = useState(employee.stage || "");
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(employee.dateOfBirth?.toDate());
  const [joiningDate, setJoiningDate] = useState<Date | undefined>(employee.joiningDate?.toDate());
  const [leavingDate, setLeavingDate] = useState<Date | undefined>(employee.leavingDate?.toDate());
  const [leaveBalances, setLeaveBalances] = useState<{ [key: string]: number }>(employee.leaveBalances || {});

  const handleBalanceChange = (leaveTypeName: string, value: string) => {
    const numericValue = value === '' ? 0 : parseInt(value, 10);
    if (!isNaN(numericValue)) {
      setLeaveBalances(prev => ({
        ...prev,
        [leaveTypeName]: numericValue >= 0 ? numericValue : 0,
      }));
    }
  };

  useEffect(() => {
    if (!serverState) return;
    
    if (serverState.message && !serverState.errors) {
      toast({
        title: "Employee Updated",
        description: serverState.message,
      });
      onSuccess();
    } else if (serverState.errors?.form) {
      setFormClientError(serverState.errors.form.join(', '));
    } else if (serverState.errors && Object.keys(serverState.errors).length > 0) {
      const fieldErrors = Object.values(serverState.errors).flat().filter(Boolean).join('; ');
      setFormClientError(fieldErrors || "An error occurred while updating. Please check the details.");
    }
  }, [serverState, toast, onSuccess]);
  
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Edit Employee: {employee.name}</AlertDialogTitle>
        <AlertDialogDescription>
          Update the details for {employee.name}. Photo and balances are updated here.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="edit-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="employeeDocId" defaultValue={employee.id} />
        <input type="hidden" name="leaveBalancesJson" value={JSON.stringify(leaveBalances)} />
        {/* Hidden inputs for controlled Selects */}
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="groupNames" value={groupName} />
        <input type="hidden" name="system" value={system} />
        <input type="hidden" name="campus" value={campus} />
        <input type="hidden" name="gender" value={gender} />
        <input type="hidden" name="stage" value={stage} />
        
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-firstName">First Name</Label>
                    <Input id="edit-firstName" name="firstName" defaultValue={employee.firstName || employee.name.split(' ')[0] || ''}  />
                    {serverState?.errors?.firstName && <p className="text-sm text-destructive">{serverState.errors.firstName.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-lastName">Last Name</Label>
                    <Input id="edit-lastName" name="lastName" defaultValue={employee.lastName || employee.name.split(' ').slice(1).join(' ') || ''}  />
                    {serverState?.errors?.lastName && <p className="text-sm text-destructive">{serverState.errors.lastName.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employeeIdDisplay">Employee ID</Label>
              <Input id="edit-employeeIdDisplay" name="employeeIdDisplay" defaultValue={employee.employeeId} readOnly className="bg-muted/50" />
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
                  <Label>Group Name</Label>
                  <Select value={groupName} onValueChange={setGroupName} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Group"} /></SelectTrigger>
                      <SelectContent>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.groupName && <p className="text-sm text-destructive">{serverState.errors.groupName.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                  <Label>Campus</Label>
                   <Select value={campus} onValueChange={setCampus} disabled={isLoadingLists}>
                      <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Campus"} /></SelectTrigger>
                      <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {serverState?.errors?.campus && <p className="text-sm text-destructive">{serverState.errors.campus.join(', ')}</p>}
              </div>
            </div>

             <div className="space-y-2">
                <Label>System</Label>
                <Select value={system} onValueChange={setSystem} disabled={isLoadingLists}>
                    <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select System"} /></SelectTrigger>
                    <SelectContent>{systems.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {serverState?.errors?.system && <p className="text-sm text-destructive">{serverState.errors.system.join(', ')}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={employee.email}  />
                {serverState?.errors?.email && <p className="text-sm text-destructive">{serverState.errors.email.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" name="phone" defaultValue={employee.phone} placeholder="Numbers only" />
                {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="edit-hourlyRate" name="hourlyRate" type="number" step="0.01" defaultValue={employee.hourlyRate?.toString() ?? ""} placeholder="e.g., 25.50" />
                    {serverState?.errors?.hourlyRate && <p className="text-sm text-destructive">{serverState.errors.hourlyRate.join(', ')}</p>}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="edit-nationalId">National ID</Label>
                    <Input id="edit-nationalId" name="nationalId" defaultValue={employee.nationalId} />
                    {serverState?.errors?.nationalId && <p className="text-sm text-destructive">{serverState.errors.nationalId.join(', ')}</p>}
                </div>
            </div>

             <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                    <Label htmlFor="edit-religion">Religion</Label>
                    <Input id="edit-religion" name="religion" defaultValue={employee.religion} />
                    {serverState?.errors?.religion && <p className="text-sm text-destructive">{serverState.errors.religion.join(', ')}</p>}
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-stage">Stage</Label>
                    <Select value={stage} onValueChange={setStage} disabled={isLoadingLists}>
                        <SelectTrigger><SelectValue placeholder={isLoadingLists ? "Loading..." : "Select Stage"} /></SelectTrigger>
                        <SelectContent>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {serverState?.errors?.stage && <p className="text-sm text-destructive">{serverState.errors.stage.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-subject">Subject</Label>
                    <Input id="edit-subject" name="subject" defaultValue={employee.subject} />
                    {serverState?.errors?.subject && <p className="text-sm text-destructive">{serverState.errors.subject.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" name="title" defaultValue={employee.title} />
                {serverState?.errors?.title && <p className="text-sm text-destructive">{serverState.errors.title.join(', ')}</p>}
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
                            <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString() ?? ''} />
                    {serverState?.errors?.dateOfBirth && <p className="text-sm text-destructive">{serverState.errors.dateOfBirth.join(', ')}</p>}
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
                            <Calendar mode="single" selected={joiningDate} onSelect={setJoiningDate} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="joiningDate" value={joiningDate?.toISOString() ?? ''} />
                    {serverState?.errors?.joiningDate && <p className="text-sm text-destructive">{serverState.errors.joiningDate.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="edit-leavingDate">Leaving Date (Optional)</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !leavingDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {leavingDate ? format(leavingDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={leavingDate} onSelect={setLeavingDate} />
                    </PopoverContent>
                </Popover>
                <input type="hidden" name="leavingDate" value={leavingDate?.toISOString() ?? ''} />
                {serverState?.errors?.leavingDate && <p className="text-sm text-destructive">{serverState.errors.leavingDate.join(', ')}</p>}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-semibold">Leave Balances</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoadingLists ? (
                  <p>Loading leave types...</p>
                ) : leaveTypes.length > 0 ? (
                  leaveTypes.map((leaveType) => (
                    <div key={leaveType.id} className="space-y-2">
                      <Label htmlFor={`balance-${leaveType.name}`}>{leaveType.name}</Label>
                      <Input
                        id={`balance-${leaveType.name}`}
                        name={`leaveBalances[${leaveType.name}]`}
                        type="number"
                        placeholder="Days"
                        value={leaveBalances[leaveType.name] || ""}
                        onChange={(e) => handleBalanceChange(leaveType.name, e.target.value)}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground col-span-full">
                    No leave types found. Please add them in Settings &gt; Organization.
                  </p>
                )}
              </div>
              {serverState?.errors?.leaveBalances && (
                <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{serverState.errors.leaveBalances.join(', ')}</span>
                </div>
              )}
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

function EmployeeManagementContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [addFormKey, setAddFormKey] = useState(0);
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

  const canManageEmployees = useMemo(() => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase();
    return userRole === 'admin' || userRole === 'hr';
  }, [profile]);
  
  const hasFullView = useMemo(() => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase();
    return userRole === 'admin' || userRole === 'hr' || userRole === 'principal';
  }, [profile]);


  useEffect(() => {
    if(isLoadingProfile) return;

    setIsLoading(true);
    let q;
    const employeeCollection = collection(db, "employee");

    // Admins, HR, and Principals see all employees
    if (hasFullView) {
      q = query(employeeCollection);
    } else {
      // Other roles (if any) see no one by default on this page
      setEmployees([]);
      setTotalEmployees(0);
      setIsLoading(false);
      return;
    }

    getCountFromServer(q).then(snapshot => {
        setTotalEmployees(snapshot.data().count);
    }).catch(() => setTotalEmployees(0));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const employeesData: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData.sort((a, b) => a.name.localeCompare(b.name)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Employees",
        description: "Could not load employee data from Firestore. Please try again later.",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast, isLoadingProfile, profile, hasFullView]);
  
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
  
  const filteredEmployees = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    if (!searchTerm.trim()) {
      return employees;
    }
    return employees.filter(employee => {
        const searchableFields = [
            employee.name,
            employee.employeeId,
            employee.department,
            employee.role,
            employee.groupName,
            employee.campus,
            employee.email,
            employee.phone,
        ];
        return searchableFields.some(field =>
            typeof field === 'string' && field.toLowerCase().includes(lowercasedFilter)
        );
    });
  }, [employees, searchTerm]);


  const openAddDialog = () => {
    setAddFormKey(prevKey => prevKey + 1); 
    setIsAddDialogOpen(true);
  }
  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
  }

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
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
        <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 gap-4">
          <Card>
            <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : totalEmployees}</div>
            </CardContent>
          </Card>
        </div>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search employees (name, ID, department...)"
                className="w-full pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {isLoadingProfile ? (
              <Skeleton className="h-10 w-[190px]" />
            ) : canManageEmployees && (
              <Button onClick={openAddDialog} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Employee
              </Button>
            )}
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
                <TableHead>Employee ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Group Name</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Account</TableHead>
                {canManageEmployees && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      <Link href={`/employees/${employee.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar>
                            <AvatarImage src={employee.photoURL || undefined} alt={employee.name} />
                            <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                        </Avatar>
                        {employee.name}
                      </Link>
                    </TableCell>
                    <TableCell>{employee.employeeId}</TableCell>
                    <TableCell>{employee.role}</TableCell>
                    <TableCell>{employee.groupName}</TableCell>
                    <TableCell>{employee.campus}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                          <Tooltip>
                              <TooltipTrigger>
                                  {employee.userId ? <UserCheck className="h-5 w-5 text-green-500" /> : <UserX className="h-5 w-5 text-muted-foreground" />}
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>{employee.userId ? `Linked to Auth UID: ${employee.userId}` : "No user account linked."}</p>
                              </TooltipContent>
                          </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    {canManageEmployees && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDeleteConfirmDialog(employee)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Employee
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canManageEmployees ? 7 : 6} className="h-24 text-center">
                    {searchTerm ? "No employees found matching your search." : "No employees found. Try adding some!"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
      
      {isAddDialogOpen && (
        <AlertDialog open={isAddDialogOpen} onOpenChange={(open) => { if(!open) closeAddDialog(); else setIsAddDialogOpen(true); }}>
          <AlertDialogContent className="max-w-2xl">
            <AddEmployeeFormContent key={`add-form-${addFormKey}`} onSuccess={closeAddDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}
      
      {isEditDialogOpen && editingEmployee && (
        <AlertDialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) closeEditDialog(); else setIsEditDialogOpen(true); }}>
          <AlertDialogContent className="max-w-2xl">
              <EditEmployeeFormContent key={`edit-form-${editFormKey}-${editingEmployee.id}`} employee={editingEmployee} onSuccess={closeEditDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isDeleteDialogOpen && employeeToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { if(!open) closeDeleteConfirmDialog(); else setIsDeleteDialogOpen(true); }}>
          <AlertDialogContent>
            <form action={deleteAction}>
                <input type="hidden" name="employeeDocId" value={employeeToDelete.id} />
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the employee record for <strong>{employeeToDelete.name}</strong> (ID: {employeeToDelete.employeeId}) and all their associated files (photo, documents).
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
                  Create a secure password for <strong>{employeeToCreateLogin.email}</strong>.
                </DialogDescription>
              </DialogHeader>
              
              <input type="hidden" name="employeeDocId" value={employeeToCreateLogin.id} />
              <input type="hidden" name="email" value={employeeToCreateLogin.email} />
              <input type="hidden" name="name" value={employeeToCreateLogin.name} />
              
              <div className="grid gap-4 py-4">
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
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

    