
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

const initialWeekendState: WeekendSettingsState = { success: false, message: null, errors: {} };
const daysOfWeek = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
];

interface WeekendSettingsProps {
    initialWeekendDays: number[];
}

export function WeekendSettings({ initialWeekendDays }: WeekendSettingsProps) {
    const { toast } = useToast();
    const [weekendDays, setWeekendDays] = useState<number[]>(initialWeekendDays);
    const [updateWeekendState, updateWeekendAction, isUpdateWeekendPending] = useActionState(updateWeekendSettingsAction, initialWeekendState);
    const [_isPending, startTransition] = useTransition();

    useEffect(() => {
        if (updateWeekendState?.message) {
        toast({
            title: updateWeekendState.success ? "Success" : "Error",
            description: updateWeekendState.message,
            variant: updateWeekendState.success ? "default" : "destructive",
        });
        }
    }, [updateWeekendState, toast]);

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
                <CardTitle>Weekend Settings</CardTitle>
                <CardDescription>Select the days of the week that are considered the weekend. These days will be excluded from leave calculations.</CardDescription>
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
                            <Label htmlFor={`day-${day.value}`}>{day.label}</Label>
                            </div>
                        ))}
                        </div>
                        {updateWeekendState?.errors?.form &&
                        <div className="flex items-center text-sm text-destructive">
                            <AlertCircle className="mr-2 h-4 w-4" />
                            {updateWeekendState.errors.form[0]}
                        </div>
                        }
                        <Button type="submit" disabled={isUpdateWeekendPending}>
                        {isUpdateWeekendPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                        Save Weekend
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

