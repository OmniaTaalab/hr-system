
"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Employee {
  id: string;
  name: string;
}

function KpiCard({ title }: { title: string }) {
    const data = [
        { date: "12 Dec 2023", points: "5 points" },
        { date: "12 Dec 2023", points: "5 points" },
        { date: "12 Dec 2023", points: "5 points" },
        { date: "12 Dec 2023", points: "5 points" },
        { date: "12 Dec 2023", points: "5 points" },
    ];
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{title}</CardTitle>
                <Button size="icon">
                    <Plus className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Point</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>{item.date}</TableCell>
                                <TableCell>{item.points}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            <CardFooter className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Showing 1-5 from 100</span>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-primary text-primary-foreground">1</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8">2</Button>
                    <span>...</span>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <KpiCard title="ELEOT(10%)" />
            <KpiCard title="TOT(10%)" />
        </div>
      </div>
    </AppLayout>
  );
}
