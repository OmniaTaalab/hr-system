
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from 'next/navigation';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCircle, Briefcase, MapPin, DollarSign, CalendarDays, Phone, Mail, FileText, User, Hash, Cake, Stethoscope, BookOpen, Star } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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


export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { profile, loading: profileLoading } = useUserProfile();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const canView = !profileLoading && profile;

  if (loading || profileLoading) {
    return (
      <AppLayout>
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
        </div>
      </AppLayout>
    );
  }

   if (!canView) {
    return (
        <AppLayout>
            <div className="text-center">You do not have permission to view this page.</div>
        </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
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
                 <DetailItem icon={MapPin} label="Campus" value={employee.campus} />
                 <DetailItem icon={BookOpen} label="Stage" value={employee.stage} />
                 <DetailItem icon={Star} label="Religion" value={employee.religion} />
                 <DetailItem icon={Stethoscope} label="Subject" value={employee.subject} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

