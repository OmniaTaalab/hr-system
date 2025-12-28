
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Briefcase, GraduationCap, Building, Languages, Phone, Mail, FileText, CheckCircle, Calendar as CalendarIcon, DollarSign, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';


function DetailItem({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon?: React.ElementType }) {
    if (!value) return null;
    return (
        <div className="flex items-start text-sm">
            {Icon && <Icon className="h-4 w-4 mr-3 mt-1 text-muted-foreground flex-shrink-0" />}
            <div>
                <p className="font-medium text-muted-foreground">{label}</p>
                <p className="break-words">{String(value)}</p>
            </div>
        </div>
    );
}

function WorkExperienceCard({ experience }: { experience: any }) {
    return (
        <div className="p-4 border rounded-lg space-y-2">
            <h4 className="font-semibold">{experience.jobTitle || 'N/A'} at {experience.companyName || 'N/A'}</h4>
            <DetailItem label="Duration" value={`${experience.fromDate ? format(new Date(experience.fromDate), 'MMM yyyy') : '?'} - ${experience.toDate ? format(new Date(experience.toDate), 'MMM yyyy') : 'Present'}`} />
            <DetailItem label="Duties" value={experience.duties} />
            <DetailItem label="Supervisor" value={experience.supervisorName} />
            <DetailItem label="Salary" value={experience.salary ? `$${experience.salary}` : undefined} />
        </div>
    );
}

function ApplicationView() {
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
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (error) {
         return <Card className="text-center p-8 max-w-lg mx-auto"><CardTitle className="text-destructive">{error}</CardTitle></Card>;
    }
    
    if (!application) {
         return <Card className="text-center p-8 max-w-lg mx-auto"><CardTitle>Application Submitted</CardTitle><CardDescription>Thank you for your submission. You can close this page.</CardDescription></Card>;
    }

    const safeFormatDate = (date: any) => {
        if (!date) return '-';
        try {
            const d = date instanceof Timestamp ? date.toDate() : new Date(date);
            return format(d, 'PPP');
        } catch (e) {
            return String(date);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <Card className="shadow-lg">
                <CardHeader className="text-center bg-primary text-primary-foreground p-8 rounded-t-lg">
                    <CheckCircle className="mx-auto h-12 w-12 mb-4" />
                    <CardTitle className="text-3xl">Application Submitted!</CardTitle>
                    <CardDescription className="text-primary-foreground/80">
                        Thank you, {application.firstNameEn}. Your application for the {application.jobTitle} position has been received.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 md:p-8 space-y-8">
                    
                    <Section icon={User} title="Personal Information">
                        <DetailItem label="Full Name (English)" value={`${application.firstNameEn || ''} ${application.middleNameEn || ''} ${application.lastNameEn || ''}`.trim()} />
                        <DetailItem label="Full Name (Arabic)" value={`${application.firstNameAr || ''} ${application.fatherNameAr || ''} ${application.familyNameAr || ''}`.trim()} />
                        <DetailItem label="Date of Birth" value={safeFormatDate(application.dateOfBirth)} />
                        <DetailItem label="Place of Birth" value={application.placeOfBirth} />
                        <DetailItem label="Nationality(ies)" value={application.nationalities} />
                        <DetailItem label="Social Title" value={application.socialTitle} />
                        <DetailItem label="Marital Status" value={application.maritalStatus} />
                        <DetailItem label="Parent at NIS?" value={application.isParentAtNIS} />
                        <DetailItem label="Number of Children" value={application.numberOfChildren} />
                    </Section>
                    
                    <Section icon={Phone} title="Contact & Address">
                         <DetailItem label="Contact Email" value={application.email1} />
                         <DetailItem label="Alternate Email" value={application.email2} />
                         <DetailItem label="Mobile Phone" value={application.mobilePhone} />
                         <DetailItem label="Home Phone" value={application.homePhone} />
                         <DetailItem label="Other Phone" value={application.otherPhone} />
                         <DetailItem label="Address" value={`${application.apartment || ''}, ${application.building || ''}, ${application.street || ''}, ${application.area || ''}, ${application.city || ''}, ${application.country || ''}`} />
                    </Section>

                    <Section icon={Briefcase} title="Position Applied For">
                        <DetailItem label="Job Title" value={application.positionJobTitle} />
                        <DetailItem label="Subject" value={application.positionSubject} />
                        <DetailItem label="Years of Experience" value={application.yearsOfExperience} />
                        <DetailItem label="Expected Salary" value={application.expectedSalary ? `$${application.expectedSalary}`: '-'} />
                        <DetailItem label="School Type Experience" value={application.schoolType} />
                        {application.schoolType && <DetailItem label="Campus" value={application.nationalCampus} />}
                        <DetailItem label="Available to Start" value={safeFormatDate(application.availableStartDate)} />
                        <DetailItem label="Notice Period" value={application.noticePeriod ? `${application.noticePeriod} days` : '-'} />
                        <DetailItem label="Needs Bus?" value={application.needsBus} />
                        <DetailItem label="Inside Contact?" value={application.insideContact} />
                         <DetailItem label="Contacted by HR?" value={application.contactedByHR} />
                    </Section>

                     <Section icon={GraduationCap} title="Educational History">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-semibold text-md">School</h4>
                                <DetailItem label="Name" value={application.school_name} />
                                <DetailItem label="Major" value={application.school_major} />
                                <DetailItem label="Location" value={application.school_cityCountry} />
                                <DetailItem label="Duration" value={`${safeFormatDate(application.school_startDate)} - ${safeFormatDate(application.school_endDate)}`} />
                                <DetailItem label="Completed" value={application.school_completed} />
                            </div>
                             <div>
                                <h4 className="font-semibold text-md">University</h4>
                                <DetailItem label="Name" value={application.university_name} />
                                <DetailItem label="Faculty" value={application.university_faculty} />
                                <DetailItem label="Major" value={application.university_major} />
                                <DetailItem label="Location" value={application.university_cityCountry} />
                                <DetailItem label="Duration" value={`${safeFormatDate(application.university_startDate)} - ${safeFormatDate(application.university_endDate)}`} />
                                <DetailItem label="Completed" value={application.university_completed} />
                            </div>
                        </div>
                    </Section>

                    <Section icon={Languages} title="Language & Computer Skills">
                        <p className="text-sm text-muted-foreground">Details for languages and computer skills would be displayed here.</p>
                    </Section>
                    
                    {application.workExperience && application.workExperience.length > 0 && (
                        <Section icon={Building} title="Work Experience">
                            <div className="space-y-4">
                                {application.workExperience.map((exp: any, index: number) => (
                                    <WorkExperienceCard key={index} experience={exp} />
                                ))}
                            </div>
                        </Section>
                    )}

                    {(application.cvUrl || application.nationalIdUrl) && (
                        <Section icon={FileText} title="Attachments">
                            <div className="flex gap-4">
                                {application.cvUrl && <a href={application.cvUrl} target="_blank" rel="noopener noreferrer"><Button>View CV</Button></a>}
                                {application.nationalIdUrl && <a href={application.nationalIdUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary">View National ID</Button></a>}
                            </div>
                        </Section>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Section({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) {
    return (
        <div>
            <h3 className="font-semibold text-lg flex items-center mb-4"><Icon className="mr-2" /> {title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pl-8">
                {children}
            </div>
            <Separator className="mt-8" />
        </div>
    )
}

export default function ApplicationViewPage() {
    return (
        <AppLayout>
            <Suspense fallback={<div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
                <ApplicationView />
            </Suspense>
        </AppLayout>
    );
}
