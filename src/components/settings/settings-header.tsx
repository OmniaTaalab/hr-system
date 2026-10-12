
"use client";

import { useI18n } from "@/lib/i18n";
import { Settings as SettingsIcon } from "lucide-react";

export function SettingsHeader() {
  const { isRTL } = useI18n();

  return (
    <header
      dir={isRTL ? "rtl" : "ltr"}
      className={isRTL ? "text-right" : "text-left"}
    >
      <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center gap-2">
        <SettingsIcon className="h-8 w-8 text-primary" />
        {isRTL ? "الإعدادات" : "Settings"}
      </h1>

      <p className="mt-1 text-muted-foreground">
        {isRTL
          ? "إدارة إعدادات المؤسسة الخاصة بالعطلات الرسمية والأسبوعية والهيكل التنظيمي."
          : "Manage company-wide settings for holidays, weekends, and organization structure."}
      </p>
    </header>
  );
}
