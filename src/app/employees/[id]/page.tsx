
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from 'next/navigation';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCircle, Briefcase, MapPin, DollarSign, CalendarDays, Phone, Mail, FileText, User, Hash, Cake, Stethoscope, BookOpen, Star, LogIn, LogOut, BookOpenCheck, Users, Code } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  photoURL?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;
  gender?: string;
  nationalId?: string;
  religion?: string;
  stage?: string;
  subject?: string;
  title?: string;
}

interface AttendanceLog {
  id: string;
  employee_id: string;
  name: string;
  check_time: string;
  type: string;
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | undefined | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center text-sm">
      <Icon className="h-4 w-4 mr-3 text-muted-foreground" />
      <span className="font-medium text-muted-foreground mr-2">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function EmployeeProfileContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { profile, loading: profileLoading } = useUserProfile();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (id) {
      const fetchEmployee = async () => {
        setLoading(true);
        setError(null);
        try {
          const docRef = doc(db, 'employee', id);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setEmployee({ id: docSnap.id, ...docSnap.data() } as Employee);
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
      fetchEmployee();
    }
  }, [id]);

  useEffect(() => {
    if (employee?.employeeId) {
      const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
          const logsQuery = query(
            collection(db, 'attendance_log'),
            where('employee_id', '==', employee.employeeId),
            orderBy('check_time', 'desc')
          );
          const querySnapshot = await getDocs(logsQuery);
          const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
          setAttendanceLogs(logs);
        } catch (e) {
          console.error("Error fetching attendance logs:", e);
          // Optional: Show a toast or error message for logs
        } finally {
          setLoadingLogs(false);
        }
      };
      fetchLogs();
    }
  }, [employee]);

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };
  
  const canView = !profileLoading && profile;

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
                  </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={User} label="Title" value={employee.title} />
                   <DetailItem icon={UserCircle} label="Gender" value={employee.gender} />
                   <DetailItem icon={Briefcase} label="Department" value={employee.department} />
                   <DetailItem icon={Hash} label="Employee ID" value={employee.employeeId} />
                   <DetailItem icon={Mail} label="Email" value={employee.email} />
                   <DetailItem icon={Phone} label="Contact Number" value={employee.phone} />
                   <DetailItem icon={FileText} label="National ID" value={employee.nationalId} />
                   <DetailItem icon={Cake} label="Birthday" value={employee.dateOfBirth ? format(employee.dateOfBirth.toDate(), 'PPP') : undefined} />
                   <DetailItem icon={CalendarDays} label="Joining Date" value={employee.joiningDate ? format(employee.joiningDate.toDate(), 'PPP') : undefined} />
                   <DetailItem icon={Users} label="Group" value={employee.groupName} />
                   <DetailItem icon={Code} label="System" value={employee.system} />
                   <DetailItem icon={MapPin} label="Campus" value={employee.campus} />
                   <DetailItem icon={BookOpen} label="Stage" value={employee.stage} />
                   <DetailItem icon={Star} label="Religion" value={employee.religion} />
                   <DetailItem icon={Stethoscope} label="Subject" value={employee.subject} />
                </div>
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
                              <TableHead>Timestamp</TableHead>
                              <TableHead className="text-right">Event Type</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {attendanceLogs.map((record) => (
                              <TableRow key={record.id}>
                                  <TableCell>{record.check_time}</TableCell>
                                  <TableCell className="text-right">
                                    {record.type === 'I' ? (
                                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        <LogIn className="mr-1 h-3 w-3"/>
                                        Check-In
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">
                                        <LogOut className="mr-1 h-3 w-3"/>
                                        Check-Out
                                      </Badge>
                                    )}
                                  </TableCell>
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

    
