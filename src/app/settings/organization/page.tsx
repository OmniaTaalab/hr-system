
"use client";

import { ListManager } from '@/components/settings/list-manager';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import SettingsPageWrapper from '../settings-page-wrapper';
import { Settings as SettingsIcon } from 'lucide-react';
import { useI18n } from "@/lib/i18n";

export default function OrganizationSettingsPage() {
  const { isRTL } = useI18n();

  const t = (en: string, ar: string) => isRTL ? ar : en;

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="w-full min-w-0 space-y-8"
    >
      <header className={isRTL ? "text-right" : "text-left"}>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 shrink-0 text-primary" />
          {t("Settings", "الإعدادات")}
        </h1>

        <p className="mt-2 text-muted-foreground">
          {t(
            "Manage company-wide settings for holidays, weekends, and organization structure.",
            "إدارة إعدادات المؤسسة الخاصة بالعطلات الرسمية والأسبوعية والهيكل التنظيمي."
          )}
        </p>
      </header>

      <SettingsPageWrapper>
        <div className="w-full min-w-0 space-y-6">
          <Card className="w-full min-w-0">
            <CardHeader
              className={isRTL ? "text-right" : "text-left"}
            >
              <CardTitle>
                {t("Organization Lists", "القوائم التنظيمية")}
              </CardTitle>

              <CardDescription>
                {t(
                  "Manage lists for roles, groups, and other organizational units used across the application.",
                  "إدارة قوائم الوظائف والمجموعات والوحدات التنظيمية المستخدمة في النظام."
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="min-w-0">
                <ListManager
                  title={t("Roles", "الوظائف")}
                  collectionName="roles"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Group Names", "أسماء المجموعات")}
                  collectionName="groupNames"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Stages", "المراحل")}
                  collectionName="stage"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Systems", "الأنظمة")}
                  collectionName="systems"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Campuses", "الفروع")}
                  collectionName="campuses"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Subjects", "المواد الدراسية")}
                  collectionName="subjects"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Leave Types", "أنواع الإجازات")}
                  collectionName="leaveTypes"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Report Line 1", "المسؤول المباشر الأول")}
                  collectionName="reportLines1"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Report Line 2", "المسؤول المباشر الثاني")}
                  collectionName="reportLines2"
                />
              </div>

              <div className="min-w-0">
                <ListManager
                  title={t("Position Class", "تصنيف الوظيفة")}
                  collectionName="positionClasses"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsPageWrapper>
    </div>
  );
}
