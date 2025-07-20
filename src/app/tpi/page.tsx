
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Check } from "lucide-react";

// Data provided by the user for the dropdown
const stages = [
    { "id": 6, "title": "ES - Non-Core" },
    { "id": 10, "title": "HS - Non-Core" },
    { "id": 11, "title": "HS - Core" },
    { "id": 12, "title": "ER - Classroom Teacher" },
    { "id": 13, "title": "ER - Arabic" },
    { "id": 14, "title": "ER - Non-Core" },
    { "id": 15, "title": "PR - Classroom Teacher" },
    { "id": 16, "title": "PR - Arabic" },
    { "id": 17, "title": "PR - Non-Core" },
    { "id": 18, "title": "PR - Core" },
    { "id": 19, "title": "KS3 - Non-Core" },
    { "id": 20, "title": "KS3 - Core" },
    { "id": 21, "title": "IG - Non-Core" },
    { "id": 22, "title": "IG - Core" },
    { "id": 23, "title": "KG - Prinicpal" },
    { "id": 24, "title": "ES - Prinicpal" },
    { "id": 25, "title": "MS - Prinicpal" },
    { "id": 26, "title": "HS - Prinicpal" },
    { "id": 27, "title": "ER - Prinicpal" },
    { "id": 28, "title": "PR - Prinicpal" },
    { "id": 29, "title": "KS3 - Prinicpal" },
    { "id": 30, "title": "IG - Prinicpal" },
    { "id": 32, "title": "teest" },
    { "id": 33, "title": "teest" },
    { "id": 34, "title": "test" },
    { "id": 35, "title": "test6" },
    { "id": 36, "title": "test6" },
    { "id": 37, "title": "test6" }
];

export default function TpiPage() {
  const { toast } = useToast();
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedStageId) {
      setLeaderboardData([]);
      return;
    }

    const fetchApiData = async () => {
      setIsLoading(true);
      console.log("selectedStageId:", selectedStageId)
      try {
        const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Im9tbmlhIHpheWVkIiwiaWQiOjIyMjg0OSwicm9sZSI6InN1cGVyIGFkbWluIiwiZG9tYWluIjpudWxsLCJpYXQiOjE3NTI5OTc2MDh9.3AF6aXwvEUUXBORhufJSg6-abR23bvcqQd6u9CniC-c";
        const response = await fetch(`https://blb-staging-hwnidclrba-uc.a.run.app/reports/leaderBoard?stage_tag_ids=${selectedStageId}`, {
         method: 'GET',
          headers: {
            'Authorization': `${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        setLeaderboardData(Array.isArray(data) ? data : []);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error Loading Leaderboard",
          description: error.message || "Could not fetch data from the API.",
        });
        setLeaderboardData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchApiData();
  }, [selectedStageId, toast]);

  const displayData = useMemo(() => {
    if (!leaderboardData) return [];
    
    // API data is likely pre-sorted, but we sort by total just in case.
    const sortedData = [...leaderboardData].sort((a, b) => (b.total || 0) - (a.total || 0));
    const totalCount = sortedData.length;
    const top25Count = Math.ceil(totalCount * 0.25);
    
    return sortedData.map((item, index) => ({
      id: item.id || index, // Use item.id if available, otherwise index as fallback key
      firstName: item.first_name,
      lastName: item.last_name,
      role: item.role,
      groupName: item.group_name,
      system: item.system,
      campus: item.campus,
      examAvg: item.exam_avg,
      exitAvg: item.exit_avg,
      AA: item.aa,
      points: item.points,
      total: item.total,
      sheetName: item.sheet_name,
      globalRank: index + 1,
      top25: index < top25Count,
    }));
  }, [leaderboardData]);
  
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
             <Trophy className="mr-3 h-8 w-8 text-primary" />
            Teacher Performance Indicators (TPIs)
          </h1>
          <p className="text-muted-foreground">
            Select a stage to view its performance leaderboard.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Leaderboard Selection</CardTitle>
            <CardDescription>Select a stage to load the corresponding performance leaderboard from the API.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full md:w-1/3">
              <Select onValueChange={setSelectedStageId} value={selectedStageId}>
                <SelectTrigger id="stage-select">
                  <SelectValue placeholder="Select a stage..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      {stage.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Performance Leaderboard</CardTitle>
            <CardDescription>
              {selectedStageId ? `Displaying performance indicators for the selected stage.` : "Please select a stage to view data."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : (
            <ScrollArea className="w-full whitespace-nowrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>First Name</TableHead>
                    <TableHead>Last Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead className="text-right">Exam Avg</TableHead>
                    <TableHead className="text-right">Exit Avg</TableHead>
                    <TableHead className="text-right">AA</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Sheet Name</TableHead>
                    <TableHead className="text-center">Top 25%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.length > 0 ? displayData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">{item.globalRank}</TableCell>
                      <TableCell className="font-medium">{item.firstName}</TableCell>
                      <TableCell className="font-medium">{item.lastName}</TableCell>
                      <TableCell>
                        <Badge variant={item.role?.toLowerCase() === 'hod' ? 'default' : 'secondary'}>{item.role}</Badge>
                      </TableCell>
                      <TableCell>{item.groupName}</TableCell>
                      <TableCell>{item.system}</TableCell>
                      <TableCell>{item.campus}</TableCell>
                      <TableCell className="text-right">{item.examAvg?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell className="text-right">{item.exitAvg?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell className="text-right">{item.AA?.toFixed(3) ?? 'N/A'}</TableCell>
                      <TableCell className="text-right">{item.points ?? 'N/A'}</TableCell>
                      <TableCell className="text-right font-semibold">{item.total?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell>{item.sheetName ?? 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {item.top25 && <Check className="h-5 w-5 text-green-500 mx-auto" />}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={14} className="h-24 text-center">
                        {selectedStageId ? "No data returned for this stage." : "Please select a stage to view the leaderboard."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
