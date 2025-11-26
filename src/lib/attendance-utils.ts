

import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { eachDayOfInterval, startOfDay } from 'date-fns';

export interface AttendanceData {
    attendance: {
        userId: string;
        date: string;
        check_in: string;
    }[],
    leaves: {
        requestingEmployeeDocId: string;
        startDate: Timestamp;
        endDate: Timestamp;
    }[],
}

export function getAttendancePointValue(entry: any): number {
    if (!entry?.check_in) return 0;
  
    const timeString = entry.check_in.replace(/\s/g, '');
    const isPM = timeString.toLowerCase().includes('pm');
    const timeDigits = timeString.replace(/(am|pm)/i, '');
    const parts = timeDigits.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return 0;

    if (isPM && hours < 12) {
        hours += 12;
    } else if (!isPM && hours === 12) { // Handle 12 AM (midnight)
        hours = 0;
    }
  
    const checkInMinutes = hours * 60 + minutes;
    const targetMinutes = 7 * 60 + 30; // 7:30 AM
  
    if (checkInMinutes <= targetMinutes) return 1; // on time
    if (checkInMinutes > targetMinutes) return 0.5; // late
    
    return 0; 
}


export function getAttendanceScore(employee: { id: string, employeeId: string }, bulkData: AttendanceData, holidays: Date[], isExempt?: boolean): number {
    if (!employee?.employeeId) {
        return 0;
    }
    
    if (isExempt) {
        // This part can be enhanced if manual points are also passed in bulkData
        return 0;
    }

    const startDate = new Date("2025-09-01T00:00:00Z");
    const today = new Date();

    const employeeAttendance = bulkData.attendance.filter(log => log.userId === employee.employeeId);
    const employeeLeaves = bulkData.leaves.filter(leave => leave.requestingEmployeeDocId === employee.id);

    const attendanceLogsByDate = new Map();
    employeeAttendance.forEach(log => {
        if (!attendanceLogsByDate.has(log.date) || log.check_in < attendanceLogsByDate.get(log.date).check_in) {
            attendanceLogsByDate.set(log.date, { check_in: log.check_in });
        }
    });

    const approvedLeaveDates = new Set<string>();
    employeeLeaves.forEach(leave => {
        const start = leave.startDate.toDate();
        const end = leave.endDate.toDate();
        const interval = eachDayOfInterval({ start, end });
        interval.forEach(day => approvedLeaveDates.add(day.toISOString().split('T')[0]));
    });

    const officialHolidays = new Set(holidays.map(h => h.toISOString().split('T')[0]));

    let totalDays = 0;
    let totalPoints = 0;

    let currentDate = new Date(startDate);
    while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const day = currentDate.getDay(); // Sunday is 0, Saturday is 6
        
        const isWeekend = day === 5 || day === 6;
        const isHoliday = officialHolidays.has(dateStr);

        if (!isWeekend && !isHoliday) {
            totalDays++;
            if (approvedLeaveDates.has(dateStr)) {
                totalPoints += 1;
            } else if (attendanceLogsByDate.has(dateStr)) {
                totalPoints += getAttendancePointValue(attendanceLogsByDate.get(dateStr));
            } else {
                totalPoints += 0; // Absent
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (totalDays === 0) return 0;

    const percentage = (totalPoints / totalDays) * 100;
    const scoreOutOf10 = (percentage / 10);
    
    return scoreOutOf10;
}
