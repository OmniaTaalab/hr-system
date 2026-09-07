"use server";

import { z } from "zod";
import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  limit,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { render } from "@react-email/components";
import { DocumentRequestNotificationEmail } from "@/emails/document-request-notification";
import { logSystemEvent } from "@/lib/system-log";
import {
  DOCUMENT_REQUEST_TYPES,
  DOCUMENT_STATUSES,
  DocumentRequestType,
  DocumentRequestStatus,
  DeliveryMethod,
} from "@/types/document-request";

export type DocumentRequestFormState = {
  errors?: {
    documentType?: string[];
    numberOfCopies?: string[];
    deliveryMethod?: string[];
    collectionCampus?: string[];
    requesterNote?: string[];
    rejectionReason?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  requestId?: string;
};

const SubmitDocumentRequestSchema = z.object({
  documentType: z.enum(DOCUMENT_REQUEST_TYPES as unknown as [string, ...string[]]),
  numberOfCopies: z.coerce.number().min(1).max(10).default(1),
  deliveryMethod: z.enum(["soft_copy", "hard_copy"]),
  collectionCampus: z.string().min(1, "Collection campus is required."),
  requesterNote: z.string().optional().nullable(),
  addressedTo: z.string().optional().nullable(),
  requestingEmployeeDocId: z.string().min(1, "Employee profile is required."),
  employeeId: z.string().optional().nullable(),
  employeeName: z.string().min(1, "Employee name is required."),
  employeeEmail: z.string().email("Valid employee email is required."),
  employeeCampus: z.string().optional().nullable(),
  employeeDivision: z.string().optional().nullable(),
  employeePosition: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  actorId: z.string().optional().nullable(),
  actorEmail: z.string().optional().nullable(),
  actorRole: z.string().optional().nullable(),
});

export async function submitDocumentRequestAction(
  prevState: DocumentRequestFormState,
  formData: FormData
): Promise<DocumentRequestFormState> {
  const rawData = {
    documentType: formData.get("documentType") as string,
    numberOfCopies: formData.get("numberOfCopies") as string,
    deliveryMethod: formData.get("deliveryMethod") as string,
    collectionCampus: formData.get("collectionCampus") as string,
    requesterNote: formData.get("requesterNote") as string | null,
    addressedTo: formData.get("addressedTo") as string | null,
    requestingEmployeeDocId: formData.get("requestingEmployeeDocId") as string,
    employeeId: formData.get("employeeId") as string | null,
    employeeName: formData.get("employeeName") as string,
    employeeEmail: formData.get("employeeEmail") as string,
    employeeCampus: formData.get("employeeCampus") as string | null,
    employeeDivision: formData.get("employeeDivision") as string | null,
    employeePosition: formData.get("employeePosition") as string | null,
    userId: formData.get("userId") as string | null,
    actorId: formData.get("actorId") as string | null,
    actorEmail: formData.get("actorEmail") as string | null,
    actorRole: formData.get("actorRole") as string | null,
  };

  const validated = SubmitDocumentRequestSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      message: "Please correct the errors in the form.",
      success: false,
    };
  }

  const {
    documentType,
    numberOfCopies,
    deliveryMethod,
    collectionCampus,
    requesterNote,
    addressedTo,
    requestingEmployeeDocId,
    employeeId,
    employeeName,
    employeeEmail,
    employeeCampus,
    employeeDivision,
    employeePosition,
    userId,
    actorId,
    actorEmail,
    actorRole,
  } = validated.data;

  try {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const requestNumber = `DOC-${year}-${randomSuffix}`;

    const docData = {
      requestNumber,
      documentType: documentType as DocumentRequestType,
      numberOfCopies,
      deliveryMethod: deliveryMethod as DeliveryMethod,
      collectionCampus,
      requesterNote: requesterNote?.trim() || "",
      addressedTo: addressedTo?.trim() || "",
      requestingEmployeeDocId,
      employeeId: employeeId || "",
      employeeName,
      employeeEmail,
      employeeCampus: employeeCampus || collectionCampus,
      employeeDivision: employeeDivision || "",
      employeePosition: employeePosition || "",
      userId: userId || "",
      status: "Submitted" as DocumentRequestStatus,
      statusHistory: [
        {
          status: "Submitted" as DocumentRequestStatus,
          timestamp: new Date().toISOString(),
          updatedBy: employeeName,
          notes: "Document request submitted by employee.",
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "documentRequests"), docData);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const hrQueueLink = `${appUrl}/document-requests?tab=queue&id=${docRef.id}`;

    // 1. Send in-app notification to all HR / Admin users
    try {
      await addDoc(collection(db, "notifications"), {
        message: `New Document Request: ${documentType} from ${employeeName} (${requestNumber}).`,
        link: hrQueueLink,
        createdAt: serverTimestamp(),
        readBy: [],
      });
    } catch (notifErr) {
      console.warn("Could not write global notification:", notifErr);
    }

    // 2. Dispatch email to HR team
    try {
      // Find HR users to email
      const hrQuery = query(
        collection(db, "employee"),
        where("role", "in", ["hr", "admin"]),
        limit(5)
      );
      const hrSnapshot = await getDocs(hrQuery);
      const targetEmails = new Set<string>();

      hrSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.nisEmail && data.nisEmail.includes("@")) {
          targetEmails.add(data.nisEmail.trim());
        } else if (data.email && data.email.includes("@")) {
          targetEmails.add(data.email.trim());
        }
      });

      // Default HR fallback if none found
      if (targetEmails.size === 0) {
        targetEmails.add("hr@nis.edu.eg");
      }

      for (const hrEmail of targetEmails) {
        const emailHtml = render(
          DocumentRequestNotificationEmail({
            recipientName: "HR Team",
            isForHr: true,
            employeeName,
            documentType,
            requestNumber,
            status: "Submitted",
            numberOfCopies,
            deliveryMethod,
            collectionCampus,
            requesterNote: requesterNote || undefined,
            actionLink: hrQueueLink,
          })
        );

        await addDoc(collection(db, "mail"), {
          to: hrEmail,
          message: {
            subject: `New Document Request: ${documentType} - ${employeeName} (${requestNumber})`,
            html: emailHtml,
          },
          status: "pending",
          createdAt: serverTimestamp(),
        });
      }
    } catch (emailErr) {
      console.warn("Could not queue HR notification email:", emailErr);
    }

    // 3. Log system event
    await logSystemEvent("Submit Document Request", {
      actorId: actorId || userId,
      actorEmail: actorEmail || employeeEmail,
      actorRole: actorRole || "employee",
      documentRequestId: docRef.id,
      requestNumber,
      documentType,
      employeeName,
      deliveryMethod,
    });

    return {
      success: true,
      message: `Document request ${requestNumber} submitted successfully! HR has been notified.`,
      requestId: docRef.id,
    };
  } catch (error: any) {
    console.error("Error submitting document request:", error);
    return {
      errors: { form: [error.message || "Failed to submit document request."] },
      message: error.message || "Failed to submit document request.",
      success: false,
    };
  }
}

const UpdateDocumentRequestStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  newStatus: z.enum(DOCUMENT_STATUSES as unknown as [string, ...string[]]),
  rejectionReason: z.string().optional().nullable(),
  hrNotes: z.string().optional().nullable(),
  collectionRoomOrDesk: z.string().optional().nullable(),
  actorId: z.string().optional().nullable(),
  actorEmail: z.string().optional().nullable(),
  actorRole: z.string().optional().nullable(),
  actorName: z.string().optional().nullable(),
});

export async function updateDocumentRequestStatusAction(
  prevState: DocumentRequestFormState,
  formData: FormData
): Promise<DocumentRequestFormState> {
  const rawData = {
    requestId: formData.get("requestId") as string,
    newStatus: formData.get("newStatus") as string,
    rejectionReason: formData.get("rejectionReason") as string | null,
    hrNotes: formData.get("hrNotes") as string | null,
    collectionRoomOrDesk: formData.get("collectionRoomOrDesk") as string | null,
    actorId: formData.get("actorId") as string | null,
    actorEmail: formData.get("actorEmail") as string | null,
    actorRole: formData.get("actorRole") as string | null,
    actorName: formData.get("actorName") as string | null,
  };

  const validated = UpdateDocumentRequestStatusSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const {
    requestId,
    newStatus,
    rejectionReason,
    hrNotes,
    collectionRoomOrDesk,
    actorId,
    actorEmail,
    actorRole,
    actorName,
  } = validated.data;

  // STRICT REQUIREMENT: Rejection requires a reason!
  if (newStatus === "Rejected" && (!rejectionReason || !rejectionReason.trim())) {
    return {
      errors: {
        rejectionReason: ["Rejection reason is mandatory when rejecting a document request."],
      },
      message: "Rejection requires a reason.",
      success: false,
    };
  }

  try {
    const docRef = doc(db, "documentRequests", requestId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        errors: { form: ["Document request not found."] },
        message: "Document request not found.",
        success: false,
      };
    }

    const requestData = docSnap.data();
    const isRejected = newStatus === "Rejected";
    const isIssuedOrReady =
      newStatus === "Issued" || newStatus === "Ready for Collection";

    const reviewerTag = actorName || actorEmail || "HR Department";

    const historyEntry = {
      status: newStatus as DocumentRequestStatus,
      timestamp: new Date().toISOString(),
      updatedBy: reviewerTag,
      notes: isRejected
        ? rejectionReason?.trim()
        : hrNotes?.trim() || `Status updated to ${newStatus}`,
      rejectionReason: isRejected ? rejectionReason?.trim() : undefined,
    };

    const updatePayload: Record<string, any> = {
      status: newStatus,
      reviewedBy: actorEmail || "HR",
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion(historyEntry),
    };

    if (isRejected) {
      updatePayload.rejectionReason = rejectionReason?.trim() || "";
    }

    if (hrNotes?.trim()) {
      updatePayload.hrNotes = hrNotes.trim();
    }

    if (isIssuedOrReady) {
      updatePayload.issuedDocument = {
        fileName: `${requestData.documentType.replace(/\s+/g, "_")}_${requestData.requestNumber || requestId}.pdf`,
        issuedAt: new Date().toISOString(),
        issuedBy: reviewerTag,
        collectionRoomOrDesk: collectionRoomOrDesk?.trim() || "HR Office",
      };
    }

    await updateDoc(docRef, updatePayload);

    // 1. Notify employee via In-App Notification
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const employeeLink = `${appUrl}/document-requests?tab=my&id=${requestId}`;

    const employeeUserId = requestData.userId;
    const employeeEmail = requestData.employeeEmail;
    const employeeName = requestData.employeeName;

    const notifMessage = isRejected
      ? `Your document request for ${requestData.documentType} was rejected. Reason: ${rejectionReason}`
      : `Your document request for ${requestData.documentType} is now ${newStatus}.`;

    if (employeeUserId) {
      try {
        await addDoc(collection(db, `users/${employeeUserId}/notifications`), {
          message: notifMessage,
          link: employeeLink,
          createdAt: serverTimestamp(),
          isRead: false,
        });
      } catch (userNotifErr) {
        console.warn("Could not write employee user notification:", userNotifErr);
      }
    }

    // 2. Dispatch Email to Employee
    if (employeeEmail && employeeEmail.includes("@")) {
      try {
        const emailHtml = render(
          DocumentRequestNotificationEmail({
            recipientName: employeeName,
            isForHr: false,
            employeeName,
            documentType: requestData.documentType,
            requestNumber: requestData.requestNumber,
            status: newStatus,
            numberOfCopies: requestData.numberOfCopies || 1,
            deliveryMethod: requestData.deliveryMethod,
            collectionCampus: requestData.collectionCampus,
            requesterNote: requestData.requesterNote,
            rejectionReason: isRejected ? rejectionReason?.trim() : undefined,
            hrNotes: hrNotes?.trim() || (isIssuedOrReady && collectionRoomOrDesk ? `Collection point: ${collectionRoomOrDesk}` : undefined),
            actionLink: employeeLink,
          })
        );

        await addDoc(collection(db, "mail"), {
          to: employeeEmail,
          message: {
            subject: `Document Request Update: ${requestData.documentType} is ${newStatus}`,
            html: emailHtml,
          },
          status: "pending",
          createdAt: serverTimestamp(),
        });
      } catch (mailErr) {
        console.warn("Could not queue employee notification email:", mailErr);
      }
    }

    // 3. Log system event
    await logSystemEvent("Update Document Request Status", {
      actorId,
      actorEmail,
      actorRole,
      requestId,
      newStatus,
      rejectionReason: isRejected ? rejectionReason : undefined,
    });

    return {
      success: true,
      message: `Document request status successfully updated to "${newStatus}". Employee has been notified.`,
      requestId,
    };
  } catch (error: any) {
    console.error("Error updating document request status:", error);
    return {
      errors: { form: [error.message || "Failed to update status."] },
      message: error.message || "Failed to update status.",
      success: false,
    };
  }
}

export async function deleteDocumentRequestAction(
  requestId: string,
  actorInfo: { id?: string; email?: string; role?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = doc(db, "documentRequests", requestId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, message: "Document request not found." };
    }

    const data = snap.data();
    // Only allow deletion if Submitted or if HR/Admin
    const isHrOrAdmin = actorInfo.role === "hr" || actorInfo.role === "admin";
    if (!isHrOrAdmin && data.status !== "Submitted") {
      return {
        success: false,
        message: "You can only cancel requests that are still in 'Submitted' status.",
      };
    }

    await updateDoc(docRef, {
      status: "Closed",
      isCancelled: true,
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion({
        status: "Closed",
        timestamp: new Date().toISOString(),
        updatedBy: actorInfo.email || "Requester",
        notes: "Request cancelled / closed.",
      }),
    });

    await logSystemEvent("Cancel Document Request", {
      actorId: actorInfo.id,
      actorEmail: actorInfo.email,
      actorRole: actorInfo.role,
      requestId,
    });

    return { success: true, message: "Document request cancelled successfully." };
  } catch (err: any) {
    console.error("Error cancelling document request:", err);
    return { success: false, message: err.message || "Failed to cancel request." };
  }
}
