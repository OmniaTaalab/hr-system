
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from 'next/navigation';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCircle, Briefcase, MapPin, DollarSign, CalendarDays, Phone, Mail, FileText, User, Hash, Cake, Stethoscope, BookOpen, Star, LogIn, LogOut, BookOpenCheck, Users, Code, ShieldCheck, Hourglass, ShieldX, CalendarOff, UserMinus, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from "@/hooks/use-toast";

interface EmergencyContact {
  name: string;
  relationship: string;
  number: string;
}

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
  personalEmail?: string;
  emergencyContact?: EmergencyContact;
  reportLine1?: string;
  reportLine2?: string;
  employeeId: string; 
  department: string;
  role: string;
  groupName: string;
  system: string;
  campus: string;
  email: string; // NIS Email
  phone: string; // Personal Phone
  hourlyRate?: number;
  photoURL?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;
  gender?: string;
  nationalId?: string;
  religion?: string;
  stage?: string;
  subject?: string;
  title?: string;
  documents?: EmployeeFile[];
  status?: "Active" | "Terminated";
  leavingDate?: Timestamp | null;
  reasonForLeaving?: string;
}

interface AttendanceLog {
  id: string;
  check_in: string | null;
  check_out: string | null;
  date: string;
}

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  numberOfDays?: number;
  status: "Pending" | "Approved" | "Rejected";
}

