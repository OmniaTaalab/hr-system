
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreateApplicationPage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Create Application
          </h1>
          <p className="text-muted-foreground">
            This is a new screen to create an application.
          </p>
        </header>
        <Card>
            <CardHeader>
                <CardTitle>Application Form</CardTitle>
                <CardDescription>Fill out the form below.</CardDescription>
            </CardHeader>
        </Card>
      </div>
    </AppLayout>
  );
}
