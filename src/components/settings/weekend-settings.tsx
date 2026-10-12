
"use client";

import React, { useState, useEffect, useActionState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  updateWeekendSettingsAction,
  type WeekendSettingsState,
} from "@/app/actions/settings-actions";
import { Loader2, AlertCircle, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const initialWeekendState: WeekendSettingsState = { success: false, message: null, errors: {} };
const daysOfWeek = [
  { labelEn: 'Sunday', labelAr: 'الأحد', value: 0 },
  { labelEn: 'Monday', labelAr: 'الإثنين', value: 1 },
  { labelEn: 'Tuesday', labelAr: 'الثلاثاء', value: 2 },
  { labelEn: 'Wednesday', labelAr: 'الأربعاء', value: 3 },
  { labelEn: 'Thursday', labelAr: 'الخميس', value: 4 },
  { labelEn: 'Friday', labelAr: 'الجمعة', value: 5 },
  { labelEn: 'Saturday', labelAr: 'السبت', value: 6 },
];

interface WeekendSettingsProps {
    initialWeekendDays: number[];
}

export function WeekendSettings({ initialWeekendDays }: WeekendSettingsProps) {
    const { isRTL } = useI18n();
    const { toast } = useToast();
    const [weekendDays, setWeekendDays] = useState<number[]>(initialWeekendDays);
    const [updateWeekendState, updateWeekendAction, isUpdateWeekendPending] = useActionState(updateWeekendSettingsAction, initialWeekendState);
    const [_isPending, startTransition] = useTransition();

    useEffect(() => {
        if (updateWeekendState?.message) {
        toast({
            title: updateWeekendState.success ? (isRTL ? "نجاح" : "Success") : (isRTL ? "خطأ" : "Error"),
            description: updateWeekendState.message,
            variant: updateWeekendState.success ? "default" : "destructive",
        });
        }
    }, [updateWeekendState, toast, isRTL]);

    const handleWeekendDayChange = (dayValue: number, isChecked: boolean) => {
        setWeekendDays(prev => {
        const newSet = new Set(prev);
        if (isChecked) {
            newSet.add(dayValue);
        } else {
            newSet.delete(dayValue);
        }
        return Array.from(newSet);
        });
    };

    const handleSaveWeekend = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData();
        weekendDays.forEach(day => formData.append('weekend', day.toString()));
        startTransition(() => {
            updateWeekendAction(formData);
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{isRTL ? "إعدادات عطلة نهاية الأسبوع" : "Weekend Settings"}</CardTitle>
                <CardDescription>
                  {isRTL
                    ? "حدد أيام الأسبوع التي تُعتبر عطلة رسمية. سيتم استبعاد هذه الأيام من حسابات الإجازات."
                    : "Select the days of the week that are considered the weekend. These days will be excluded from leave calculations."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSaveWeekend}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                        {daysOfWeek.map(day => (
                            <div key={day.value} className="flex items-center space-x-2">
                            <Checkbox
                                id={`day-${day.value}`}
                                checked={weekendDays.includes(day.value)}
                                onCheckedChange={(isChecked) => {
                                handleWeekendDayChange(day.value, isChecked as boolean);
                                }}
                            />
                            <Label htmlFor={`day-${day.value}`} className={isRTL ? "mr-2 cursor-pointer" : "ml-2 cursor-pointer"}>
                              {isRTL ? day.labelAr : day.labelEn}
                            </Label>
                            </div>
                        ))}
                        </div>
                        {updateWeekendState?.errors?.form &&
                        <div className="flex items-center text-sm text-destructive">
                            <AlertCircle className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                            {updateWeekendState.errors.form[0]}
                        </div>
                        }
                        <Button type="submit" disabled={isUpdateWeekendPending}>
                        {isUpdateWeekendPending ? <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")}/> : <Save className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />}
                        {isRTL ? "حفظ إعدادات العطلة" : "Save Weekend"}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

