

"use client";

import React, { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createJobAction, type CreateJobState, manageApplicationTemplateAction, type ManageTemplateState } from '@/app/actions/job-actions';
import { Loader2, PlusCircle, AlertTriangle, Save, Trash2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { applicationFieldsConfig } from '@/components/job-application-dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const initialCreateState: CreateJobState = {
  message: null,
  errors: {},
  success: false,
};

const initialTemplateState: ManageTemplateState = {
    message: null,
    errors: {},
    success: false,
};

interface Template {
    id: string;
    name: string;
    fields: string[];
}

function CreateJobForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(createJobAction, initialCreateState);
    const formRef = useRef<HTMLFormElement>(null);
    const { profile } = useUserProfile();
    
    // State for templates
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<string>("none");
    const [templateName, setTemplateName] = useState("");
    const [templateState, templateAction, isTemplateActionPending] = useActionState(manageApplicationTemplateAction, initialTemplateState);
    const [_isPending, startTransition] = useTransition();

    const defaultFields = [
        'nameEn',
        'nameAr',
        'dateOfBirth',
        'placeOfBirth',
        'nationalities',
        'socialTitle',
        'isParentAtNIS',
        'maritalStatus',
        'contactNumbers',
        'emails',
        'file_cv',
        'file_nationalId'
    ];
    const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(defaultFields));


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
    
    useEffect(() => {
        if (templateState.message) {
            toast({
                title: templateState.success ? "Success" : "Error",
                description: templateState.message,
                variant: templateState.success ? "default" : "destructive",
            });
            if (templateState.success) {
                setTemplateName("");
            }
        }
    }, [templateState, toast]);

    useEffect(() => {
        setIsLoadingTemplates(true);
        const q = query(collection(db, "jobApplicationTemplates"), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Template)));
            setIsLoadingTemplates(false);
        });
        return () => unsubscribe();
    }, []);

    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        
        if (template && templateId !== 'none') {
            setSelectedFields(new Set([...defaultFields, ...template.fields]));
        } else {
            // Reset to only required fields
            setSelectedFields(new Set(defaultFields));
        }
    };

    const handleCheckboxChange = (fieldId: string, checked: boolean) => {
        setSelectedFields(prev => {
            const newFields = new Set(prev);
            if (checked) {
                newFields.add(fieldId);
            } else {
                newFields.delete(fieldId);
            }
            return newFields;
        });
    };
    
    const handleSaveTemplate = () => {
        if (!templateName) {
            toast({ title: "Template Name Required", description: "Please enter a name for your template.", variant: "destructive" });
            return;
        }
        
        const formData = new FormData();
        formData.append('operation', 'add');
        formData.append('templateName', templateName);
        
        Array.from(selectedFields).forEach(field => {
            if (!defaultFields.includes(field)) {
                formData.append('fields', field);
            }
        });
        
        if (profile?.id) formData.append('actorId', profile.id);
        if (profile?.email) formData.append('actorEmail', profile.email);
        if (profile?.role) formData.append('actorRole', profile.role);
        
        startTransition(() => {
            templateAction(formData);
        });
    };

     const handleUpdateTemplate = () => {
        if (!selectedTemplate || selectedTemplate === 'none') return;
        const formData = new FormData();
        formData.append('operation', 'update');
        formData.append('templateId', selectedTemplate);
        
        Array.from(selectedFields).forEach(field => {
            if (!defaultFields.includes(field)) {
                formData.append('fields', field);
            }
        });

        if (profile?.id) formData.append('actorId', profile.id);
        if (profile?.email) formData.append('actorEmail', profile.email);
        if (profile?.role) formData.append('actorRole', profile.role);
        
        startTransition(() => {
            templateAction(formData);
        });
    };
    
    const handleDeleteTemplate = () => {
        if (!selectedTemplate || selectedTemplate === 'none') return;
        const formData = new FormData();
        formData.append('operation', 'delete');
        formData.append('templateId', selectedTemplate);
        if (profile?.id) formData.append('actorId', profile.id);
        if (profile?.email) formData.append('actorEmail', profile.email);
        if (profile?.role) formData.append('actorRole', profile.role);
        
        startTransition(() => {
            templateAction(formData);
        });
        setSelectedTemplate("none");
        setSelectedFields(new Set(defaultFields));
    };

    return (
        <form ref={formRef} action={formAction} className="space-y-6">
            <input type="hidden" name="actorId" value={profile?.id} />
            <input type="hidden" name="actorEmail" value={profile?.email} />
            <input type="hidden" name="actorRole" value={profile?.role} />

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
                <Label className="text-base font-semibold">Template Management</Label>
                 <div className="flex flex-col sm:flex-row gap-2">
                     <Select onValueChange={handleTemplateChange} value={selectedTemplate}>
                        <SelectTrigger disabled={isLoadingTemplates}>
                            <SelectValue placeholder={isLoadingTemplates ? "Loading..." : "Load from template"} />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="none">-- None (Default) --</SelectItem>
                            {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {selectedTemplate && selectedTemplate !== 'none' && (
                        <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={handleUpdateTemplate} disabled={isTemplateActionPending}>
                                {isTemplateActionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Update Template
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleDeleteTemplate} disabled={isTemplateActionPending}>
                               {isTemplateActionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                               Delete Template
                            </Button>
                        </div>
                    )}
                 </div>
                <div className="flex flex-col sm:flex-row gap-2 p-4 border rounded-lg bg-muted/20">
                    <Input placeholder="Enter new template name..." value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                    <Button type="button" onClick={handleSaveTemplate} disabled={isTemplateActionPending}>
                       {isTemplateActionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                       Save Current as Template
                    </Button>
                </div>
                 {templateState.errors?.form && <p className="text-sm text-destructive">{templateState.errors.form.join(', ')}</p>}
                 {templateState.errors?.templateName && <p className="text-sm text-destructive">{templateState.errors.templateName.join(', ')}</p>}
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
                            <Checkbox 
                                id={`field-${field.id}`} 
                                name="applicationFields" 
                                value={field.id} 
                                disabled={field.required} 
                                checked={selectedFields.has(field.id)}
                                onCheckedChange={(checked) => handleCheckboxChange(field.id, !!checked)}
                            />
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
