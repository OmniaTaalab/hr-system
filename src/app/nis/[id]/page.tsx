
"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { AppLayout } from "@/components/layout/app-layout";
import { useApp } from "@/components/layout/app-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  User,
  Users,
  Mail,
  Phone,
  Cake,
  Briefcase,
  MapPin,
  DollarSign,
  FileText,
  School,
  Languages,
  Computer,
  Building,
  Check,
  X,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";

// Helper to safely convert different date formats to a string
const formatDateSafe = (date: any) => {
  if (!date) return "-";
  if (date instanceof Timestamp) return format(date.toDate(), "PPP");
  if (typeof date === "string") {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return format(parsedDate, "PPP");
    }
  }
  if (date.seconds) { // Handle Firestore-like timestamp objects
    return format(new Date(date.seconds * 1000), "PPP");
  }
  return "-";
};

const DetailItem = ({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
}) => {
  const hasContent = value || (children && React.Children.count(children) > 0);
  if (!hasContent) return null;
  return (
    <div className="flex items-start text-sm">
      <Icon className="mr-3 mt-1 h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-grow">
        <span className="font-medium text-muted-foreground">{label}:</span>
        <span className="ml-2 text-foreground">{value || children}</span>
      </div>
    </div>
  );
};

const YesNoIcon = ({ value }: { value?: string | null }) => {
  if (value === "Yes") return <Check className="h-5 w-5 text-green-600 inline-block" />;
  if (value === "No") return <X className="h-5 w-5 text-red-600 inline-block" />;
  return <span className="text-muted-foreground">-</span>;
};

const LanguageGrid = ({ application, lang, label }: { application: any, lang: string, label: string }) => (
    <div className="p-3 border rounded-md bg-muted/50">
        <p className="font-semibold text-sm mb-2">{label}</p>
        <div className="grid grid-cols-2 text-xs gap-1">
            <span>Speak: <strong>{application[`lang_${lang}_speak`] || '-'}</strong></span>
            <span>Understand: <strong>{application[`lang_${lang}_understand`] || '-'}</strong></span>
            <span>Read: <strong>{application[`lang_${lang}_read`] || '-'}</strong></span>
            <span>Write: <strong>{application[`lang_${lang}_write`] || '-'}</strong></span>
            <span className="col-span-2">Typing: <strong>{application[`lang_${lang}_typing`]} w/m</strong></span>
        </div>
    </div>
);

function ApplicationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const fetchApplication = async () => {
        setLoading(true);
        try {
          const docRef = doc(db, "nis", id);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setApplication({ id: docSnap.id, ...docSnap.data() });
          } else {
            setError("Application not found.");
          }
        } catch (err) {
          console.error("Error fetching application:", err);
          setError("Failed to load application details.");
        } finally {
          setLoading(false);
        }
      };

      fetchApplication();
    }
  }, [id]);

  const fullNameEn = useMemo(() => {
    if (!application) return "";
    return [
      application.firstNameEn,
      application.middleNameEn,
      application.lastNameEn,
    ]
      .filter(Boolean)
      .join(" ");
  }, [application]);

  const fullNameAr = useMemo(() => {
    if (!application) return "";
    return [
      application.firstNameAr,
      application.fatherNameAr,
      application.familyNameAr,
    ]
      .filter(Boolean)
      .join(" ");
  }, [application]);

  if (loading) {
    return (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (error) {
    return (
        <Card className="max-w-2xl mx-auto text-center">
            <CardHeader>
                <div className="mx-auto bg-destructive/10 p-3 rounded-full">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="text-destructive mt-4">Error</CardTitle>
            </CardHeader>
            <CardContent>
                <p>{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </CardContent>
        </Card>
    );
  }

  return (
      <div className="max-w-4xl mx-auto space-y-6">
        {application && (
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30 text-center p-6">
                 <div className="w-24 h-24 bg-primary/10 mx-auto rounded-full flex items-center justify-center">
                    <Check className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="font-headline text-3xl mt-4">
                    Application Submitted!
                </CardTitle>
                <CardDescription className="text-md">
                    Thank you, {fullNameEn}. Your application has been received.
                </CardDescription>
                <p className="text-sm text-muted-foreground pt-4">
                    A copy of your submitted details is shown below for your reference.
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Personal Information */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <User className="mr-2 h-5 w-5 text-primary" /> Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <DetailItem label="Full Name (English)" value={fullNameEn} icon={User}/>
                  <DetailItem label="Full Name (Arabic)" value={fullNameAr} icon={User} />
                  <DetailItem label="Email (1)" value={application.email1} icon={Mail} />
                  <DetailItem label="Email (2)" value={application.email2} icon={Mail} />
                  <DetailItem label="Mobile" value={application.mobilePhone} icon={Phone} />
                  <DetailItem label="Home Phone" value={application.homePhone} icon={Phone} />
                  <DetailItem label="Other Phone" value={application.otherPhone} icon={Phone} />
                  <DetailItem label="Date of Birth" value={formatDateSafe(application.dateOfBirth)} icon={Cake}/>
                  <DetailItem label="Place of Birth" value={application.placeOfBirth} icon={MapPin}/>
                  <DetailItem label="Nationality" value={application.nationalities} icon={User}/>
                  <DetailItem label="Social Title" value={application.socialTitle} icon={User}/>
                  <DetailItem label="Marital Status" value={application.maritalStatus} icon={Users}/>
                  <DetailItem label="Parent at NIS" icon={User}><YesNoIcon value={application.isParentAtNIS} /></DetailItem>
                  <DetailItem label="Number of Children" value={application.numberOfChildren} icon={Users}/>
                  <DetailItem label="Address" value={[application.apartment, application.building, application.street, application.area, application.city, application.country].filter(Boolean).join(", ")} icon={MapPin} />
                </div>
              </section>
              
               {/* Job Requirements */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <Briefcase className="mr-2 h-5 w-5 text-primary" /> Position Applied For
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <DetailItem label="Position" value={application.positionJobTitle || application.jobTitle} icon={Briefcase} />
                  <DetailItem label="Subject" value={application.positionSubject} icon={BookOpen} />
                  <DetailItem label="Years of Experience" value={application.yearsOfExperience} icon={Briefcase} />
                  <DetailItem label="Expected Salary" value={application.expectedSalary} icon={DollarSign} />
                  <DetailItem label="School Type Experience" value={application.schoolType} icon={School} />
                  <DetailItem label="National Campus" value={application.nationalCampus} icon={School} />
                  <DetailItem label="Notice Period" value={application.noticePeriod ? `${application.noticePeriod} days` : '-'} icon={Cake}/>
                  <DetailItem label="Available Start Date" value={formatDateSafe(application.availableStartDate)} icon={Cake}/>
                  <DetailItem label="Needs School Bus" value={application.needsBus} icon={Briefcase}/>
                  <DetailItem label="Inside Contact" icon={Briefcase}><YesNoIcon value={application.insideContact} /></DetailItem>
                  <DetailItem label="How did you hear?" value={application.howDidYouHear} icon={Briefcase} />
                  <DetailItem label="Previously worked at NIS" icon={Briefcase}><YesNoIcon value={application.previouslyWorkedAtNIS} /></DetailItem>
                </div>
              </section>

              {/* Educational History */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <School className="mr-2 h-5 w-5 text-primary" /> Educational History
                </h3>
                <div className="space-y-4">
                  <div className="p-4 border rounded-md">
                    <p className="font-bold">School</p>
                    <div className="text-sm mt-2 grid grid-cols-2 gap-2">
                        <p>Name: {application.school_name || '-'}</p>
                        <p>Major: {application.school_major || '-'}</p>
                        <p>Location: {application.school_cityCountry || '-'}</p>
                        <p>Overall: {application.school_overall || '-'}</p>
                        <p>Start Date: {formatDateSafe(application.school_startDate)}</p>
                        <p>End Date: {formatDateSafe(application.school_endDate)}</p>
                        <p>Completed: <YesNoIcon value={application.school_completed} /></p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-md">
                    <p className="font-bold">University</p>
                     <div className="text-sm mt-2 grid grid-cols-2 gap-2">
                        <p>Name: {application.university_name || '-'}</p>
                        <p>Faculty: {application.university_faculty || '-'}</p>
                        <p>Major: {application.university_major || '-'}</p>
                        <p>Location: {application.university_cityCountry || '-'}</p>
                        <p>Overall: {application.university_overall || '-'}</p>
                        <p>Start Date: {formatDateSafe(application.university_startDate)}</p>
                        <p>End Date: {formatDateSafe(application.university_endDate)}</p>
                        <p>Completed: <YesNoIcon value={application.university_completed} /></p>
                    </div>
                  </div>
                   {(application.diploma1_name || application.diploma2_name) && (
                    <div className="p-4 border rounded-md">
                        <p className="font-bold">Diplomas/Courses</p>
                        {application.diploma1_name && <p className="text-sm mt-2">{application.diploma1_name} at {application.diploma1_institution} (Completed: <YesNoIcon value={application.diploma1_completed} />)</p>}
                        {application.diploma2_name && <p className="text-sm mt-2">{application.diploma2_name} at {application.diploma2_institution} (Completed: <YesNoIcon value={application.diploma2_completed} />)</p>}
                    </div>
                   )}
                </div>
              </section>

              {/* Skills */}
              <section>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                    <Languages className="mr-2 h-5 w-5 text-primary" /> Skills
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <LanguageGrid application={application} lang="english" label="English" />
                      <LanguageGrid application={application} lang="arabic" label="Arabic" />
                      <LanguageGrid application={application} lang="french" label="French" />
                      <LanguageGrid application={application} lang="german" label="German" />
                  </div>
                   <div className="mt-4 p-3 border rounded-md bg-muted/50">
                        <p className="font-semibold text-sm mb-2 flex items-center"><Computer className="mr-2 h-4 w-4"/>Computer Skills</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 text-xs gap-2">
                            <span>MS Office: <strong>{application.skill_ms_office || '-'}</strong></span>
                            <span>Smart Board: <strong>{application.skill_smart_board || '-'}</strong></span>
                            <span>E-Learning: <strong>{application.skill_e_learning || '-'}</strong></span>
                            <span>Google/Zoom: <strong>{application.skill_gclass_zoom || '-'}</strong></span>
                            <span>Oracle DB: <strong>{application.skill_oracle_db || '-'}</strong></span>
                        </div>
                    </div>
              </section>

              {/* Work Experience */}
              {application.workExperience && application.workExperience.length > 0 && (
                <section>
                    <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                        <Building className="mr-2 h-5 w-5 text-primary" /> Work Experience
                    </h3>
                    <div className="space-y-4">
                        {application.workExperience.map((exp: any, index: number) => (
                            <div key={index} className="p-4 border rounded-lg text-sm">
                                <p className="font-bold text-base">{exp.jobTitle} at {exp.companyName}</p>
                                <p className="text-xs text-muted-foreground">{formatDateSafe(exp.fromDate)} - {formatDateSafe(exp.toDate) || 'Present'}</p>
                                <Separator className="my-2" />
                                <p className="mt-2 text-foreground">{exp.duties}</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
                                    <p><span className="text-muted-foreground">Location: </span>{exp.address}</p>
                                    <p><span className="text-muted-foreground">Department: </span>{exp.department}</p>
                                    <p><span className="text-muted-foreground">Stage: </span>{exp.stage}</p>
                                    <p><span className="text-muted-foreground">Supervisor: </span>{exp.supervisorName}</p>
                                    <p><span className="text-muted-foreground">Telephone: </span>{exp.telephone}</p>
                                    <p><span className="text-muted-foreground">Number of employees supervised by you: </span>{exp.supervisedCount}</p>
                                    <p><span className="text-muted-foreground">Benefits: </span>{exp.benefits}</p>
                                    <p><span className="text-muted-foreground">Salary: </span>{exp.salary}</p>
                                    <p><span className="text-muted-foreground">Reason for leaving: </span>{exp.reasonForLeaving}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
              )}

              {/* File Downloads */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-primary" /> Attachments
                </h3>
                <div className="flex gap-4">
                  {application.cvUrl && (
                    <Button asChild variant="outline">
                      <a href={application.cvUrl} target="_blank" rel="noopener noreferrer"> View CV </a>
                    </Button>
                  )}
                  {application.nationalIdUrl && (
                    <Button asChild variant="outline">
                      <a href={application.nationalIdUrl} target="_blank" rel="noopener noreferrer"> View National ID </a>
                    </Button>
                  )}
                </div>
              </section>
            </CardContent>
          </Card>
        )}
      </div>
  );
}

export default function ApplicationDetailPage() {
    const { user, loading } = useApp();

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    const Layout = user ? AppLayout : PublicLayout;

    return (
        <Layout>
            <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
                <ApplicationDetailContent />
            </Suspense>
        </Layout>
    );
}

