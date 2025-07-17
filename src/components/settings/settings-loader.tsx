
"use server";

import React from 'react';
import { 
  getWeekendSettings,
  getWorkdaySettings,
} from "@/app/actions/settings-actions";
import { HolidaySettings } from './holiday-settings';
import { WeekendSettings } from './weekend-settings';
import { WorkdaySettings } from './workday-settings';

export async function SettingsForms() {
  const [weekendDays, workdaySettings] = await Promise.all([
    getWeekendSettings(),
    getWorkdaySettings()
  ]);

  return (
    <div className="space-y-6">
        <WeekendSettings initialWeekendDays={weekendDays} />
        <WorkdaySettings initialWorkdayHours={workdaySettings.standardHours} />
        <HolidaySettings />
    </div>
  );
}
