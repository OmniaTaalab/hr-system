
"use client"
import { AppLayout } from "@/components/layout/app-layout";
import EmployeeManagementContent from "./EmployeeManagementClient";
import React from 'react';

export default function EmployeeManagementPage() {
  return (
    <AppLayout>
      <React.Suspense fallback={<div>Loading...</div>}>
        <EmployeeManagementContent />
      </React.Suspense>
    </AppLayout>
  );
}
