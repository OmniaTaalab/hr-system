
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  Search,
  Eye,
  Trash2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganizationLists } from "@/hooks/use-organization-lists";

type Application = {
  id: string;
  firstNameEn?: string;
  lastNameEn?: string;
  positionJobTitle?: string;
  positionSubject?: string;
  expectedSalary?: number;
  schoolType?: string;
  nationalCampus?: string;
  submittedAt?: Timestamp;
};

type SortKey = keyof Application | 'name';

function ApplicationsTable() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { campuses, isLoading: isLoadingLists } = useOrganizationLists();
  const { profile, loading: isLoadingProfile } = useUserProfile();


  // State for Table Features
  const [sorting, setSorting] = useState<{ id: SortKey; desc: boolean }>({ id: 'submittedAt', desc: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [campusFilter, setCampusFilter] = useState("All");
  const [schoolTypeFilter, setSchoolTypeFilter] = useState("All");
  
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

  const handleSort = (columnId: SortKey) => {
    const isAsc = sorting.id === columnId && !sorting.desc;
    setSorting({ id: columnId, desc: isAsc });
  };
  
  const filteredAndSortedApplications = useMemo(() => {
    let filtered = applications;

    if (campusFilter !== "All") {
        filtered = filtered.filter(app => app.nationalCampus === campusFilter);
    }
    if (schoolTypeFilter !== "All") {
        filtered = filtered.filter(app => app.schoolType === schoolTypeFilter);
    }

    if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(app => {
            const name = `${app.firstNameEn || ''} ${app.lastNameEn || ''}`.toLowerCase();
            return name.includes(lowercasedTerm) ||
                   app.positionJobTitle?.toLowerCase().includes(lowercasedTerm) ||
                   app.positionSubject?.toLowerCase().includes(lowercasedTerm) ||
                   app.schoolType?.toLowerCase().includes(lowercasedTerm) ||
                   app.nationalCampus?.toLowerCase().includes(lowercasedTerm);
        });
    }

    return filtered.sort((a, b) => {
        const { id, desc } = sorting;
        let valA, valB;

        if (id === 'name') {
            valA = `${a.firstNameEn || ''} ${a.lastNameEn || ''}`.trim();
            valB = `${b.firstNameEn || ''} ${b.lastNameEn || ''}`.trim();
        } else {
            valA = a[id as keyof Application];
            valB = b[id as keyof Application];
        }

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (valA < valB) return desc ? 1 : -1;
        if (valA > valB) return desc ? -1 : 1;
        
        return 0;
    });
  }, [applications, searchTerm, sorting, campusFilter, schoolTypeFilter]);
  
  const paginatedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedApplications.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedApplications, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedApplications.length / rowsPerPage);

  const renderHeader = (columnId: SortKey, label: string) => {
    const isSorted = sorting.id === columnId;
    return (
      <Button variant="ghost" onClick={() => handleSort(columnId)}>
        {label}
        <ArrowUpDown className={`ml-2 h-4 w-4 ${isSorted ? 'text-primary' : ''}`} />
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
        <CardDescription>A list of all submitted job applications.</CardDescription>
        <div className="flex flex-wrap items-center gap-4 pt-4">
          <Input
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Select value={campusFilter} onValueChange={setCampusFilter} disabled={isLoadingLists}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by campus..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Campuses</SelectItem>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.name}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={schoolTypeFilter} onValueChange={setSchoolTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by school type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All School Types</SelectItem>
                <SelectItem value="National">National</SelectItem>
                <SelectItem value="International">International</SelectItem>
              </SelectContent>
            </Select>
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
                <TableHead>{renderHeader('name', 'Name')}</TableHead>
                <TableHead>{renderHeader('positionJobTitle', 'Position Title')}</TableHead>
                <TableHead>{renderHeader('positionSubject', 'Subject')}</TableHead>
                <TableHead>{renderHeader('expectedSalary', 'Expected Salary')}</TableHead>
                <TableHead>{renderHeader('schoolType', 'School Type')}</TableHead>
                <TableHead>{renderHeader('nationalCampus', 'Campus')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : paginatedApplications.length > 0 ? (
                paginatedApplications.map((app, index) => (
                  <TableRow key={app.id} data-state={rowSelection[app.id] && "selected"}>
                    <TableCell>
                      <Checkbox checked={!!rowSelection[app.id]} onCheckedChange={(value) => setRowSelection(prev => ({...prev, [app.id]: !!value}))} />
                    </TableCell>
                    <TableCell>{(currentPage - 1) * rowsPerPage + index + 1}</TableCell>
                    <TableCell className="font-medium">{`${app.firstNameEn || ''} ${app.lastNameEn || ''}`.trim()}</TableCell>
                    <TableCell>{app.positionJobTitle || 'N/A'}</TableCell>
                    <TableCell>{app.positionSubject || 'N/A'}</TableCell>
                    <TableCell>{app.expectedSalary ? `$${app.expectedSalary.toLocaleString()}` : 'N/A'}</TableCell>
                    <TableCell>{app.schoolType || 'N/A'}</TableCell>
                    <TableCell>{app.nationalCampus || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                       <Button variant="ghost" size="icon" onClick={() => router.push(`/nis/${app.id}`)}>
                         <Eye className="h-4 w-4" />
                       </Button>
                       <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
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
