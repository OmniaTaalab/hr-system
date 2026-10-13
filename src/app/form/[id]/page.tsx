

"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";

import { PublicLayout } from "@/components/layout/public-layout";

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

  Download,

} from "lucide-react";

import { useParams, useRouter } from "next/navigation";

import { db } from "@/lib/firebase/config";

import { doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";

import { format } from "date-fns";

import { Separator } from "@/components/ui/separator";

// Helper to safely convert different date formats to a string

const formatDateSafe = (date: any) => {

  if (!date) return "-";

  if (date instanceof Timestamp) return format(date.toDate(), "MM/dd/yyyy");

  if (typeof date === "string") {

    const parsedDate = new Date(date);

    if (!isNaN(parsedDate.getTime())) {

      return format(parsedDate, "MM/dd/yyyy");

    }

  }

  if (date.seconds) { // Handle Firestore-like timestamp objects

    return format(new Date(date.seconds * 1000), "MM/dd/yyyy");

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

  const { user, profile, loading: userLoading } = useApp();
  const isLoggedIn = !userLoading && !!user;
  const [isDownloading, setIsDownloading] = useState(false);

  const [application, setApplication] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const isPrivilegedUser = !userLoading && profile && (profile.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'hr');

  useEffect(() => {

    if (id) {

      const fetchApplication = async () => {

        setLoading(true);

        try {

          // This should fetch from 'nis' collection based on previous context.

          const docRef = doc(db, "nis", id);

          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {

            const appData = { id: docSnap.id, ...docSnap.data() };

            setApplication(appData);

            if (isPrivilegedUser && appData.read === false) {

              await updateDoc(docRef, { read: true });

            }

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

  }, [id, isPrivilegedUser]);

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

  const downloadPdf = async () => {
    if (!isLoggedIn || !application || isDownloading) return;
    setIsDownloading(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const filenameName = (fullNameEn || "Applicant")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .replace(/\s+/g, "_") || "Applicant";

      // Export every visible form field, including empty fields. Do not export Firestore internals.
      const excludedKeys = new Set(["id", "read"]);
      const processedKeys = new Set<string>();
      const sections: Array<{ title: string; fields: Array<[string, string]> }> = [];

      const labelFor = (key: string) => key
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (character) => character.toUpperCase());

      const stringify = (value: any): string => {
        if (value === null || value === undefined || value === "") return "-";
        if (value instanceof Timestamp || (typeof value === "object" && typeof value.seconds === "number")) {
          return formatDateSafe(value);
        }
        if (typeof value === "boolean") return value ? "Yes" : "No";
        if (Array.isArray(value)) {
          return value.length ? value.map((entry, index) => `${index + 1}. ${stringify(entry)}`).join("\n") : "-";
        }
        if (typeof value === "object") {
          return Object.entries(value).map(([key, entry]) => `${labelFor(key)}: ${stringify(entry)}`).join("\n") || "-";
        }
        return String(value);
      };

      const addSection = (title: string, fields: Array<[string, any, string?]>) => {
        sections.push({
          title,
          fields: fields.map(([label, value, sourceKey]) => {
            if (sourceKey) processedKeys.add(sourceKey);
            return [label, stringify(value)];
          }),
        });
      };
      const field = (label: string, key: string): [string, any, string] => [label, application[key], key];

      // Top-level fields are listed in the same order as the on-screen application.
      addSection("Personal Information", [
        ["Full Name (English)", fullNameEn], ["Full Name (Arabic)", fullNameAr],
        ...["firstNameEn", "middleNameEn", "lastNameEn", "firstNameAr", "fatherNameAr", "familyNameAr"].map((key) => {
          processedKeys.add(key);
          return [labelFor(key), application[key]] as [string, any];
        }),
        field("Email (1)", "email1"), field("Email (2)", "email2"),
        field("Mobile", "mobilePhone"), field("Home Phone", "homePhone"), field("Other Phone", "otherPhone"),
        ["Date of Birth", formatDateSafe(application.dateOfBirth), "dateOfBirth"],
        field("Place of Birth", "placeOfBirth"), field("Nationality", "nationalities"),
        field("Social Title", "socialTitle"), field("Marital Status", "maritalStatus"),
        field("Parent at NIS", "isParentAtNIS"), field("Number of Children", "numberOfChildren"),
        ["Full Address", ["apartment", "building", "street", "area", "city", "country"]
          .map((key) => application[key]).filter(Boolean).join(", ")],
        ...["apartment", "building", "street", "area", "city", "country"].map((key) => field(labelFor(key), key)),
        field("Contacted By HR", "contactedByHR"),
      ]);

      addSection("Emergency Contact", [
        field("Name", "emergencyContactName"), field("Relationship", "emergencyContactRelationship"),
        field("Phone Number", "emergencyContactNumber"),
      ]);

      addSection("Position Applied For", [
        field("Position", "positionJobTitle"), field("Job Title", "jobTitle"),
        field("Subject", "positionSubject"), field("Years of Experience", "yearsOfExperience"),
        field("Expected Salary", "expectedSalary"), field("School Type Experience", "schoolType"),
        field("National Campus", "nationalCampus"), field("Notice Period (days)", "noticePeriod"),
        ["Available Start Date", formatDateSafe(application.availableStartDate), "availableStartDate"],
        field("Needs School Bus", "needsBus"), field("Inside Contact", "insideContact"),
        field("How Did You Hear?", "howDidYouHear"),
        field("Previously Worked at NIS", "previouslyWorkedAtNIS"),
      ]);

      addSection("Educational History - School", [
        field("Name", "school_name"), field("Major", "school_major"),
        field("Location", "school_cityCountry"), field("Overall", "school_overall"),
        ["Start Date", formatDateSafe(application.school_startDate), "school_startDate"],
        ["End Date", formatDateSafe(application.school_endDate), "school_endDate"],
        field("Completed", "school_completed"),
      ]);
      addSection("Educational History - University", [
        field("Name", "university_name"), field("Faculty", "university_faculty"),
        field("Major", "university_major"), field("Location", "university_cityCountry"),
        field("Overall", "university_overall"),
        ["Start Date", formatDateSafe(application.university_startDate), "university_startDate"],
        ["End Date", formatDateSafe(application.university_endDate), "university_endDate"],
        field("Completed", "university_completed"),
      ]);

      addSection("Skills - Languages", ["english", "arabic", "french", "german"].flatMap((lang) =>
        ["speak", "understand", "read", "write", "typing"].map((skill) =>
          field(`${lang[0].toUpperCase()}${lang.slice(1)} - ${labelFor(skill)}`, `lang_${lang}_${skill}`)
        )
      ));
      addSection("Skills - Computer", [
        field("MS Office", "skill_ms_office"), field("Smart Board", "skill_smart_board"),
        field("E-Learning", "skill_e_learning"), field("Google / Zoom", "skill_gclass_zoom"),
        field("Oracle DB", "skill_oracle_db"),
      ]);

      addSection("Diplomas & Courses", [
        field("Diploma 1 Name", "diploma1_name"), field("Diploma 1 Institution", "diploma1_institution"),
        field("Diploma 1 Completed", "diploma1_completed"),
        field("Diploma 2 Name", "diploma2_name"), field("Diploma 2 Institution", "diploma2_institution"),
        field("Diploma 2 Completed", "diploma2_completed"),
      ]);
      processedKeys.add("diplomasCourses");
      if (Array.isArray(application.diplomasCourses)) {
        application.diplomasCourses.forEach((entry: any, index: number) => {
          addSection(`Diplomas & Courses - Entry ${index + 1}`, Object.entries(entry || {}).map(([key, value]) => [labelFor(key), value]));
        });
      } else if (application.diplomasCourses) {
        addSection("Diplomas & Courses - Additional", [["Details", application.diplomasCourses]]);
      }

      processedKeys.add("workExperience");
      if (Array.isArray(application.workExperience) && application.workExperience.length) {
        application.workExperience.forEach((experience: any, index: number) => {
          const exp = experience || {};
          addSection(`Work Experience - ${index + 1}`, [
            ["Job Title", exp.jobTitle], ["Company", exp.companyName],
            ["From Date", formatDateSafe(exp.fromDate)], ["To Date", formatDateSafe(exp.toDate)],
            ["Duties", exp.duties], ["Address", exp.address], ["Department", exp.department],
            ["Stage", exp.stage], ["Supervisor", exp.supervisorName], ["Telephone", exp.telephone],
            ["Employees Supervised", exp.supervisedCount], ["Benefits", exp.benefits],
            ["Salary", exp.salary], ["Reason for Leaving", exp.reasonForLeaving],
            ...Object.entries(exp)
              .filter(([key]) => !["jobTitle", "companyName", "fromDate", "toDate", "duties", "address", "department", "stage", "supervisorName", "telephone", "supervisedCount", "benefits", "salary", "reasonForLeaving"].includes(key))
              .map(([key, value]) => [labelFor(key), value] as [string, any]),
          ]);
        });
      } else {
        addSection("Work Experience", [["Experience", "-"]]);
      }

      addSection("Attachments", [
        field("CV URL", "cvUrl"), field("National ID URL", "nationalIdUrl"),
      ]);

      // Do not lose new fields when the application schema changes.
      const remaining = Object.keys(application)
        .filter((key) => !excludedKeys.has(key) && !processedKeys.has(key))
        .map((key) => field(labelFor(key), key));
      if (remaining.length) addSection("Additional Application Details", remaining);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Employment Application", 14, 18);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(fullNameEn || "Applicant", 14, 25);

      // jsPDF built-in fonts do not support Arabic. Render Arabic/mixed-script
      // table values with the browser's Unicode font shaping, then place them
      // as images inside the corresponding AutoTable cells.
      // This uses no extra dependencies and preserves the original Firestore text.
      const containsArabic = (text: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
      const pxPerMm = 96 / 25.4;
      const canvasScale = 2;
      const textFontPx = 12;
      const lineHeightPx = 17;
      const padPx = 7;

      const arabicCellImage = (text: string, widthMm: number) => {
        const widthPx = Math.max(60, Math.floor(widthMm * pxPerMm));
        const temp = document.createElement("canvas");
        const measure = temp.getContext("2d");
        if (!measure) return null;
        measure.font = `${textFontPx}px Arial, Tahoma, sans-serif`;
        const available = widthPx - padPx * 2;
        const lines: string[] = [];

        for (const paragraph of text.split(/\r?\n/)) {
          let current = "";
          for (const word of (paragraph.match(/\S+|\s+/g) || [])) {
            const candidate = current + word;
            if (measure.measureText(candidate).width <= available) {
              current = candidate;
            } else {
              if (current.trim()) lines.push(current.trim());
              current = word.trimStart();
              // Split extremely long unbroken values to keep them inside A4.
              if (measure.measureText(current).width > available) {
                let part = "";
                for (const char of Array.from(current)) {
                  if (part && measure.measureText(part + char).width > available) {
                    lines.push(part);
                    part = char;
                  } else part += char;
                }
                current = part;
              }
            }
          }
          lines.push(current || " ");
        }
        const heightPx = Math.max(lineHeightPx + padPx * 2, lines.length * lineHeightPx + padPx * 2);
        const canvas = document.createElement("canvas");
        canvas.width = widthPx * canvasScale;
        canvas.height = heightPx * canvasScale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.scale(canvasScale, canvasScale);
        ctx.clearRect(0, 0, widthPx, heightPx);
        ctx.font = `${textFontPx}px Arial, Tahoma, sans-serif`;
        ctx.fillStyle = "#1f2937";
        // Browser canvas performs glyph shaping / bidirectional text layout.
        const isRtl = containsArabic(text);
        ctx.direction = isRtl ? "rtl" : "ltr";
        ctx.textAlign = isRtl ? "right" : "left";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => ctx.fillText(line, isRtl ? widthPx - padPx : padPx, padPx + i * lineHeightPx));
        return { src: canvas.toDataURL("image/png"), heightMm: heightPx / pxPerMm };
      };

      let nextY = 31;
      for (const section of sections) {
        autoTable(pdf, {
          startY: nextY,
          head: [[{ content: section.title, colSpan: 2, styles: { fontStyle: "bold" } }]],
          body: section.fields,
          theme: "grid",
          margin: { top: 14, right: 14, bottom: 14, left: 14 },
          styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak", valign: "top" },
          columnStyles: { 0: { cellWidth: 57, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
          rowPageBreak: "avoid",
          didParseCell: (data) => {
            if (data.section !== "body") return;
            const value = String(data.cell.raw ?? "");
            if (!containsArabic(value)) return;
            const tableWidth = pdf.internal.pageSize.getWidth() - 28;
            const cellWidth = data.column.index === 0 ? 57 : tableWidth - 57;
            const image = arabicCellImage(value, cellWidth - 5);
            if (!image) return;
            // Remove the unsupported font's text BEFORE AutoTable renders it.
            data.cell.text = [""];
            data.cell.styles.minCellHeight = Math.max(
              data.cell.styles.minCellHeight || 0,
              image.heightMm + 2
            );
            (data.cell as any)._arabicImage = image;
          },
          didDrawCell: (data) => {
            const image = (data.cell as any)._arabicImage as
              | { src: string; heightMm: number }
              | undefined;
            if (!image || data.section !== "body") return;
            pdf.addImage(
              image.src,
              "PNG",
              data.cell.x + 2.5,
              data.cell.y + 1,
              data.cell.width - 5,
              image.heightMm
            );
          },
        });
        nextY = ((pdf as any).lastAutoTable?.finalY ?? 31) + 6;
      }

      pdf.save(`Application_${filenameName}.pdf`);
    } catch (err) {
      console.error("Failed to generate application PDF:", err);
      alert("Could not generate the PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

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

        {isLoggedIn && (
          <div className="flex justify-end print:hidden">
            <Button onClick={downloadPdf} disabled={isDownloading} className="gap-2 shadow-sm">
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloading ? "Generating PDF..." : "Download Application / PDF"}
            </Button>
          </div>
        )}

        {application && (
          <div className="application-pdf-content bg-white text-slate-900">
          <Card className="shadow-lg">

            {!isLoggedIn && (

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

            )}

            <CardContent className="p-6 space-y-8">

              {/* Personal Information */}

              <section className="application-pdf-block">

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

                  <DetailItem label="Address" value={[application.apartment, application.building, application.street, application.area, application.city, application.country].filter(Boolean).join(', ')} icon={MapPin} />

                  <DetailItem label="Contacted By HR" value={application.contactedByHR} icon={Users}/>

                </div>

              </section>

              {/* Emergency Contact */}

              {(application.emergencyContactName || application.emergencyContactRelationship || application.emergencyContactNumber) && (

              <section className="application-pdf-block">

                <h3 className="font-semibold text-lg border-b pb-2 mb-4 flex items-center">

                  <Phone className="mr-2 h-5 w-5 text-primary" /> Emergency Contact

                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">

                  <DetailItem label="Name" value={application.emergencyContactName} icon={User}/>

                  <DetailItem label="Relationship" value={application.emergencyContactRelationship} icon={Users} />

                  <DetailItem label="Phone Number" value={application.emergencyContactNumber} icon={Phone} />

                </div>

              </section>

              )}

               {/* Job Requirements */}

              <section className="application-pdf-block">

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

              <section className="application-pdf-block">

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

              <section className="application-pdf-block">

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

{/* ===== Diplomas & Courses ===== */}

<Card className="mt-6">

  <CardHeader>

    <CardTitle>Diplomas & Courses</CardTitle>

    <CardDescription>

      Professional diplomas and completed courses

    </CardDescription>

  </CardHeader>

  <CardContent>

    {Array.isArray(application.diplomasCourses) && application.diplomasCourses.length > 0 ? (

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {application.diplomasCourses.map((d: any, index: number) => (

          <div

            key={index}

            className="rounded-lg border bg-muted p-4"

            dir="rtl"

          >

            <div className="font-semibold text-base mb-2">

              {d.diploma_name || "-"}

            </div>

            <div className="text-sm text-muted-foreground">

              الجهة: <span className="font-medium">{d.diploma_institution || "-"}</span>

            </div>

            <div className="text-sm mt-1">

              الحالة:{" "}

              <span className="font-medium">

                {d.diploma_completed === "Yes" ? "مكتمل" : "غير مكتمل"}

              </span>

            </div>

          </div>

        ))}

      </div>

    ) : (

      <p className="text-sm text-muted-foreground">

        No diplomas or courses provided.

      </p>

    )}

  </CardContent>

</Card>

              {/* Work Experience */}

              {application.workExperience && application.workExperience.length > 0 && (

                <section className="application-pdf-block">

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

              <section className="application-pdf-block">

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
          </div>
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

    return (

        <PublicLayout>

            <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>

                <ApplicationDetailContent />

            </Suspense>

        </PublicLayout>

    );

}
