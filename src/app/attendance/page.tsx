import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";

interface AttendanceRecord {
  id: string;
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut: string;
  status: "Present" | "Absent" | "On Leave";
}

const mockAttendanceData: AttendanceRecord[] = [
  { id: "1", employeeName: "Alice Wonderland", date: "2024-07-28", clockIn: "09:00 AM", clockOut: "05:30 PM", status: "Present" },
  { id: "2", employeeName: "Bob The Builder", date: "2024-07-28", clockIn: "09:15 AM", clockOut: "05:45 PM", status: "Present" },
  { id: "3", employeeName: "Charlie Brown", date: "2024-07-28", clockIn: "-", clockOut: "-", status: "Absent" },
  { id: "4", employeeName: "Diana Prince", date: "2024-07-28", clockIn: "-", clockOut: "-", status: "On Leave" },
  { id: "5", employeeName: "Edward Scissorhands", date: "2024-07-27", clockIn: "08:55 AM", clockOut: "05:25 PM", status: "Present" },
  { id: "6", employeeName: "Fiona Gallagher", date: "2024-07-27", clockIn: "09:05 AM", clockOut: "05:35 PM", status: "Present" },
];

function AttendanceStatusBadge({ status }: { status: AttendanceRecord["status"] }) {
  switch (status) {
    case "Present":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><CheckCircle className="mr-1 h-3 w-3" />Present</Badge>;
    case "Absent":
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Absent</Badge>;
    case "On Leave":
      return <Badge variant="outline" className="border-blue-500 text-blue-500"><Clock className="mr-1 h-3 w-3" />On Leave</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function AttendancePage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Attendance Records
          </h1>
          <p className="text-muted-foreground">
            View daily and historical attendance data for all employees.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Today's Attendance Summary</CardTitle>
            <CardDescription>A quick overview of employee attendance for the current day.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockAttendanceData.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.employeeName}</TableCell>
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{record.clockIn}</TableCell>
                    <TableCell>{record.clockOut}</TableCell>
                    <TableCell className="text-right">
                      <AttendanceStatusBadge status={record.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
