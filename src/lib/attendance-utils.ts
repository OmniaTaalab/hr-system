export function getAttendancePointValue(entry: any): number {
    if (!entry?.check_in) return 0;
  
    const [hour, minute, period] = entry.check_in.replace(" ", ":").split(":");
    const h = parseInt(hour);
    const m = parseInt(minute);
    const isPM = period?.toLowerCase().includes("pm");
    const checkIn24 = isPM && h !== 12 ? h + 12 : h === 12 && !isPM ? 0 : h;
  
    if (checkIn24 < 7 || (checkIn24 === 7 && m <= 30)) return 1; // on time
    if (checkIn24 === 7 && m > 30) return 0.5; // late
    return 0; // absent or missing
  }