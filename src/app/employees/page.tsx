
"use client"
import { AppLayout } from "@/components/layout/app-layout";
import EmployeeManagementContent from "./EmployeeManagementClient";

export default function EmployeeManagementPage() {
  return (
    <AppLayout>
      <EmployeeManagementContent />
    </AppLayout>
  );
}
