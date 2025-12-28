
"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Briefcase, GraduationCap, Building, Languages, Phone, Mail, FileText, CheckCircle, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';


function DetailItem({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon: React.ElementType }) {
    if (!value) return null;
    return (
        <div className="flex items-start text-sm">
            <Icon className="h-4 w-4 mr-3 mt-1 text-muted-foreground flex-shrink-0" />
            <div>
                <p className="font-medium text-muted-foreground">{label}</p>
                <p>{value}</p>
            </div>
        </div>
    );
}

export default function ApplicationViewPage() {
    const searchParams = useSearchParams();
    const [application, setApplication] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const applicationId = searchParams.get('id');

    useEffect(() => {
        if (!applicationId) {
            setError("No application ID provided.");
            setIsLoading(false);
            return;
        }

        const fetchApplication = async () => {
            setIsLoading(true);
            try {
                // Fetch from 'nis' collection instead of 'jobApplications'
                const docRef = doc(db, 'nis', applicationId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setApplication({ id: docSnap.id, ...docSnap.data() });
                } else {
                    setError('Application not found.');
                }
            } catch (e) {
                console.error("Error fetching application:", e);
                setError('Failed to load the application.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchApplication();
    }, [applicationId]);
    
    if (isLoading) {
        return <AppLayout><div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div></AppLayout>;
    }

    if (error) {
         return <AppLayout><Card className="text-center p-8 max-w-lg mx-auto"><CardTitle className="text-destructive">{error}</CardTitle></Card></AppLayout>;
    }
    
    if (!application) {
         return <AppLayout><Card className="text-center p-8 max-w-lg mx-auto"><CardTitle>Application Submitted</CardTitle><CardDescription>Thank you for your submission. You can close this page.</CardDescription></Card></AppLayout>;
    }

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <Card className="shadow-lg">
                    <CardHeader className="text-center bg-primary text-primary-foreground p-8 rounded-t-lg">
                        <CheckCircle className="mx-auto h-12 w-12 mb-4" />
                        <CardTitle className="text-3xl">Application Submitted!</CardTitle>
                        <CardDescription className="text-primary-foreground/80">
                            Thank you, {application.firstNameEn}. Your application for the {application.jobTitle} position has been received.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 md:p-8 space-y-6">
                        <p className="text-center text-muted-foreground">A copy of your submitted details is shown below for your reference.</p>
                        
                        <Separator />
                        
                        <h3 className="font-semibold text-lg flex items-center"><User className="mr-2" /> Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <DetailItem label="Full Name (English)" value={`${application.firstNameEn || ''} ${application.middleNameEn || ''} ${application.lastNameEn || ''}`.trim()} icon={User} />
                           <DetailItem label="Full Name (Arabic)" value={`${application.firstNameAr || ''} ${application.fatherNameAr || ''} ${application.familyNameAr || ''}`.trim()} icon={User} />
                           <DetailItem label="Date of Birth" value={application.dateOfBirth ? format(new Date(application.dateOfBirth), 'PPP') : '-'} icon={CalendarIcon} />
                           <DetailItem label="Contact Email" value={application.email1} icon={Mail} />
                           <DetailItem label="Contact Phone" value={application.mobilePhone} icon={Phone} />
                        </div>
                        
                         <Separator />
                        
                        <h3 className="font-semibold text-lg flex items-center"><Briefcase className="mr-2" /> Position Applied For</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailItem label="Job Title" value={application.positionJobTitle} icon={Briefcase} />
                            <DetailItem label="Subject" value={application.positionSubject} icon={Briefcase} />
                            <DetailItem label="Years of Experience" value={application.yearsOfExperience} icon={Briefcase} />
                            <DetailItem label="Expected Salary" value={application.expectedSalary} icon={DollarSign} />
                        </div>
                        
                        {(application.cvUrl || application.nationalIdUrl) && (
                            <>
                            <Separator />
                            <h3 className="font-semibold text-lg flex items-center"><FileText className="mr-2" /> Attachments</h3>
                            <div className="flex gap-4">
                                {application.cvUrl && <a href={application.cvUrl} target="_blank" rel="noopener noreferrer"><Button>View CV</Button></a>}
                                {application.nationalIdUrl && <a href={application.nationalIdUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary">View National ID</Button></a>}
                            </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
