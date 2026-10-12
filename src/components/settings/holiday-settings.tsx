"use client";

import React, { useState, useEffect, useActionState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { addHolidayAction, deleteHolidayAction, type HolidayState } from "@/app/actions/settings-actions";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { format, getYear } from "date-fns";
import { Calendar as CalendarIcon, PlusCircle, Trash2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/components/layout/app-layout";
import { useI18n } from "@/lib/i18n";

interface Holiday {
  id: string;
  name: string;
  date: Timestamp;
}

const initialHolidayState: HolidayState = { success: false, message: null, errors: {} };
const currentYear = getYear(new Date());
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const translations = {
  en: {
    heading: "Manage Official Holidays",
    description: "Add or remove official holidays for the company.",
    year: "Year:",
    selectYear: "Select Year",
    newHoliday: "Add New Holiday",
    name: "Holiday Name",
    namePlaceholder: "e.g., New Year's Day",
    date: "Date",
    pickDate: "Pick a date",
    addHoliday: "Add Holiday",
    holidaysFor: (year: number) => `Holidays for ${year}`,
    empty: (year: number) => `No holidays added for ${year}.`,
    action: "Action",
    deleteHoliday: "Delete holiday",
    error: "Error",
    success: "Success",
    loadingError: "Could not load holidays.",
    validationError: "Validation Error",
    dateRequired: "Please select a date for the holiday.",
  },
  ar: {
    heading: "إدارة العطلات الرسمية",
    description: "إضافة أو حذف العطلات الرسمية للشركة.",
    year: "السنة:",
    selectYear: "اختر السنة",
    newHoliday: "إضافة عطلة رسمية جديدة",
    name: "اسم العطلة",
    namePlaceholder: "مثال: عيد العمال",
    date: "التاريخ",
    pickDate: "اختر التاريخ",
    addHoliday: "إضافة العطلة",
    holidaysFor: (year: number) => `العطلات الرسمية لعام ${year}`,
    empty: (year: number) => `لا توجد عطلات رسمية مضافة لعام ${year}.`,
    action: "الإجراءات",
    deleteHoliday: "حذف العطلة",
    error: "خطأ",
    success: "تم بنجاح",
    loadingError: "تعذّر تحميل العطلات الرسمية.",
    validationError: "خطأ في البيانات",
    dateRequired: "يرجى اختيار تاريخ العطلة.",
  },
};

export function HolidaySettings() {
  const { isRTL } = useI18n();
  const t = isRTL ? translations.ar : translations.en;
  const { toast } = useToast();
  const { profile, user } = useUserProfile();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [addHolidayForm, setAddHolidayForm] = useState<{ name: string; date?: Date }>({ name: "" });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [addState, addAction, isAddPending] = useActionState(addHolidayAction, initialHolidayState);
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteHolidayAction, initialHolidayState);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setIsLoadingHolidays(true);
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59));

    const q = query(
      collection(db, "holidays"),
      where("date", ">=", Timestamp.fromDate(startOfYear)),
      where("date", "<=", Timestamp.fromDate(endOfYear)),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setHolidays(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Holiday)));
        setIsLoadingHolidays(false);
      },
      (error) => {
        console.error("Error fetching holidays:", error);
        toast({ variant: "destructive", title: t.error, description: t.loadingError });
        setIsLoadingHolidays(false);
      }
    );

    return () => unsubscribe();
    // Subscription should depend on year, not on translated display labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, toast]);

  useEffect(() => {
    if (addState?.message) {
      toast({
        title: addState.success ? t.success : t.error,
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) setAddHolidayForm({ name: "", date: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addState, toast]);

  useEffect(() => {
    if (deleteState?.message) {
      toast({
        title: deleteState.success ? t.success : t.error,
        description: deleteState.message,
        variant: deleteState.success ? "default" : "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState, toast]);

  const handleAddHoliday = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addHolidayForm.date) {
      toast({ variant: "destructive", title: t.validationError, description: t.dateRequired });
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.append("date", addHolidayForm.date.toISOString());
    const actorId = profile?.id || user?.uid;
    const actorEmail = profile?.workEmail || user?.email;
    const actorRole = profile?.role;
    if (actorId) formData.append("actorId", actorId);
    if (actorEmail) formData.append("actorEmail", actorEmail);
    if (actorRole) formData.append("actorRole", actorRole);
    startTransition(() => addAction(formData));
  };

  return (
    <Card dir={isRTL ? "rtl" : "ltr"} className="w-full min-w-0">
      <CardHeader className={isRTL ? "text-right" : "text-left"}>
        <CardTitle>{t.heading}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Label htmlFor="year-select" className="text-base">{t.year}</Label>
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value, 10))}>
            <SelectTrigger id="year-select" className="w-[180px]" dir={isRTL ? "rtl" : "ltr"}>
              <SelectValue placeholder={t.selectYear} />
            </SelectTrigger>
            <SelectContent dir={isRTL ? "rtl" : "ltr"}>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleAddHoliday} className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <h3 className={cn("font-medium", isRTL ? "text-right" : "text-left")}>{t.newHoliday}</h3>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="holiday-name" className="block text-start">{t.name}</Label>
              <Input
                id="holiday-name"
                name="name"
                value={addHolidayForm.name}
                onChange={(e) => setAddHolidayForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t.namePlaceholder}
                className={isRTL ? "text-right" : "text-left"}
                required
              />
              {addState?.errors?.name && (
                <p className="mt-1 text-xs text-destructive">{addState.errors.name[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="block text-start">{t.date}</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn("w-full justify-start gap-2 font-normal", !addHolidayForm.date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    {addHolidayForm.date ? (
                      <span dir="ltr">{format(addHolidayForm.date, "MM/dd/yyyy")}</span>
                    ) : (
                      <span>{t.pickDate}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" dir={isRTL ? "rtl" : "ltr"}>
                  <Calendar
                    mode="single"
                    selected={addHolidayForm.date}
                    onSelect={(date) => {
                      setAddHolidayForm((prev) => ({ ...prev, date }));
                      setIsCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {addState?.errors?.date && (
                <p className="mt-1 text-xs text-destructive">{addState.errors.date[0]}</p>
              )}
            </div>
          </div>

          {addState?.errors?.form && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {addState.errors.form[0]}
            </div>
          )}
          <Button type="submit" disabled={isAddPending} className="gap-2">
            {isAddPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {t.addHoliday}
          </Button>
        </form>

        <div className="space-y-2">
          <h3 className={cn("font-medium", isRTL ? "text-right" : "text-left")}>{t.holidaysFor(selectedYear)}</h3>
          {isLoadingHolidays ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : holidays.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table dir={isRTL ? "rtl" : "ltr"}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">{t.date}</TableHead>
                    <TableHead className="text-start">{t.name}</TableHead>
                    <TableHead className="text-end">{t.action}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="text-start">
                        <span dir="ltr" className="inline-block">{format(holiday.date.toDate(), "MM/dd/yyyy")}</span>
                      </TableCell>
                      <TableCell className="text-start font-medium">{holiday.name}</TableCell>
                      <TableCell className="text-end">
                        <form action={deleteAction} className="flex justify-end">
                          <input type="hidden" name="holidayId" value={holiday.id} />
                          {(profile?.id || user?.uid) && (
                            <input type="hidden" name="actorId" value={profile?.id || user?.uid || ""} />
                          )}
                          {(profile?.workEmail || user?.email) && (
                            <input type="hidden" name="actorEmail" value={profile?.workEmail || user?.email || ""} />
                          )}
                          {profile?.role && <input type="hidden" name="actorRole" value={profile.role} />}
                          <Button type="submit" variant="ghost" size="icon" disabled={isDeletePending} aria-label={t.deleteHoliday} title={t.deleteHoliday}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed py-10 text-center text-muted-foreground">
              {t.empty(selectedYear)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
