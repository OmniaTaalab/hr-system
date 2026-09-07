"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitRequestForm } from "@/components/document-requests/submit-request-form";
import { MyRequestsView } from "@/components/document-requests/my-requests-view";
import { HrRequestsQueue } from "@/components/document-requests/hr-requests-queue";
import { FileText, PlusCircle, History, ListFilter, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

function DocumentRequestsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, user } = useUserProfile();

  const userRole = profile?.role?.toLowerCase();
  const isPrivilegedUser = userRole === "admin" || userRole === "hr" || userRole === "director";

  const paramTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(
    paramTab || (isPrivilegedUser ? "queue" : "submit")
  );

  const [pendingCount, setPendingCount] = useState<number>(0);

  // Sync tab with URL if param changes
  useEffect(() => {
    if (paramTab && (paramTab === "submit" || paramTab === "my-requests" || (paramTab === "queue" && isPrivilegedUser))) {
      setActiveTab(paramTab);
    }
  }, [paramTab, isPrivilegedUser]);

  // Real-time pending count for HR
  useEffect(() => {
    if (!isPrivilegedUser) return;

    const q = query(
      collection(db, "documentRequests"),
      where("status", "in", ["Submitted", "Under HR Review"])
    );

    const unsub = onSnapshot(q, (snap) => {
      setPendingCount(snap.size);
    });

    return () => unsub();
  }, [isPrivilegedUser]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    router.replace(`/document-requests?tab=${newTab}`);
  };

  return (
    <div className="container mx-auto py-6 max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Document Requests
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Request official employment certificates, salary slips, bank & embassy letters with complete status tracking.
              </p>
            </div>
          </div>
        </div>

        {isPrivilegedUser && (
          <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 py-1 px-3 bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-300 border-purple-300">
            <Shield className="h-3.5 w-3.5 text-purple-600" />
            HR Management Mode
          </Badge>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-2 sm:grid-cols-3 h-11 p-1 bg-muted/60">
          <TabsTrigger value="submit" className="gap-1.5 text-xs sm:text-sm font-medium">
            <PlusCircle className="h-4 w-4" />
            New Request
          </TabsTrigger>
          <TabsTrigger value="my-requests" className="gap-1.5 text-xs sm:text-sm font-medium">
            <History className="h-4 w-4" />
            My Requests
          </TabsTrigger>
          {isPrivilegedUser && (
            <TabsTrigger value="queue" className="gap-1.5 text-xs sm:text-sm font-medium">
              <ListFilter className="h-4 w-4" />
              HR Queue
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] font-bold">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="submit" className="focus-visible:outline-none">
          <SubmitRequestForm onSuccess={() => handleTabChange("my-requests")} />
        </TabsContent>

        <TabsContent value="my-requests" className="focus-visible:outline-none">
          <MyRequestsView />
        </TabsContent>

        {isPrivilegedUser && (
          <TabsContent value="queue" className="focus-visible:outline-none">
            <HrRequestsQueue />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function DocumentRequestsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading Document Requests...</div>}>
        <DocumentRequestsContent />
      </Suspense>
    </AppLayout>
  );
}
