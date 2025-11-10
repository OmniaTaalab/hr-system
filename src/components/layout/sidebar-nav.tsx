"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Icons } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { iconMap } from "@/components/icon-map";
import { useUserProfile } from "./app-layout";
import { Skeleton } from "../ui/skeleton";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";

function formatI18nKey(key: string): string {
  if (!key) return "";
  // Converts "sidebar.employee_management" to "Employee Management"
  return key
    .split(".")[1]
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function SidebarNav() {
  const pathname = usePathname();
  const { profile, loading } = useUserProfile();
  const [isManager, setIsManager] = useState(false);

  // ✅ Check if the current user is actually a reportLine1 or reportLine2 for others
  useEffect(() => {
    const checkIfManager = async () => {
      if (!profile?.email) return;

      try {
        const empCol = collection(db, "employee");

        // Check if there are employees who report to this user
        const [r1Snap, r2Snap] = await Promise.all([
          getDocs(query(empCol, where("reportLine1", "==", profile.email))),
          getDocs(query(empCol, where("reportLine2", "==", profile.email))),
        ]);

        if (r1Snap.size > 0 || r2Snap.size > 0) {
          setIsManager(true);
        } else {
          setIsManager(false);
        }
      } catch (err) {
        console.error("Error checking manager role:", err);
        setIsManager(false);
      }
    };

    checkIfManager();
  }, [profile?.email]);

  const navItems = useMemo(() => {
    if (!profile) {
      // لو لسه البروفايل محمّلش
      return siteConfig.navItems.filter((item) => {
        const isProtected =
          item.href?.startsWith("/leave/all-requests") ||
          item.href?.startsWith("/settings") ||
          item.href?.startsWith("/career-advisor") ||
          item.href?.startsWith("/attendance") ||
          item.href?.startsWith("/payroll") ||
          item.href?.startsWith("/jobs/applications") ||
          item.href?.startsWith("/tpi") ||
          item.href?.startsWith("/system-logs") ||
          item.href?.startsWith("/omnia");
        return !isProtected;
      });
    }

    const userRole = profile.role?.toLowerCase();
    const isPrivilegedUser = userRole === "admin" || userRole === "hr" || isManager;

    return siteConfig.navItems.filter((item) => {
      if (item.href?.startsWith("/system-logs")) {
        return userRole === "hr";
      }

      // لو المستخدم HR أو Admin أو Manager حقيقي → يشوف كل حاجة
      if (isPrivilegedUser) {
        return true;
      }

      // الباقي بيتحجب
      const isProtected =
        item.href?.startsWith("/leave/all-requests") ||
        item.href?.startsWith("/settings") ||
        item.href?.startsWith("/career-advisor") ||
        item.href?.startsWith("/attendance") ||
        item.href?.startsWith("/payroll") ||
        item.href?.startsWith("/jobs/applications") ||
        item.href?.startsWith("/tpi") ||
        item.href?.startsWith("/omnia");

      return !isProtected;
    });
  }, [profile, isManager]);

  if (loading) {
    return (
      <nav className="grid items-start gap-2 p-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </nav>
    );
  }

  return (
    <nav className="grid items-start gap-2">
      <SidebarMenu>
        {navItems.map((item, index) => {
          const IconComponent = iconMap[item.iconName];
          const title = formatI18nKey(item.i18nKey);
          return (
            item.href && (
              <SidebarMenuItem key={index}>
                <Link href={item.disabled ? "/" : item.href}>
                  <SidebarMenuButton
                    variant="default"
                    size="default"
                    className={cn(
                      "w-full justify-start",
                      pathname === item.href
                        ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      item.disabled && "cursor-not-allowed opacity-80"
                    )}
                    isActive={pathname === item.href}
                    tooltip={title}
                  >
                    {IconComponent ? (
                      <IconComponent className="mr-2 h-4 w-4" />
                    ) : (
                      <span className="mr-2 h-4 w-4" />
                    )}
                    <span className="truncate">{title}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            )
          );
        })}
      </SidebarMenu>
    </nav>
  );
}

export function AppLogo() {
  return (
    <Link
      href="/"
      className="flex items-center space-x-2 px-2 py-4"
      aria-label={siteConfig.name}
    >
      <Icons.NisLogo className="h-8 w-8 text-sidebar-foreground" />
      <span className="font-headline text-lg font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
        {siteConfig.name}
      </span>
    </Link>
  );
}
