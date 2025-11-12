
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { eachDayOfInterval, startOfDay } from 'date-fns';

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


export async function getAttendanceScore(employeeDocId: string, companyEmployeeId: string) {
    if (!companyEmployeeId) {
        return { totalPoints: 0, totalDays: 0, percentage: 0, scoreOutOf10: 0 };
    }
    const startDate = new Date("2025-09-01T00:00:00Z");
    const today = new Date();

    const attendanceQuery = query(
        collection(db, "attendance_log"),
        where("userId", "==", companyEmployeeId),
        where("date", ">=", startDate.toISOString().split('T')[0])
    );
    
    const leaveQuery = query(
        collection(db, "leaveRequests"),
        where("requestingEmployeeDocId", "==", employeeDocId),
        where("status", "==", "Approved")
    );
    
    const [attendanceSnapshot, leaveSnapshot, holidaySnapshot] = await Promise.all([
        getDocs(attendanceQuery),
        getDocs(leaveQuery),
        getDocs(collection(db, "holidays"))
    ]);

    const attendanceLogsByDate = new Map();
    attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        // Find earliest check-in for the day
        if (!attendanceLogsByDate.has(data.date) || data.check_in < attendanceLogsByDate.get(data.date).check_in) {
            attendanceLogsByDate.set(data.date, { check_in: data.check_in });
        }
    });

    const approvedLeaveDates = new Set<string>();
    leaveSnapshot.forEach(doc => {
        const leave = doc.data();
        const start = leave.startDate.toDate();
        const end = leave.endDate.toDate();
        const interval = eachDayOfInterval({ start, end });
        interval.forEach(day => approvedLeaveDates.add(day.toISOString().split('T')[0]));
    });

    const officialHolidays = new Set(holidaySnapshot.docs.map(doc => doc.data().date.toDate().toISOString().split('T')[0]));

    let totalDays = 0;
    let totalPoints = 0;

    let currentDate = new Date(startDate);
    while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const day = currentDate.getDay(); // Sunday is 0, Saturday is 6
        
        const isWeekend = day === 5 || day === 6; // Assuming Friday/Saturday are weekends
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
    
    if (totalDays === 0) return { totalPoints: 0, totalDays: 0, percentage: 0, scoreOutOf10: 0 };

    const percentage = (totalPoints / totalDays) * 100;
    const scoreOutOf10 = (percentage / 10);
    
    return {
        totalPoints,
        totalDays,
        percentage,
        scoreOutOf10,
    };
}
