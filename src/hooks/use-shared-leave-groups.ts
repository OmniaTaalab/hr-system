"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useToast } from "./use-toast";
import type { SharedLeaveGroup } from "@/types/leave-policy";

export function useSharedLeaveGroups(): {
  sharedGroups: SharedLeaveGroup[];
  isLoading: boolean;
} {
  const { toast } = useToast();
  const [sharedGroups, setSharedGroups] = useState<SharedLeaveGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "sharedLeaveGroups"), orderBy("name"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const raw = doc.data();
          return {
            id: doc.id,
            name: raw.name || "",
            allowanceAmount:
              typeof raw.allowanceAmount === "number" ? raw.allowanceAmount : 0,
            unit: raw.unit === "days" ? "days" : "hours",
            resetPeriod:
              raw.resetPeriod === "academic_term" || raw.resetPeriod === "yearly"
                ? raw.resetPeriod
                : "monthly",
            leaveTypeIds: Array.isArray(raw.leaveTypeIds) ? raw.leaveTypeIds : [],
            leaveTypeNames: Array.isArray(raw.leaveTypeNames)
              ? raw.leaveTypeNames
              : [],
            roleAllowances: Array.isArray(raw.roleAllowances)
              ? raw.roleAllowances
              : [],
          } as SharedLeaveGroup;
        });
        setSharedGroups(data);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching shared leave groups:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load shared leave balance groups.",
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [toast]);

  return { sharedGroups, isLoading };
}
