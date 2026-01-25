
"use client";

import React, { useState, useEffect, useMemo, useCallback, useActionState } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowUpDown,
  ChevronDown,
  Eye,
  Trash2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Columns,
  Calendar as CalendarIcon,
  X,
  FileDown,
} from "lucide-react";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy, Timestamp, updateDoc, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MultiSelectFilter } from "@/components/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteApplicationAction, type DeleteApplicationState } from "@/app/actions/job-actions";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';


type Application = {
  id: string;
  read?: boolean;
  [key: string]: any; // Allow any field for searching
};

type SortKey = keyof Application | 'name';

// Helper to safely format dates that might be Timestamps or strings
const formatDateSafe = (date: any) => {
    if (!date) return "-";
    let d;
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else if (date.seconds) { // Handle Firestore-like timestamp objects
      d = new Date(date.seconds * 1000);
    } else {
      return "-";
    }
  
    if (isNaN(d.getTime())) return "-";
    return format(d, "PPP");
  };

const initialDeleteState: DeleteApplicationState = { success: false };

function DeleteApplicationDialog({ application, actorProfile }: { application: Application; actorProfile: any }) {
    const { toast } = useToast();
    const [deleteState, deleteAction, isDeletePending] = useActionState(deleteApplicationAction, initialDeleteState);

    useEffect(() => {
        if (deleteState.message) {
            toast({
                title: deleteState.success ? "Success" : "Error",
                description: deleteState.message,
                variant: deleteState.success ? "default" : "destructive",
            });
        }
    }, [deleteState, toast]);

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deleteAction} onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="actorId" value={actorProfile?.id} />
                    <input type="hidden" name="actorEmail" value={actorProfile?.email} />
                    <input type="hidden" name="actorRole" value={actorProfile?.role} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the application from <strong>{`${application.firstNameEn || ''} ${application.lastNameEn || ''}`.trim()}</strong>. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteState?.errors?.form && <p className="text-sm text-destructive mt-2">{deleteState.errors.form.join(', ')}</p>}
                    <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                        <AlertDialogAction type="submit" disabled={isDeletePending} className="bg-destructive hover:bg-destructive/90">
                            {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ApplicationsTable() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { campuses, isLoading: isLoadingLists } = useOrganizationLists();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { toast } = useToast();

  const allColumns = useMemo(() => [
    { id: 'name', label: 'Name', visible: true, required: true },
    { id: 'nameAr', label: 'Name (Arabic)', visible: false },
    { id: 'positionJobTitle', label: 'Position Title', visible: true },
    { id: 'positionSubject', label: 'Subject', visible: true },
    { id: 'expectedSalary', label: 'Expected Salary', visible: false },
    { id: 'schoolType', label: 'School Type', visible: true },
    { id: 'nationalCampus', label: 'Campus', visible: true },
    { id: 'submittedAt', label: 'Submitted At', visible: true },
    { id: 'yearsOfExperience', label: 'Years of Exp.', visible: false },
    { id: 'email1', label: 'Email', visible: false },
    { id: 'email2', label: 'Email 2', visible: false },
    { id: 'mobilePhone', label: 'Mobile', visible: false },
    { id: 'homePhone', label: 'Home Phone', visible: false },
    { id: 'otherPhone', label: 'Other Phone', visible: false },
    { id: 'dateOfBirth', label: 'Date of Birth', visible: false },
    { id: 'placeOfBirth', label: 'Place of Birth', visible: false },
    { id: 'nationalities', label: 'Nationalities', visible: false },
    { id: 'isParentAtNIS', label: 'Parent at NIS?', visible: false },
    { id: 'numberOfChildren', label: 'No. of Children', visible: false },
    { id: 'address', label: 'Address', visible: false },
    { id: 'noticePeriod', label: 'Notice Period', visible: false },
    { id: 'availableStartDate', label: 'Available Start Date', visible: false },
    { id: 'needsBus', label: 'Needs Bus?', visible: false },
    { id: 'insideContact', label: 'Inside Contact?', visible: false },
    { id: 'previouslyWorkedAtNIS', label: 'Previously Worked?', visible: false },
    { id: 'contactedByHR', label: 'Contacted by HR', visible: false },
    { id: 'howDidYouHear', label: 'How did you hear?', visible: false },
    { id: 'school_name', label: 'School Name', visible: false },
    { id: 'school_major', label: 'School Major', visible: false },
    { id: 'school_cityCountry', label: 'School Location', visible: false },
    { id: 'school_overall', label: 'School Grade', visible: false },
    { id: 'school_startDate', label: 'School Start', visible: false },
    { id: 'school_endDate', label: 'School End', visible: false },
    { id: 'university_name', label: 'University Name', visible: false },
    { id: 'university_faculty', label: 'University Faculty', visible: false },
    { id: 'university_major', label: 'University Major', visible: false },
    { id: 'university_cityCountry', label: 'University Location', visible: false },
    { id: 'university_overall', label: 'University Grade', visible: false },
    { id: 'university_startDate', label: 'University Start', visible: false },
    { id: 'university_endDate', label: 'University End', visible: false },
    { id: 'diploma1_name', label: 'Diploma 1', visible: false },
    { id: 'diploma2_name', label: 'Diploma 2', visible: false },
    { id: 'skill_ms_office', label: 'MS Office', visible: false },
    { id: 'skill_smart_board', label: 'Smart Board', visible: false },
    { id: 'skill_e_learning', label: 'E-Learning', visible: false },
    { id: 'skill_gclass_zoom', label: 'Google/Zoom', visible: false },
    { id: 'skill_oracle_db', label: 'Oracle DB', visible: false },
    { id: 'workExperience', label: '# Work Exp.', visible: false },
], []);

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => 
    allColumns.reduce((acc, col) => ({ ...acc, [col.id]: col.visible }), {})
  );

  // State for Table Features
  const [sorting, setSorting] = useState<{ id: SortKey; desc: boolean }>({ id: 'submittedAt', desc: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [campusFilter, setCampusFilter] = useState<string[]>([]);
  const [schoolTypeFilter, setSchoolTypeFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  useEffect(() => {
    if (isLoadingProfile) return;
    if (!canViewPage) {
        setIsLoading(false);
        return;
    };
    
    setIsLoading(true);
    const q = query(collection(db, "nis"), orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const appsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Application));
      setApplications(appsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching applications:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage]);

  const handleRowClick = async (app: Application) => {
    if (canViewPage && !app.read) {
        const appRef = doc(db, 'nis', app.id);
        try {
            await updateDoc(appRef, { read: true });
        } catch (error) {
            console.error("Failed to mark as read:", error);
        }
    }
    router.push(`/form/${app.id}`);
  };

  const handleSort = (columnId: SortKey) => {
    const isAsc = sorting.id === columnId && !sorting.desc;
    setSorting({ id: columnId, desc: isAsc });
  };
  
  const filteredAndSortedApplications = useMemo(() => {
    let filtered = applications;

    if (campusFilter.length > 0) {
        filtered = filtered.filter(app => app.nationalCampus && campusFilter.includes(app.nationalCampus));
    }
    if (schoolTypeFilter.length > 0) {
        filtered = filtered.filter(app => app.schoolType && schoolTypeFilter.includes(app.schoolType));
    }

    if (dateFilter) {
      filtered = filtered.filter(app => {
        if (!app.submittedAt) return false;
        const submittedDate = app.submittedAt instanceof Timestamp ? app.submittedAt.toDate() : new Date(app.submittedAt);
        // Compare just the date part, ignoring time
        return format(submittedDate, 'yyyy-MM-dd') === format(dateFilter, 'yyyy-MM-dd');
      });
    }

    if (readFilter !== 'all') {
      if (readFilter === 'unread') {
        filtered = filtered.filter(app => !app.read);
      } else { // 'read'
        filtered = filtered.filter(app => app.read === true);
      }
    }

    if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(app => {
            return Object.values(app).some(value =>
                typeof value === 'string' && value.toLowerCase().includes(lowercasedTerm)
            );
        });
    }

    return filtered.sort((a, b) => {
        const { id, desc } = sorting;
        let valA, valB;

        if (id === 'name') {
            valA = `${a.firstNameEn || ''} ${a.lastNameEn || ''}`.trim();
            valB = `${b.firstNameEn || ''} ${b.lastNameEn || ''}`.trim();
        } else if (id === 'nameAr') {
            valA = `${a.firstNameAr || ''} ${a.fatherNameAr || ''} ${a.familyNameAr || ''}`.trim();
            valB = `${b.firstNameAr || ''} ${b.fatherNameAr || ''} ${b.familyNameAr || ''}`.trim();
        }
        else {
            valA = a[id as keyof Application];
            valB = b[id as keyof Application];
        }

        if (valA instanceof Timestamp && valB instanceof Timestamp) {
            return desc ? valB.toMillis() - valA.toMillis() : valA.toMillis() - valB.toMillis();
        }
        
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (valA < valB) return desc ? 1 : -1;
        if (valA > valB) return desc ? -1 : 1;
        
        return 0;
    });
  }, [applications, searchTerm, sorting, campusFilter, schoolTypeFilter, dateFilter, readFilter]);
  
  const paginatedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedApplications.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedApplications, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedApplications.length / rowsPerPage);

  const handleExportExcel = () => {
    if (filteredAndSortedApplications.length === 0) {
      toast({
        title: "No Data",
        description: "There are no applications to export in the current view.",
        variant: "destructive"
      });
      return;
    }
    
    const dataToExport = filteredAndSortedApplications.map(app => {
        const row: Record<string, any> = {};
        allColumns.filter(c => columnVisibility[c.id]).forEach(col => {
            if (col.id === 'name') {
                row[col.label] = `${app.firstNameEn || ''} ${app.lastNameEn || ''}`.trim();
            } else if (col.id === 'submittedAt' || col.id === 'dateOfBirth' || col.id === 'availableStartDate') {
                row[col.label] = formatDateSafe(app[col.id]);
            } else {
                 row[col.label] = app[col.id] ?? 'N/A';
            }
        });
        row['Status'] = app.read ? 'Read' : 'Unread';
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Job Applications");
    XLSX.writeFile(workbook, `Job_Applications_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export Successful",
      description: "The application list has been exported to Excel.",
    });
  };

  const renderHeader = (columnId: SortKey, label: string) => {
    const isSorted = sorting.id === columnId;
    return (
      <Button variant="ghost" onClick={() => handleSort(columnId)}>
        {label}
        <ArrowUpDown className={cn(`ml-2 h-4 w-4 ${isSorted ? 'text-primary' : ''}`)} />
      </Button>
    );
  };
  
    if (isLoadingProfile) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  if (!canViewPage) {
    return (
      <Card className="text-center">
        <CardHeader>
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <CardTitle className="mt-4 text-2xl">Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
          <Button asChild className="mt-4">
            <a href="/">Go to Dashboard</a>
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Applications</CardTitle>
        <CardDescription>
          A list of all submitted job applications.
        </CardDescription>
        <div className="flex flex-col gap-2 pt-4">
            <div className="flex flex-nowrap items-center gap-2">
                <Input
                  placeholder="Search all application fields..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="min-w-[200px]"
                  />
                <MultiSelectFilter
                  placeholder="Filter by campus..."
                  options={campuses.map(c => ({ label: c.name, value: c.name }))}
                  selected={campusFilter}
                  onChange={setCampusFilter}
                  className="min-w-[200px]"
                  />
                <MultiSelectFilter
                  placeholder="Filter by school type..."
                  options={[
                    { label: "National", value: "National" },
                    { label: "International", value: "International" }
                  ]}
                  selected={schoolTypeFilter}
                  onChange={setSchoolTypeFilter}
                  className="min-w-[200px]"
                  />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Popover>
                <PopoverTrigger asChild>
                    <Button
                    variant={"outline"}
                    className={cn(
                        "w-full sm:w-auto justify-start text-left font-normal",
                        !dateFilter && "text-muted-foreground"
                    )}
                    >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(dateFilter, "PPP") : <span>Filter by date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    initialFocus
                    />
                </PopoverContent>
                </Popover>
                {dateFilter && <Button variant="ghost" size="icon" onClick={() => setDateFilter(null)}><X className="h-4 w-4" /></Button>}
                
                <Select value={readFilter} onValueChange={(value) => setReadFilter(value as any)}>
                <SelectTrigger className="w-full sm:w-auto">
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                </SelectContent>
                </Select>

                <Button variant="outline" onClick={handleExportExcel}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export Excel
                </Button>
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                    <Columns className="mr-2 h-4 w-4" /> Columns
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={columnVisibility[column.id]}
                        disabled={column.required}
                        onCheckedChange={(value) => {
                            setColumnVisibility((prev) => ({
                                ...prev,
                                [column.id]: !!value,
                            }));
                        }}
                        onSelect={(e) => {
                            e.preventDefault();
                        }}
                    >
                        {column.label}
                    </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    checked={Object.keys(rowSelection).length === paginatedApplications.length && paginatedApplications.length > 0}
                    onCheckedChange={(value) => {
                        if(value) {
                            const newSelection: Record<string, boolean> = {};
                            paginatedApplications.forEach(app => newSelection[app.id] = true);
                            setRowSelection(newSelection);
                        } else {
                            setRowSelection({});
                        }
                    }}
                  />
                </TableHead>
                <TableHead>#</TableHead>
                <TableHead>Status</TableHead>
                {allColumns.filter(c => columnVisibility[c.id]).map(c => (
                  <TableHead key={c.id}>{renderHeader(c.id as SortKey, c.label)}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={allColumns.filter(c => columnVisibility[c.id]).length + 4} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : paginatedApplications.length > 0 ? (
                paginatedApplications.map((app, index) => (
                  <TableRow key={app.id} data-state={rowSelection[app.id] && "selected"} onClick={() => handleRowClick(app)} className={cn("cursor-pointer", !app.read && "font-bold")}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!!rowSelection[app.id]} onCheckedChange={(value) => setRowSelection(prev => ({...prev, [app.id]: !!value}))} />
                    </TableCell>
                    <TableCell>{(currentPage - 1) * rowsPerPage + index + 1}</TableCell>
                    <TableCell>
                      {!app.read && (
                        <div className="flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" title="Unread" />
                        </div>
                      )}
                    </TableCell>
                    {columnVisibility.name && <TableCell className="font-medium">{`${app.firstNameEn || ''} ${app.lastNameEn || ''}`.trim()}</TableCell>}
                    {columnVisibility.nameAr && <TableCell dir="rtl" className="font-medium">{`${app.firstNameAr || ''} ${app.fatherNameAr || ''} ${app.familyNameAr || ''}`.trim()}</TableCell>}
                    {columnVisibility.positionJobTitle && <TableCell>{app.positionJobTitle || 'N/A'}</TableCell>}
                    {columnVisibility.positionSubject && <TableCell>{app.positionSubject || 'N/A'}</TableCell>}
                    {columnVisibility.expectedSalary && <TableCell>{app.expectedSalary ? `$${app.expectedSalary.toLocaleString()}` : 'N/A'}</TableCell>}
                    {columnVisibility.schoolType && <TableCell>{app.schoolType || 'N/A'}</TableCell>}
                    {columnVisibility.nationalCampus && <TableCell>{app.nationalCampus || 'N/A'}</TableCell>}
                    {columnVisibility.submittedAt && <TableCell>{app.submittedAt instanceof Timestamp ? format(app.submittedAt.toDate(), "dd MMM yyyy") : 'N/A'}</TableCell>}
                    {columnVisibility.yearsOfExperience && <TableCell>{app.yearsOfExperience ?? 'N/A'}</TableCell>}
                    {columnVisibility.email1 && <TableCell>{app.email1 || 'N/A'}</TableCell>}
                    {columnVisibility.email2 && <TableCell>{app.email2 || 'N/A'}</TableCell>}
                    {columnVisibility.mobilePhone && <TableCell>{app.mobilePhone || 'N/A'}</TableCell>}
                    {columnVisibility.homePhone && <TableCell>{app.homePhone || 'N/A'}</TableCell>}
                    {columnVisibility.otherPhone && <TableCell>{app.otherPhone || 'N/A'}</TableCell>}
                    {columnVisibility.dateOfBirth && <TableCell>{formatDateSafe(app.dateOfBirth)}</TableCell>}
                    {columnVisibility.placeOfBirth && <TableCell>{app.placeOfBirth || 'N/A'}</TableCell>}
                    {columnVisibility.nationalities && <TableCell>{app.nationalities || 'N/A'}</TableCell>}
                    {columnVisibility.isParentAtNIS && <TableCell>{app.isParentAtNIS || 'N/A'}</TableCell>}
                    {columnVisibility.numberOfChildren && <TableCell>{app.numberOfChildren ?? 'N/A'}</TableCell>}
                    {columnVisibility.address && <TableCell>{[app.apartment, app.building, app.street, app.area, app.city, app.country].filter(Boolean).join(', ') || 'N/A'}</TableCell>}
                    {columnVisibility.noticePeriod && <TableCell>{app.noticePeriod ? `${app.noticePeriod} days` : 'N/A'}</TableCell>}
                    {columnVisibility.availableStartDate && <TableCell>{formatDateSafe(app.availableStartDate)}</TableCell>}
                    {columnVisibility.needsBus && <TableCell>{app.needsBus || 'N/A'}</TableCell>}
                    {columnVisibility.insideContact && <TableCell>{app.insideContact || 'N/A'}</TableCell>}
                    {columnVisibility.previouslyWorkedAtNIS && <TableCell>{app.previouslyWorkedAtNIS || 'N/A'}</TableCell>}
                    {columnVisibility.contactedByHR && <TableCell>{app.contactedByHR || 'N/A'}</TableCell>}
                    {columnVisibility.howDidYouHear && <TableCell>{app.howDidYouHear || 'N/A'}</TableCell>}
                    {columnVisibility.school_name && <TableCell>{app.school_name || 'N/A'}</TableCell>}
                    {columnVisibility.school_major && <TableCell>{app.school_major || 'N/A'}</TableCell>}
                    {columnVisibility.school_cityCountry && <TableCell>{app.school_cityCountry || 'N/A'}</TableCell>}
                    {columnVisibility.school_overall && <TableCell>{app.school_overall || 'N/A'}</TableCell>}
                    {columnVisibility.school_startDate && <TableCell>{formatDateSafe(app.school_startDate)}</TableCell>}
                    {columnVisibility.school_endDate && <TableCell>{formatDateSafe(app.school_endDate)}</TableCell>}
                    {columnVisibility.university_name && <TableCell>{app.university_name || 'N/A'}</TableCell>}
                    {columnVisibility.university_faculty && <TableCell>{app.university_faculty || 'N/A'}</TableCell>}
                    {columnVisibility.university_major && <TableCell>{app.university_major || 'N/A'}</TableCell>}
                    {columnVisibility.university_cityCountry && <TableCell>{app.university_cityCountry || 'N/A'}</TableCell>}
                    {columnVisibility.university_overall && <TableCell>{app.university_overall || 'N/A'}</TableCell>}
                    {columnVisibility.university_startDate && <TableCell>{formatDateSafe(app.university_startDate)}</TableCell>}
                    {columnVisibility.university_endDate && <TableCell>{formatDateSafe(app.university_endDate)}</TableCell>}
                    {columnVisibility.diploma1_name && <TableCell>{app.diploma1_name || 'N/A'}</TableCell>}
                    {columnVisibility.diploma2_name && <TableCell>{app.diploma2_name || 'N/A'}</TableCell>}
                    {columnVisibility.skill_ms_office && <TableCell>{app.skill_ms_office || 'N/A'}</TableCell>}
                    {columnVisibility.skill_smart_board && <TableCell>{app.skill_smart_board || 'N/A'}</TableCell>}
                    {columnVisibility.skill_e_learning && <TableCell>{app.skill_e_learning || 'N/A'}</TableCell>}
                    {columnVisibility.skill_gclass_zoom && <TableCell>{app.skill_gclass_zoom || 'N/A'}</TableCell>}
                    {columnVisibility.skill_oracle_db && <TableCell>{app.skill_oracle_db || 'N/A'}</TableCell>}
                    {columnVisibility.workExperience && <TableCell>{app.workExperience?.length || 0}</TableCell>}


                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                       <Button variant="ghost" size="icon" onClick={() => router.push(`/form/${app.id}`)}>
                         <Eye className="h-4 w-4" />
                       </Button>
                       <DeleteApplicationDialog application={app} actorProfile={profile} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={allColumns.filter(c => columnVisibility[c.id]).length + 4} className="h-24 text-center">
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between space-x-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
                {Object.keys(rowSelection).length} of {filteredAndSortedApplications.length} row(s) selected.
            </div>
            <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Rows per page</p>
                <Select
                    value={`${rowsPerPage}`}
                    onValueChange={(value) => {
                        setRowsPerPage(Number(value));
                        setCurrentPage(1);
                    }}
                >
                    <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={rowsPerPage} />
                    </SelectTrigger>
                    <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center space-x-2">
                 <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">Go to first page</span>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    disabled={currentPage === 1}
                >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronDown className="h-4 w-4 rotate-90" />
                </Button>
                 <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">Go to next page</span>
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                >
                    <span className="sr-only">Go to last page</span>
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NisListPage() {
  return (
    <AppLayout>
      <ApplicationsTable />
    </AppLayout>
  );
}

    