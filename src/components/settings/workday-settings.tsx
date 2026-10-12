
"use client";

import React, { useEffect, useActionState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  updateWorkdaySettingsAction,
  type WorkdaySettingsState,
} from "@/app/actions/settings-actions";
import { Loader2, AlertCircle, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const initialWorkdayState: WorkdaySettingsState = { success: false, message: null, errors: {} };

interface WorkdaySettingsProps {
    initialWorkdayHours: number;
}

export function WorkdaySettings({ initialWorkdayHours }: WorkdaySettingsProps) {
  const { isRTL } = useI18n();
  const { toast } = useToast();
  const [updateWorkdayState, updateWorkdayAction, isUpdateWorkdayPending] = useActionState(updateWorkdaySettingsAction, initialWorkdayState);
  
  useEffect(() => {
    if (updateWorkdayState?.message) {
      toast({
        title: updateWorkdayState.success ? (isRTL ? "نجاح" : "Success") : (isRTL ? "خطأ" : "Error"),
        description: updateWorkdayState.message,
        variant: updateWorkdayState.success ? "default" : "destructive",
      });
    }
  }, [updateWorkdayState, toast, isRTL]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isRTL ? "إعدادات ساعات يوم العمل" : "Workday Settings"}</CardTitle>
        <CardDescription>
          {isRTL
            ? "تحديد ساعات العمل القياسية في اليوم الواحد، والتي تؤثر على حسابات الحضور والإجازات."
            : "Define the standard number of working hours in a day. This affects various calculations."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateWorkdayAction}>
            <div className="space-y-4 max-w-sm">
                <div className="space-y-2">
                <Label htmlFor="workday-hours">
                  {isRTL ? "ساعات يوم العمل القياسي (بالساعات)" : "Standard Workday Duration (hours)"}
                </Label>
                <Input 
                    id="workday-hours" 
                    name="hours" 
                    type="number" 
                    defaultValue={initialWorkdayHours ?? 8}
                    step="0.5"
                    min="1"
                    max="24"
                    required 
                />
                {updateWorkdayState?.errors?.hours &&
                    <p className="text-sm text-destructive">{updateWorkdayState.errors.hours[0]}</p>
                }
                </div>
                {updateWorkdayState?.errors?.form &&
                <div className="flex items-center text-sm text-destructive">
                    <AlertCircle className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                    {updateWorkdayState.errors.form[0]}
                </div>
                }
                <Button type="submit" disabled={isUpdateWorkdayPending}>
                {isUpdateWorkdayPending ? <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")}/> : <Save className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />}
                {isRTL ? "حفظ ساعات يوم العمل" : "Save Workday Hours"}
                </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
}

