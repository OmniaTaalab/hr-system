
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
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
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";

// Helper to safely convert different date formats to a string
const formatDateSafe = (date: any) => {
  if (!date) return "-";
  if (date instanceof Timestamp) return format(date.toDate(), "PPP");
  if (date instanceof Date) return format(date, "PPP");
  if (typeof date === "string") return format(new Date(date), "PPP");
  return "-";
};

const DetailItem = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | number | null;
}) => {
  if (!value) return null;
  return (
    <div className="flex items-center text-sm">
      <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-muted-foreground">{label}:</span>
      <span className="ml-2 text-foreground">{value}</span>
    </div>
  );
};

const YesNoIcon = ({ value }: { value?: string | null }) => {
  if (value === "Yes") return <Check className="h-5 w-5 text-green-600" />;
  if (value === "No") return <X className="h-5 w-5 text-red-600" />;
  return <span className="text-muted-foreground">-</span>;
};

export default function ApplicationDetailPage() {
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

  const getInitials = (name?: string) =>
    name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
      : "?";

  if (loading) {
    return (
      <PublicLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (error) {
    return (
      <PublicLayout>
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
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/nis")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to All Applications
        </Button>

        {application && (
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                  <AvatarFallback className="text-3xl">
                    {getInitials(fullNameEn)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-grow text-center md:text-left">
                  <CardTitle className="font-headline text-3xl">
                    {fullNameEn}
                  </CardTitle>
                  <CardDescription className="text-lg text-primary" dir="rtl">
                    {fullNameAr}
                  </CardDescription>
                  <p className="text-sm text-muted-foreground mt-1">
                    Applied for: {application.positionJobTitle || application.jobTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted on: {formatDateSafe(application.submittedAt)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Personal Information */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <User className="mr-2 h-5 w-5 text-primary" /> Personal
                  Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <DetailItem
                    icon={Mail}
                    label="Email (1)"
                    value={application.email1}
                  />
                  <DetailItem
                    icon={Mail}
                    label="Email (2)"
                    value={application.email2}
                  />
                  <DetailItem
                    icon={Phone}
                    label="Mobile"
                    value={application.mobilePhone}
                  />
                  <DetailItem
                    icon={Phone}
                    label="Home Phone"
                    value={application.homePhone}
                  />
                  <DetailItem
                    icon={Cake}
                    label="Date of Birth"
                    value={formatDateSafe(application.dateOfBirth)}
                  />
                  <DetailItem
                    icon={MapPin}
                    label="Place of Birth"
                    value={application.placeOfBirth}
                  />
                   <DetailItem
                    icon={User}
                    label="Nationality"
                    value={application.nationalities}
                  />
                   <DetailItem
                    icon={User}
                    label="Social Title"
                    value={application.socialTitle}
                  />
                   <DetailItem
                    icon={User}
                    label="Marital Status"
                    value={application.maritalStatus}
                  />
                </div>
              </section>

               {/* Job Requirements */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <Briefcase className="mr-2 h-5 w-5 text-primary" /> Job
                  Requirements
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <DetailItem label="Position" value={application.positionJobTitle} icon={Briefcase} />
                  <DetailItem label="Subject" value={application.positionSubject} icon={Briefcase} />
                  <DetailItem label="Years of Experience" value={application.yearsOfExperience} icon={Briefcase} />
                  <DetailItem label="Expected Salary" value={application.expectedSalary} icon={DollarSign} />
                  <DetailItem label="School Type Experience" value={application.schoolType} icon={School} />
                  <DetailItem label="National Campus" value={application.nationalCampus} icon={School} />
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
                            <div key={index} className="p-4 border rounded-lg">
                                <p className="font-bold">{exp.jobTitle} at {exp.companyName}</p>
                                <p className="text-sm text-muted-foreground">{formatDateSafe(exp.fromDate)} - {formatDateSafe(exp.toDate) || 'Present'}</p>
                                <p className="text-sm mt-2">{exp.duties}</p>
                            </div>
                        ))}
                    </div>
                </section>
              )}


              {/* File Downloads */}
              <section>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-primary" />{" "}
                  Attachments
                </h3>
                <div className="flex gap-4">
                  {application.cvUrl && (
                    <Button asChild variant="outline">
                      <a
                        href={application.cvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download CV
                      </a>
                    </Button>
                  )}
                  {application.nationalIdUrl && (
                    <Button asChild variant="outline">
                      <a
                        href={application.nationalIdUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download National ID
                      </a>
                    </Button>
                  )}
                </div>
              </section>
            </CardContent>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