function LeaveStatusBadge({ status }: { status: LeaveRequest["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function DetailItem({ icon: Icon, label, value, children }: { icon: React.ElementType, label: string, value?: string | undefined | null, children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-center text-sm">
      <Icon className="h-4 w-4 mr-3 text-muted-foreground flex-shrink-0" />
      <span className="font-medium text-muted-foreground mr-2">{label}:</span>
      {value && <span className="text-foreground">{value}</span>}
      {children}
    </div>
  );
}

function EmployeeProfileContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { profile, loading: profileLoading } = useUserProfile();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  useEffect(() => {
    if (id) {
      const fetchEmployeeData = async () => {
        setLoading(true);
        setError(null);
        try {
          const decodedId = decodeURIComponent(id);
          const q = query(collection(db, 'employee'), where('employeeId', '==', decodedId), limit(1));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0];
            const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
            setEmployee(employeeData);
            fetchAttendanceLogs(employeeData.employeeId);
            fetchLeaveRequests(employeeData.id);
          } else {
            setError('Employee not found.');
          }
        } catch (e) {
          console.error("Error fetching employee details:", e);
          setError('Failed to load employee details.');
        } finally {
          setLoading(false);
        }
      };

      const fetchAttendanceLogs = async (employeeId: string) => {
        setLoadingLogs(true);
        try {
          const logsQuery = query(
            collection(db, 'attendance_log'),
            where('userId', '==', Number(employeeId)),
            orderBy('date', 'desc')
          );
          const querySnapshot = await getDocs(logsQuery);
          let logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
          setAttendanceLogs(logs);
        } catch (e) {
          console.error("Error fetching attendance logs:", e);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load attendance history.",
          });
        } finally {
          setLoadingLogs(false);
        }
      };
      
      const fetchLeaveRequests = async (employeeDocId: string) => {
        setLoadingLeaves(true);
        try {
          const leavesQuery = query(
            collection(db, 'leaveRequests'),
            where('requestingEmployeeDocId', '==', employeeDocId),
            orderBy('startDate', 'desc')
          );
          const querySnapshot = await getDocs(leavesQuery);
          const leaves = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));
          setLeaveRequests(leaves);
        } catch(e) {
          console.error("Error fetching leave requests:", e);
        } finally {
          setLoadingLeaves(false);
        }
      };

      fetchEmployeeData();
    }
  }, [id, toast]);
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };
  
  const canView = !profileLoading && profile;

  const handleExportPDF = async () => {
    if (!employee) return;
    toast({ title: 'Generating PDF...', description: 'Please wait while the PDF is being created.' });

    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(`Employee Profile`, 105, 20, { align: "center" });

    // Add Image
    if (employee.photoURL) {
      try {
        const response = await fetch(employee.photoURL);
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = () => {
            doc.addImage(reader.result as string, 'JPEG', 15, 30, 40, 40);
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Error adding image to PDF:", e);
      }
    }

    doc.setFontSize(18);
    doc.text(employee.name, 65, 40);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(employee.role, 65, 48);

    const tableData = [
      ['Employee ID', employee.employeeId],
      ['Work Email', employee.email],
      ['Personal Email', employee.personalEmail || '-'],
      ['Phone', employee.phone],
      ['Department', employee.department],
      ['Campus', employee.campus],
      ['Stage', employee.stage || '-'],
      ['Subject', employee.subject || '-'],
      ['Joining Date', employee.joiningDate ? format(employee.joiningDate.toDate(), 'PPP') : '-'],
      ['Date of Birth', employee.dateOfBirth ? format(employee.dateOfBirth.toDate(), 'PPP') : '-'],
      ['Gender', employee.gender || '-'],
      ['National ID', employee.nationalId || '-'],
      ['Religion', employee.religion || '-'],
      ['Emergency Contact', employee.emergencyContact ? `${employee.emergencyContact.name} (${employee.emergencyContact.relationship})` : '-'],
      ['Emergency Number', employee.emergencyContact?.number || '-'],
    ];

    autoTable(doc, {
      startY: 80,
      head: [['Attribute', 'Information']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [44, 58, 71] },
    });
    
    doc.save(`Profile_${employee.name.replace(/\s/g, '_')}.pdf`);
  };


  if (loading || profileLoading) {
    return (
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-32" />
          <Card>
              <CardHeader className="flex flex-col md:flex-row items-center gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-5 w-32" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-1/2" />
              </CardContent>
          </Card>
          <Card>
             <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
             <CardContent><Skeleton className="h-40 w-full" /></CardContent>
          </Card>
        </div>
    );
  }

   if (!canView) {
    return (
        <div className="text-center">You do not have permission to view this page.</div>
    );
  }

  return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Employee List
        </Button>

        {error ? (
            <Card className="text-center p-8">
                <CardTitle className="text-destructive">{error}</CardTitle>
                <CardDescription>The requested employee could not be found.</CardDescription>
            </Card>
        ) : employee && (
          <>
            <Card className="shadow-lg">
              <CardHeader className="flex flex-col md:flex-row items-center gap-6 bg-muted/30">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                      <AvatarImage src={employee.photoURL || undefined} alt={employee.name} />
                      <AvatarFallback className="text-3xl">{getInitials(employee.name)}</AvatarFallback>
                  </Avatar>
                  <div className="text-center md:text-left">
                      <CardTitle className="font-headline text-3xl">{employee.name}</CardTitle>
                      <CardDescription className="text-lg text-primary">{employee.role}</CardDescription>
                       {employee.status === 'Terminated' && (
                          <Badge variant="destructive" className="mt-2">
                              Terminated on {employee.leavingDate ? format(employee.leavingDate.toDate(), 'PPP') : 'N/A'}
                          </Badge>
                      )}
                  </div>
              </CardHeader>
              <CardContent className="p-6">
                {employee.status === 'Terminated' && employee.reasonForLeaving && (
                    <div className="mb-6 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                         <h3 className="text-lg font-semibold flex items-center mb-2 text-destructive"><UserMinus className="mr-2 h-5 w-5" />Deactivation Information</h3>
                         <DetailItem icon={CalendarDays} label="Leaving Date" value={employee.leavingDate ? format(employee.leavingDate.toDate(), 'PPP') : undefined} />
                         <DetailItem icon={FileText} label="Reason" value={employee.reasonForLeaving} />
                    </div>
                )}

                <h3 className="text-lg font-semibold flex items-center mb-4"><Briefcase className="mr-2 h-5 w-5 text-primary" />Work Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={Mail} label="NIS Email" value={employee.email} />
                   <DetailItem icon={User} label="Title" value={employee.title} />
                   <DetailItem icon={Briefcase} label="Department" value={employee.department} />
                   <DetailItem icon={Hash} label="Employee ID" value={employee.employeeId} />
                   <DetailItem icon={Star} label="Role" value={employee.role} />
                   <DetailItem icon={Users} label="Stage" value={employee.stage} />
                   <DetailItem icon={Code} label="System" value={employee.system} />
                   <DetailItem icon={MapPin} label="Campus" value={employee.campus} />
                   <DetailItem icon={CalendarDays} label="Joining Date" value={employee.joiningDate ? format(employee.joiningDate.toDate(), 'PPP') : undefined} />
                   <DetailItem icon={Stethoscope} label="Subject" value={employee.subject} />
                   <DetailItem icon={Activity} label="Status">
                     <Badge variant={employee.status === "Terminated" ? "destructive" : "secondary"} className={employee.status === 'Active' ? 'bg-green-100 text-green-800' : ''}>
                       {employee.status || "Active"}
                     </Badge>
                   </DetailItem>
                </div>
                
                <Separator className="my-6" />

                <h3 className="text-lg font-semibold flex items-center mb-4"><UserCircle className="mr-2 h-5 w-5 text-primary" />Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={Mail} label="Personal Email" value={employee.personalEmail} />
                   <DetailItem icon={Phone} label="Personal Phone" value={employee.phone} />
                   <DetailItem icon={Cake} label="Birthday" value={employee.dateOfBirth ? format(employee.dateOfBirth.toDate(), 'PPP') : undefined} />
                   <DetailItem icon={User} label="Gender" value={employee.gender} />
                   <DetailItem icon={FileText} label="National ID" value={employee.nationalId} />
                   <DetailItem icon={Star} label="Religion" value={employee.religion} />
                </div>

                <Separator className="my-6" />
                
                <h3 className="text-lg font-semibold flex items-center mb-4"><Phone className="mr-2 h-5 w-5 text-primary" />Emergency Contact</h3>
                {employee.emergencyContact ? (
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                     <DetailItem icon={User} label="Name" value={employee.emergencyContact.name} />
                     <DetailItem icon={Users} label="Relationship" value={employee.emergencyContact.relationship} />
                     <DetailItem icon={Phone} label="Number" value={employee.emergencyContact.number} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No emergency contact information provided.</p>
                )}

              </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleExportPDF}>
                        <FileText className="mr-2 h-4 w-4" />
                        Export Profile to PDF
                    </Button>
                </CardContent>
            </Card>

            {(employee.documents && employee.documents.length > 0) && (
              <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-6 w-6 text-primary" />
                      Attached Documents
                    </CardTitle>
                    <CardDescription>
                      Download employee-related documents.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {employee.documents.map((file, idx) => (
                      <li key={`${file.url}-${idx}`} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                        <span className="font-medium text-sm">{file.name}</span>
                        <Button asChild variant="secondary" size="sm">
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <FileText className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center">
                    <CalendarOff className="mr-2 h-6 w-6 text-primary" />
                    Leave History
                  </CardTitle>
                  <CardDescription>
                    A log of all leave requests submitted by this employee.
                  </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLeaves ? (
                    <div className="flex justify-center items-center h-40">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : leaveRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10">No leave requests found for this employee.</p>
                ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Leave Type</TableHead>
                              <TableHead>Start Date</TableHead>
                              <TableHead>End Date</TableHead>
                              <TableHead>Days</TableHead>
                              <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {leaveRequests.map((request) => (
                              <TableRow key={request.id}>
                                  <TableCell>{request.leaveType}</TableCell>
                                  <TableCell>{format(request.startDate.toDate(), "PPP")}</TableCell>
                                  <TableCell>{format(request.endDate.toDate(), "PPP")}</TableCell>
                                  <TableCell>{request.numberOfDays ?? 0}</TableCell>
                                  <TableCell className="text-right">
                                    <LeaveStatusBadge status={request.status} />
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center">
                    <BookOpenCheck className="mr-2 h-6 w-6 text-primary" />
                    Attendance History
                  </CardTitle>
                  <CardDescription>
                    A log of all check-in and check-out events for this employee.
                  </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                    <div className="flex justify-center items-center h-40">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : attendanceLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10">No attendance logs found for this employee.</p>
                ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Check-In</TableHead>
                              <TableHead>Check-Out</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {attendanceLogs.map((record) => (
                              <TableRow key={record.id}>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell>{record.check_in || '-'}</TableCell>
                                  <TableCell>{record.check_out || '-'}</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
  );
}

export default function EmployeeProfilePage() {
    return (
        <AppLayout>
            <EmployeeProfileContent />
        </AppLayout>
    );
}

    