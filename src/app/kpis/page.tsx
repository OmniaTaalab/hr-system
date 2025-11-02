"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChartBig, AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

function KpisContent() {
    const { profile, loading } = useUserProfile();
    const router = useRouter();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';

    if (!canViewPage) {
        // Redirect if the user is not authorized
        router.replace('/');
        return (
             <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <BarChartBig className="mr-3 h-8 w-8 text-primary" />
                    Key Performance Indicators (KPIs)
                </h1>
                <p className="text-muted-foreground">
                    This is the page for Key Performance Indicators.
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>KPIs Overview</CardTitle>
                    <CardDescription>
                        Details about the company's KPIs will be displayed here.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>KPI content goes here.</p>
                </CardContent>
            </Card>
        </div>
    );
}


export default function KpisPage() {
    return (
        <AppLayout>
            <KpisContent />
        </AppLayout>
    );
}
