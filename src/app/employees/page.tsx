"use client"
import { AppLayout } from "@/components/layout/app-layout";
import EmployeeManagementContent from "./EmployeeManagementClient";
import React, { Suspense } from 'react';

export default function EmployeeManagementPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <EmployeeManagementContent />
      </Suspense>
    </AppLayout>
  );
}

    