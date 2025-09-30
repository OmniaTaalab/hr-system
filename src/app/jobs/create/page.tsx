
"use client";

import React, { useActionState, useEffect, useRef } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createJobAction, type CreateJobState } from '@/app/actions/job-actions';
import { Loader2, PlusCircle, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { applicationFieldsConfig } from '@/components/job-application-dialog';
import { Separator } from '@/components/ui/separator';

const initialState: CreateJobState = {
  message: null,
  errors: {},
  success: false,
};

function CreateJobForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(createJobAction, initialState);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? "Success" : "Error",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
            if (state.success) {
                formRef.current?.reset();
                router.push('/jobs');
            }
        }
    }, [state, toast, router]);

    return (
        <form ref={formRef} action={formAction} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="title">Job Title</Label>
                    <Input id="title" name="title" placeholder="e.g., Senior Frontend Developer" required />
                    {state.errors?.title && <p className="text-sm text-destructive">{state.errors.title.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" name="department" placeholder="e.g., Engineering" required />
                    {state.errors?.department && <p className="text-sm text-destructive">{state.errors.department.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" name="location" placeholder="e.g., Remote or City, Country" required />
                {state.errors?.location && <p className="text-sm text-destructive">{state.errors.location.join(', ')}</p>}
            </div>
             <div className="space-y-2">
                <Label htmlFor="shortRequirements">Key Requirements</Label>
                <Textarea id="shortRequirements" name="shortRequirements" rows={4} placeholder="Enter one requirement per line." required />
                <p className="text-xs text-muted-foreground">Each line will be treated as a separate bullet point on the job board.</p>
                 {state.errors?.shortRequirements && <p className="text-sm text-destructive">{state.errors.shortRequirements.join(', ')}</p>}
            </div>
            
            <Separator />

            <div className="space-y-4">
                <Label className="text-base font-semibold">Application Form Fields</Label>
                <p className="text-sm text-muted-foreground">
                    Select the fields you want applicants to fill out for this job. Core fields (Resume, Job ID) are always included.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 rounded-lg border p-4">
                    {applicationFieldsConfig.map(field => (
                        <div key={field.id} className="flex items-center space-x-2">
                            <Checkbox id={`field-${field.id}`} name="applicationFields" value={field.id} defaultChecked={field.required} disabled={field.required} />
                            <Label htmlFor={`field-${field.id}`} className={cn(field.required && "text-muted-foreground")}>
                                {field.label}
                            </Label>
                        </div>
                    ))}
                </div>
                 {state.errors?.applicationFields && <p className="text-sm text-destructive">{state.errors.applicationFields.join(', ')}</p>}
            </div>

            {state.errors?.form && (
                 <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{state.errors.form.join(', ')}</span>
                </div>
            )}
            <div className="flex justify-end gap-4 pt-4 border-t">
                 <Button variant="outline" asChild>
                    <Link href="/jobs">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Create Job Opening
                </Button>
            </div>
        </form>
    );
}

function CreateJobContent() {
    const { profile, loading } = useUserProfile();
    const router = useRouter();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    const canCreateJobs = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';

    if (!canCreateJobs) {
        React.useEffect(() => {
            router.replace('/jobs');
        }, [router]);
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to create job openings.</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
                    Create New Job Opening
                </h1>
                <p className="text-muted-foreground">
                    Fill in the details below to post a new job to the public job board.
                </p>
            </header>
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Job Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <CreateJobForm />
                </CardContent>
            </Card>
        </div>
    );
}

export default function CreateJobPage() {
    return (
        <AppLayout>
            <CreateJobContent />
        </AppLayout>
    );
}
