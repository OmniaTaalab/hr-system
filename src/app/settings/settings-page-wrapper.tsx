
"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUserProfile } from "@/components/layout/app-layout";

const settingsNavItems = [
  { titleEn: "General", titleAr: "عام", href: "/settings/general" },
  { titleEn: "Organization", titleAr: "الهيكل المؤسسي", href: "/settings/organization" },
  { titleEn: "Working Hours", titleAr: "ساعات العمل", href: "/settings/working-hours" },
  { titleEn: "Attendance", titleAr: "الحضور والانصراف", href: "/settings/attendance" },
  { titleEn: "Sync Data", titleAr: "مزامنة البيانات", href: "/settings/sync-data" },
];

const allowedRoles = [
  "admin",
  "hr",
  "human resource director",
  "human resource director international schools",
  "personnal director",
  "recruitment and onbording manager",
  "human resource executive",
  "recruitment and onboarding executive",
  "personnel executive",
];

export default function SettingsPageWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isRTL } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useUserProfile();

  const userRole = profile?.role?.trim().toLowerCase() ?? "";
  const canViewSettings = allowedRoles.includes(userRole);

  // Keep hooks outside conditional statements
  useEffect(() => {
    if (!loading && !canViewSettings) {
      router.replace("/");
    }
  }, [loading, canViewSettings, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!canViewSettings) {
    return (
      <div
        dir={isRTL ? "rtl" : "ltr"}
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <AlertTriangle className="h-12 w-12 text-destructive" />

        <h2 className="text-xl font-semibold">
          {isRTL ? "تم رفض الوصول" : "Access Denied"}
        </h2>

        <p className="text-muted-foreground">
          {isRTL
            ? "ليس لديك صلاحية لعرض هذه الصفحة."
            : "You do not have permission to view this page."}
        </p>
      </div>
    );
  }

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={cn(
        "flex w-full min-w-0 flex-col gap-6",
        "lg:flex-row lg:items-start lg:gap-8"
      )}
    >
      {/* Settings Sidebar */}
      <aside
        className={cn(
          "w-full min-w-0 shrink-0",
          "lg:w-56 xl:w-64",
          isRTL ? "text-right" : "text-left"
        )}
      >
        <nav
          aria-label={isRTL ? "إعدادات النظام" : "Settings navigation"}
          className={cn(
            "flex w-full gap-2",
            "overflow-x-auto pb-2",
            "lg:flex-col lg:overflow-visible lg:pb-0"
          )}
        >
          {settingsNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center",
                  "rounded-md px-4 py-2",
                  "text-sm font-medium",
                  "transition-colors",
                  "whitespace-nowrap",
                  "focus-visible:outline-none",
                  "focus-visible:ring-2",
                  "focus-visible:ring-ring",
                  "hover:bg-accent",
                  "hover:text-accent-foreground",
                  "lg:w-full",
                  isRTL
                    ? "justify-start text-right"
                    : "justify-start text-left",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-transparent"
                )}
              >
                <span className="block w-full">
                  {isRTL ? item.titleAr : item.titleEn}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Settings Content */}
      <main
        dir={isRTL ? "rtl" : "ltr"}
        className={cn(
          "w-full min-w-0 flex-1",
          "lg:max-w-4xl",
          isRTL ? "text-right" : "text-left"
        )}
      >
        {children}
      </main>
    </div>
  );
}
