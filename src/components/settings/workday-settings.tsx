
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

const initialWorkdayState: WorkdaySettingsState = { success: false, message: null, errors: {} };

interface WorkdaySettingsProps {
    initialWorkdayHours: number;
}

export function WorkdaySettings({ initialWorkdayHours }: WorkdaySettingsProps) {
  const { toast } = useToast();
  const [updateWorkdayState, updateWorkdayAction, isUpdateWorkdayPending] = useActionState(updateWorkdaySettingsAction, initialWorkdayState);
  
  useEffect(() => {
    if (updateWorkdayState?.message) {
      toast({
        title: updateWorkdayState.success ? "Success" : "Error",
        description: updateWorkdayState.message,
        variant: updateWorkdayState.success ? "default" : "destructive",
      });
    }
  }, [updateWorkdayState, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workday Settings</CardTitle>
        <CardDescription>Define the standard number of working hours in a day. This affects various calculations.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateWorkdayAction}>
            <div className="space-y-4 max-w-sm">
                <div className="space-y-2">
                <Label htmlFor="workday-hours">Standard Workday Duration (hours)</Label>
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
                    <AlertCircle className="mr-2 h-4 w-4" />
                    {updateWorkdayState.errors.form[0]}
                </div>
                }
                <Button type="submit" disabled={isUpdateWorkdayPending}>
                {isUpdateWorkdayPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                Save Workday Hours
                </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
}

