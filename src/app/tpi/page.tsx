
"use client";

import React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Trophy } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface TpiData {
  id: number;
  firstName: string;
  lastName: string;
  role: "hod" | "teacher";
  groupName: string;
  system: string;
  campus: string;
  examAvg: number;
  exitAvg: number;
  flippedAA: number;
  AA: number;
  points: number;
  total: number;
  sheetName: string;
  globalRank: number;
  top25: boolean;
}

const mockTpiData: TpiData[] = [
  {
    id: 1,
    firstName: "Mohamed",
    lastName: "ElSayed Hussien AbdelHamid",
    role: "hod",
    groupName: "IG - Non-Core",
    system: "British School",
    campus: "Sherouk",
    examAvg: 74.87,
    exitAvg: 0,
    flippedAA: 0,
    AA: 59.896,
    points: 6375,
    total: 6974,
    sheetName: "1 IG - Non-Core",
    globalRank: 1,
    top25: true,
  },
  {
    id: 2,
    firstName: "Malak",
    lastName: "Sherif Ibrahim",
    role: "teacher",
    groupName: "ER - Classroom Teach",
    system: "British School",
    campus: "Sherouk",
    examAvg: 0,
    exitAvg: 0,
    flippedAA: 0,
    AA: 0,
    points: 6330,
    total: 6330,
    sheetName: "1 ER - Classroom Teach",
    globalRank: 2,
    top25: true,
  },
  {
    id: 3,
    firstName: "Noura",
    lastName: "Mohamed Abdelaziz Abdelhady",
    role: "teacher",
    groupName: "MS - Core",
    system: "American School",
    campus: "Sherouk",
    examAvg: 63.46,
    exitAvg: 78.2,
    flippedAA: 80.85,
    AA: 66.673,
    points: 5515,
    total: 6182,
    sheetName: "1 MS - Core",
    globalRank: 3,
    top25: true,
  },
];


export default function TpiPage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
             <Trophy className="mr-3 h-8 w-8 text-primary" />
            Teacher Performance Indicators (TPIs)
          </h1>
          <p className="text-muted-foreground">
            A detailed view of performance metrics for teachers.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Performance Data</CardTitle>
            <CardDescription>
              Displaying performance indicators from the latest report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full whitespace-nowrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>First Name</TableHead>
                    <TableHead>Last Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead className="text-right">Exam Avg</TableHead>
                    <TableHead className="text-right">Exit Avg</TableHead>
                    <TableHead className="text-right">Flipped AA</TableHead>
                    <TableHead className="text-right">AA</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Sheet Name</TableHead>
                    <TableHead className="text-right">Global Rank</TableHead>
                    <TableHead className="text-center">Top 25%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTpiData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.firstName}</TableCell>
                      <TableCell>{item.lastName}</TableCell>
                      <TableCell>
                        <Badge variant={item.role === 'hod' ? 'default' : 'secondary'}>{item.role}</Badge>
                      </TableCell>
                      <TableCell>{item.groupName}</TableCell>
                      <TableCell>{item.system}</TableCell>
                      <TableCell>{item.campus}</TableCell>
                      <TableCell className="text-right">{item.examAvg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.exitAvg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.flippedAA.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.AA.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{item.points}</TableCell>
                      <TableCell className="text-right">{item.total}</TableCell>
                      <TableCell>{item.sheetName}</TableCell>
                      <TableCell className="text-right">{item.globalRank}</TableCell>
                      <TableCell className="text-center">
                        {item.top25 && <Check className="h-5 w-5 text-green-500 mx-auto" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
