
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";


// --- New interfaces for Leaderboard API data ---
interface LeaderboardStageTag {
  id: number;
  title: string;
}

interface LeaderboardRecord {
  rank: number;
  campus_name: string;
  teacher_name: string;
  teacher_id: number;
  score: number;
}

const leaderboardStageTags: LeaderboardStageTag[] = [
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

function TpiManagementContent() {
    const { toast } = useToast();
    const { profile, loading } = useUserProfile();
    const router = useRouter();

    // --- State for Leaderboard feature ---
    const [selectedStageTagId, setSelectedStageTagId] = useState<string>("");
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardRecord[]>([]);
    const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState<string | null>(null);


    useEffect(() => {
        if (!loading) {
        const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';
        if (!canViewPage) {
            router.replace('/');
        }
        }
    }, [loading, profile, router]);
    
    // --- Effect to fetch leaderboard data ---
    useEffect(() => {
        if (!selectedStageTagId) {
            setLeaderboardData([]);
            return;
        }

        const fetchLeaderboard = async () => {
            setIsLoadingLeaderboard(true);
            setLeaderboardError(null);
            try {
                const apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Im9tbmlhIHRhYWxhYiIsImlkIjoyMjI3MTAsInJvbGUiOiJzdXBlciBhZG1pbiIsImRvbWFpbiI6bnVsbCwiaWF0IjoxNzU0NjQ4MzgzLCJleHAiOjE3NTQ3MzQ3ODN9.hX0o2w-JbCo_q3Qx36dCi5tOWV925sLg6gTupSMDkI8";
                const response = await fetch(`https://blb-staging-hwnidclrba-uc.a.run.app/reports/leaderBoard?stage_tag_ids=${selectedStageTagId}`, {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setLeaderboardData(data.data as LeaderboardRecord[]);
            } catch (error: any) {
                console.error("Error fetching leaderboard data:", error);
                setLeaderboardError(error.message || "Failed to fetch leaderboard data.");
                toast({ variant: 'destructive', title: 'API Error', description: 'Could not fetch leaderboard data.' });
            } finally {
                setIsLoadingLeaderboard(false);
            }
        };

        fetchLeaderboard();
    }, [selectedStageTagId, toast]);


    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!profile || (profile.role?.toLowerCase() !== 'admin' && profile.role?.toLowerCase() !== 'hr')) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to manage TPI data.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <Trophy className="mr-3 h-8 w-8 text-primary" />
                    TPI Management
                </h1>
                <p className="text-muted-foreground">
                    View leaderboard TPI data from the API.
                </p>
            </header>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Leaderboard Data</CardTitle>
                    <CardDescription>Select a stage tag to view the corresponding leaderboard from the API.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-full md:w-1/2 mb-4">
                        <Label htmlFor="leaderboard-select">Stage Tag</Label>
                        <Select onValueChange={setSelectedStageTagId} value={selectedStageTagId}>
                            <SelectTrigger id="leaderboard-select"><SelectValue placeholder="Select a stage..." /></SelectTrigger>
                            <SelectContent>
                                {leaderboardStageTags.map(tag => (
                                    <SelectItem key={tag.id} value={tag.id.toString()}>{tag.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {isLoadingLeaderboard ? (
                         <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : leaderboardError ? (
                        <div className="flex justify-center items-center h-40 text-destructive">
                            <AlertTriangle className="mr-2 h-5 w-5" />
                            <p>Error: {leaderboardError}</p>
                        </div>
                    ) : leaderboardData.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Rank</TableHead>
                                    <TableHead>Teacher Name</TableHead>
                                    <TableHead>Teacher ID</TableHead>
                                    <TableHead>Campus</TableHead>
                                    <TableHead>Score</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {leaderboardData.map((record) => (
                                    <TableRow key={`${record.teacher_id}-${record.rank}`}>
                                        <TableCell>{record.rank}</TableCell>
                                        <TableCell>{record.teacher_name}</TableCell>
                                        <TableCell>{record.teacher_id}</TableCell>
                                        <TableCell>{record.campus_name}</TableCell>
                                        <TableCell>{record.score}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                       selectedStageTagId && <p className="text-center text-muted-foreground py-4">No leaderboard data found for the selected stage.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function TpiPage() {
    return (
        <AppLayout>
            <TpiManagementContent />
        </AppLayout>
    );
}
