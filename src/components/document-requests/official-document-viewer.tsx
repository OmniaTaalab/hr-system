"use client";

import React, { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, CheckCircle, Building, Calendar, FileText, X } from "lucide-react";
import { DocumentRequest } from "@/types/document-request";
import { format } from "date-fns";

interface OfficialDocumentViewerProps {
  request: DocumentRequest | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OfficialDocumentViewer({
  request,
  isOpen,
  onOpenChange,
}: OfficialDocumentViewerProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!request) return null;

  const todayStr = format(new Date(), "MMMM dd, yyyy");
  const requestDateStr = request.createdAt?.seconds
    ? format(new Date(request.createdAt.seconds * 1000), "MMMM dd, yyyy")
    : todayStr;

  const handlePrint = () => {
    window.print();
  };

  const getLetterBody = () => {
    const name = request.employeeName || "Employee";
    const position = request.employeePosition || "Staff Member";
    const campus = request.employeeCampus || request.collectionCampus || "NIS Main Campus";
    const addressedTo = request.addressedTo || "To Whom It May Concern";

    switch (request.documentType) {
      case "Salary Certificate":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This is to officially certify that <strong>{name}</strong> is currently employed by{" "}
              <strong>Nermin Ismail Schools (NIS)</strong> in the capacity of <strong>{position}</strong> at our{" "}
              <strong>{campus}</strong>.
            </p>
            <p>
              According to our official payroll and human resources records, the employee's current monthly remuneration package is structured as follows:
            </p>
            <div className="my-3 border rounded-md overflow-hidden bg-slate-50/50">
              <table className="w-full text-xs text-left">
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70 w-1/2">Position / Title:</td>
                    <td className="p-2 font-semibold text-slate-900">{position}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Assigned Campus:</td>
                    <td className="p-2 font-semibold text-slate-900">{campus}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Basic Monthly Remuneration:</td>
                    <td className="p-2 font-semibold text-slate-900">Standard Educational Scale Tier</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Net Monthly Salary:</td>
                    <td className="p-2 font-semibold text-emerald-700">Verified & In Good Standing</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Social Insurance Status:</td>
                    <td className="p-2 font-semibold text-slate-900">Registered & Fully Insured</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Specific Request Clarification:</strong> {request.requesterNote}
              </p>
            )}
            <p>
              This certificate has been issued upon the request of the employee to be submitted to{" "}
              <strong>{addressedTo}</strong> without any liability or commitment on the part of Nermin Ismail Schools.
            </p>
          </div>
        );

      case "HR Letter":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This letter serves as official verification that <strong>{name}</strong> is a bonafide, active full-time staff member at <strong>Nermin Ismail Schools (NIS)</strong>, holding the position of <strong>{position}</strong> at the <strong>{campus}</strong>.
            </p>
            <p>
              During their employment, {name} has consistently maintained high standards of professional integrity, dedication, and commendable performance in fulfilling institutional responsibilities.
            </p>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Special Inclusions:</strong> {request.requesterNote}
              </p>
            )}
            <p>
              This letter is issued upon the employee's request for presentation to <strong>{addressedTo}</strong>, with no financial or legal obligation upon the school.
            </p>
          </div>
        );

      case "Experience or Employment Letter":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This is to certify that <strong>{name}</strong> is employed with <strong>Nermin Ismail Schools (NIS)</strong>, serving as <strong>{position}</strong> at the <strong>{campus}</strong>.
            </p>
            <p>
              In this role, {name} has demonstrated exemplary professional competence, curriculum mastery, student engagement, and proactive collaboration with colleagues, students, and school leadership.
            </p>
            <p>
              Their conduct and professional ethics have met the highest standards throughout their tenure with our institution. We take pleasure in commending their dedicated services and wish them continued success in all future professional endeavors.
            </p>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Specific Experience Details:</strong> {request.requesterNote}
              </p>
            )}
          </div>
        );

      case "Bank Letter":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              We confirm that <strong>{name}</strong> is currently a full-time employee of <strong>Nermin Ismail Schools (NIS)</strong>, occupying the position of <strong>{position}</strong> at our <strong>{campus}</strong>.
            </p>
            <p>
              Their monthly remuneration is disbursed regularly through our official institutional banking channels on a monthly basis. The employee's status is regular and confirmed.
            </p>
            <p>
              This certification is provided to <strong>{addressedTo}</strong> in connection with banking and credit facilities requested by the employee. Nermin Ismail Schools confirms the accuracy of the employment records as of the date of issuance.
            </p>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Bank Instructions:</strong> {request.requesterNote}
              </p>
            )}
          </div>
        );

      case "Embassy or Visa Letter":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This is to certify that <strong>{name}</strong> is currently employed by <strong>Nermin Ismail Schools (NIS)</strong> as <strong>{position}</strong> at our <strong>{campus}</strong>.
            </p>
            <p>
              We confirm that the employee has officially requested and been granted approved leave for international travel. We further confirm that their employment with Nermin Ismail Schools will continue upon their return, and they will resume their regular duties accordingly.
            </p>
            <p>
              {name} receives an established monthly compensation that ensures their financial independence and stability. All travel expenses will be borne entirely by the employee.
            </p>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Travel / Visa Details:</strong> {request.requesterNote}
              </p>
            )}
            <p>
              This certificate is addressed to <strong>{addressedTo}</strong> for visa processing purposes. Any courtesies extended to our colleague will be highly appreciated.
            </p>
          </div>
        );

      case "Social Insurance Statement":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This official statement certifies that <strong>{name}</strong> is formally enrolled in the Egyptian Social Insurance system under the school's employer insurance file at <strong>Nermin Ismail Schools</strong>.
            </p>
            <div className="my-3 border rounded-md overflow-hidden bg-slate-50/50">
              <table className="w-full text-xs text-left">
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70 w-1/2">Insured Employee:</td>
                    <td className="p-2 font-semibold text-slate-900">{name}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Position Class:</td>
                    <td className="p-2 font-semibold text-slate-900">{position}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Campus Division:</td>
                    <td className="p-2 font-semibold text-slate-900">{campus}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-medium text-slate-600 bg-slate-100/70">Social Insurance Status:</td>
                    <td className="p-2 font-semibold text-emerald-700">Active - Compliant with Law No. 148 of 2019</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Notes:</strong> {request.requesterNote}
              </p>
            )}
          </div>
        );

      case "Pay Slip":
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              Official Pay Slip certification for <strong>{name}</strong> ({position}) at <strong>{campus}</strong>:
            </p>
            <div className="my-3 border rounded-md overflow-hidden bg-slate-50/50">
              <table className="w-full text-xs text-left">
                <tbody>
                  <tr className="border-b bg-slate-100">
                    <th colSpan={2} className="p-2 font-semibold text-slate-800">Earnings & Allowances</th>
                    <th colSpan={2} className="p-2 font-semibold text-slate-800">Deductions</th>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 text-slate-600">Basic Wage</td>
                    <td className="p-2 font-semibold text-slate-900">Standard Tier</td>
                    <td className="p-2 text-slate-600">Social Insurance</td>
                    <td className="p-2 font-semibold text-slate-900">Standard 11%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 text-slate-600">Educational Allowance</td>
                    <td className="p-2 font-semibold text-slate-900">Applied</td>
                    <td className="p-2 text-slate-600">Income Tax</td>
                    <td className="p-2 font-semibold text-slate-900">Statutory Tier</td>
                  </tr>
                  <tr className="bg-emerald-50/70 font-semibold text-emerald-900">
                    <td className="p-2">Net Remuneration</td>
                    <td className="p-2 text-emerald-700" colSpan={3}>Paid to designated payroll bank account</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Pay Slip Notes:</strong> {request.requesterNote}
              </p>
            )}
          </div>
        );

      case "Contract Copy":
      default:
        return (
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This document serves as an official certification that <strong>{name}</strong> is under an active, binding employment contract with <strong>Nermin Ismail Schools (NIS)</strong> in the role of <strong>{position}</strong> assigned to the <strong>{campus}</strong>.
            </p>
            <p>
              The employment agreement complies with Egyptian Labor Law and institutional educational governance standards. The contract remains active and in full force and effect.
            </p>
            {request.requesterNote && (
              <p className="italic text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                <strong>Contract Endorsement Details:</strong> {request.requesterNote}
              </p>
            )}
            <p>
              Issued for formal identification and record purposes upon employee request to <strong>{addressedTo}</strong>.
            </p>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 sm:p-6 bg-slate-100 dark:bg-slate-900">
        <DialogHeader className="p-4 sm:p-0 pb-3 border-b flex flex-row items-center justify-between">
          <div className="space-y-1">
            <DialogTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Official Document Preview & Download
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Tracking Ref: {request.requestNumber} • Status: {request.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1.5 shadow-sm">
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Official Letter Container */}
        <div className="p-4 sm:p-2">
          <div
            ref={printRef}
            id="printable-document-sheet"
            className="bg-white text-slate-900 rounded-lg shadow-sm border border-slate-200 p-8 sm:p-12 space-y-6 mx-auto max-w-[720px] print:m-0 print:p-8 print:shadow-none print:border-none print:max-w-none print:w-full"
          >
            {/* Header / Letterhead */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
                  Nermin Ismail Schools
                </h1>
                <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  Human Resources Department
                </p>
                <p className="text-[11px] text-slate-500">
                  Excellence in Education • Cairo, Egypt
                </p>
              </div>
              <div className="text-right space-y-1">
                <div className="text-lg font-bold text-slate-900" dir="rtl">
                  مدارس نيرمين إسماعيل
                </div>
                <div className="text-xs font-semibold text-slate-600" dir="rtl">
                  إدارة الموارد البشرية
                </div>
                <div className="text-[11px] text-slate-500">
                  {request.collectionCampus || "NIS Main Campus"}
                </div>
              </div>
            </div>

            {/* Document Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1 border-b border-dashed border-slate-200 pb-3">
              <div>
                <strong>Ref No:</strong>{" "}
                <span className="font-mono text-slate-800">
                  NIS/HR/{request.requestNumber || "DOC-2026"}
                </span>
              </div>
              <div>
                <strong>Date:</strong> {todayStr}
              </div>
              <div>
                <strong>Delivery:</strong>{" "}
                {request.deliveryMethod === "soft_copy" ? "Soft Copy (Digital)" : "Hard Copy (Certified)"}
              </div>
            </div>

            {/* Addressed To */}
            <div className="pt-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Addressed To:
              </p>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {request.addressedTo || "TO WHOM IT MAY CONCERN"}
              </h3>
            </div>

            {/* Document Subject / Title */}
            <div className="py-2 text-center border-y border-slate-200 bg-slate-50/60">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                {request.documentType.toUpperCase()}
              </h2>
            </div>

            {/* Dynamic Body Content */}
            <div className="py-2">{getLetterBody()}</div>

            {/* Official Stamps and Signatures Block */}
            <div className="pt-8 mt-6 border-t border-slate-200 grid grid-cols-2 gap-8 items-end">
              {/* Seal block */}
              <div className="space-y-2">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-blue-600/40 flex flex-col items-center justify-center p-2 text-center text-blue-700/80 bg-blue-50/30 select-none">
                  <div className="text-[9px] font-bold uppercase tracking-tighter">NIS Human Resources</div>
                  <div className="text-[14px] font-black my-0.5">★ SEAL ★</div>
                  <div className="text-[8px] tracking-tight text-blue-600">OFFICIAL DOCUMENT</div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Document verified electronically via NIS HR Portal.
                </p>
              </div>

              {/* Signatory block */}
              <div className="text-right space-y-2">
                <div className="h-10 border-b border-slate-400 w-44 ml-auto" />
                <div className="text-xs font-bold text-slate-900">
                  Director of Human Resources
                </div>
                <div className="text-[11px] text-slate-600">
                  Nermin Ismail Schools
                </div>
                <div className="text-[10px] text-slate-500">
                  Issued: {requestDateStr}
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="pt-4 text-center border-t border-slate-100 text-[10px] text-slate-400">
              This document is generated by the NIS HR Portal. Validity can be verified with NIS HR Administration.
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-0 pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            Copies Requested: <strong>{request.numberOfCopies || 1}</strong> • Campus: <strong>{request.collectionCampus}</strong>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Close
            </Button>
            <Button size="sm" onClick={handlePrint} className="flex-1 sm:flex-none gap-1.5">
              <Download className="h-4 w-4" />
              Download / Print PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
