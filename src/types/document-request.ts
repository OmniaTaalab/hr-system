import { Timestamp } from "firebase/firestore";

export const DOCUMENT_REQUEST_TYPES = [
  "HR Letter",
  "Social Insurance Statement",
  "Pay Slip",
  "Contract Copy",
] as const;

export type DocumentRequestType = typeof DOCUMENT_REQUEST_TYPES[number];

export const DOCUMENT_REQUEST_TYPE_DETAILS: Record<
  DocumentRequestType,
  {
    arName: string;
    description: string;
    commonAddressedTo: string[];
    suggestedNotesPlaceholder: string;
  }
> = {
 
  "HR Letter": {
    arName: "خطاب الموارد البشرية",
    description: "General letter confirming current employment, job title, and good standing with the school.",
    commonAddressedTo: ["To Whom It May Concern", "Club Membership Committee", "School / University", "Embassy"],
    suggestedNotesPlaceholder: "State the specific entity this letter should be directed to...",
  },
  

 
  "Social Insurance Statement": {
    arName: "برنت تأمينات / بيان تأميني",
    description: "Statement of social insurance registration number and insurance wage details.",
    commonAddressedTo: ["Social Insurance Authority", "Bank / Mortgage", "To Whom It May Concern"],
    suggestedNotesPlaceholder: "Add your National ID or social insurance number if known...",
  },
  "Pay Slip": {
    arName: "مفردات مرتب / إيصال الدفع",
    description: "Official itemized breakdown of salary, standard allowances, deductions, and net amount.",
    commonAddressedTo: ["To Whom It May Concern", "Rental / Housing Office", "Financial Institution"],
    suggestedNotesPlaceholder: "Specify month(s) required (e.g., Last 3 months)...",
  },
  "Contract Copy": {
    arName: "نسخة من العقد",
    description: "Certified copy or endorsement of your employment contract with Nermin Ismail Schools.",
    commonAddressedTo: ["Personal Records", "Legal Entity", "To Whom It May Concern"],
    suggestedNotesPlaceholder: "Note any specific certified stamp or urgent timeline requirements...",
  },
};

export type DeliveryMethod = "soft_copy" | "hard_copy";

export const DOCUMENT_STATUSES = [
  "Submitted",
  "Under HR Review",
  "Approved",
  "Rejected",
  "Ready for Collection",
  "Issued",
  "Closed",
] as const;

export type DocumentRequestStatus = typeof DOCUMENT_STATUSES[number];

export interface StatusHistoryEntry {
  status: DocumentRequestStatus;
  timestamp: Timestamp | { seconds: number; nanoseconds: number } | string;
  updatedBy: string;
  notes?: string;
  rejectionReason?: string;
}

export interface IssuedDocumentInfo {
  fileName: string;
  fileUrl?: string;
  issuedAt: Timestamp | { seconds: number; nanoseconds: number } | string;
  issuedBy: string;
  generatedHtml?: string;
  collectionRoomOrDesk?: string;
}

export interface DocumentRequest {
  id: string;
  requestNumber: string;
  documentType: DocumentRequestType;
  numberOfCopies: number;
  deliveryMethod: DeliveryMethod;
  collectionCampus: string;
  requesterNote?: string;
  addressedTo?: string;

  // Requester details
  requestingEmployeeDocId: string;
  employeeId?: string;
  employeeName: string;
  employeeEmail: string;
  employeeCampus?: string;
  employeeDivision?: string;
  employeePosition?: string;
  userId?: string;

  // Status flow
  status: DocumentRequestStatus;
  rejectionReason?: string;
  hrNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  statusHistory?: StatusHistoryEntry[];
  issuedDocument?: IssuedDocumentInfo;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
