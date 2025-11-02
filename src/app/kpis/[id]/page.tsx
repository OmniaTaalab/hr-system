
"use client";

import React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { BarChartBig } from "lucide-react";

export default function KpiDashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <BarChartBig className="mr-3 h-8 w-8 text-primary" />
            KPI's Dashboard
          </h1>
          <p className="text-muted-foreground">
            This is the KPI dashboard for the selected employee.
          </p>
        </header>
        {/* Add your KPI dashboard components here */}
      </div>
    </AppLayout>
  );
}
