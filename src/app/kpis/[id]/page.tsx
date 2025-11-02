
"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle } from "lucide-react";
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";

interface Employee {
  id: string;
  name: string;
}

export default function KpiDashboardPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeId) {
      setError("No employee ID provided.");
      setLoading(false);
      return;
    }

    const fetchEmployee = async () => {
      try {
        const docRef = doc(db, 'employee', employeeId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setEmployee({ id: docSnap.id, ...docSnap.data() } as Employee);
        } else {
          setError('Employee not found.');
        }
      } catch (e) {
        console.error("Error fetching employee:", e);
        setError("Failed to load employee details.");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          {loading ? (
            <div className="space-y-2">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-5 w-3/4" />
            </div>
          ) : error ? (
             <div className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-6 w-6"/>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
                    {error}
                </h1>
            </div>
          ) : (
            <>
              <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                <BarChartBig className="mr-3 h-8 w-8 text-primary" />
                KPI's Dashboard for {employee?.name}
              </h1>
              <p className="text-muted-foreground">
                This is the KPI dashboard for {employee?.name}.
              </p>
            </>
          )}
        </header>
        {/* Add your KPI dashboard components here */}
      </div>
    </AppLayout>
  );
}
