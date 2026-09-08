import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface DocumentRequestEmailProps {
  recipientName: string;
  isForHr: boolean;
  employeeName: string;
  documentType: string;
  requestNumber?: string;
  status: string;
  numberOfCopies: number;
  deliveryMethod: string;
  collectionCampus?: string;
  requesterNote?: string;
  rejectionReason?: string;
  hrNotes?: string;
  actionLink?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const DocumentRequestNotificationEmail = ({
  recipientName,
  isForHr,
  employeeName,
  documentType,
  requestNumber,
  status,
  numberOfCopies,
  deliveryMethod,
  collectionCampus,
  requesterNote,
  rejectionReason,
  hrNotes,
  actionLink,
}: DocumentRequestEmailProps) => {
  const previewText = isForHr
    ? `New Document Request: ${documentType} from ${employeeName}`
    : `Document Request Update: ${documentType} is ${status}`;

  const isRejected = status.toLowerCase() === "rejected";
  const isApproved = status.toLowerCase() === "approved";
  const isReady = status.toLowerCase().includes("ready") || status.toLowerCase() === "issued";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`${baseUrl}/nis_logo.png`}
            width="56"
            height="56"
            alt="NIS HR Portal"
            style={logo}
          />
          <Text style={paragraph}>Dear {recipientName || "Colleague"},</Text>
          
          {isForHr ? (
            <Text style={paragraph}>
              A new document request has been submitted by <strong>{employeeName}</strong> and is awaiting HR review.
            </Text>
          ) : (
            <Text style={paragraph}>
              Your document request <strong>{requestNumber ? `(${requestNumber})` : ""}</strong> has been updated to:{" "}
              <strong
                style={{
                  color: isRejected ? "#dc2626" : isApproved || isReady ? "#16a34a" : "#2563eb",
                }}
              >
                {status}
              </strong>.
            </Text>
          )}

          <Section style={reviewSection}>
            <Text style={reviewHeader}>Request Summary</Text>
            {requestNumber && (
              <Text style={reviewItem}>
                <strong>Tracking No:</strong> {requestNumber}
              </Text>
            )}
            <Text style={reviewItem}>
              <strong>Document Type:</strong> {documentType}
            </Text>
            <Text style={reviewItem}>
              <strong>Employee:</strong> {employeeName}
            </Text>
            <Text style={reviewItem}>
              <strong>Number of Copies:</strong> {numberOfCopies}
            </Text>
            <Text style={reviewItem}>
              <strong>Delivery Method:</strong>{" "}
              {deliveryMethod === "soft_copy" ? "Soft Copy by Email" : "Hard Copy for Campus Collection"}
            </Text>
            {deliveryMethod === "hard_copy" && collectionCampus && (
              <Text style={reviewItem}>
                <strong>Collection Campus:</strong> {collectionCampus}
              </Text>
            )}
            {requesterNote && (
              <Text style={reviewItem}>
                <strong>Requester Note:</strong> {requesterNote}
              </Text>
            )}

            {isRejected && rejectionReason && (
              <Section style={rejectionBox}>
                <Text style={rejectionText}>
                  <strong>Rejection Reason:</strong> {rejectionReason}
                </Text>
              </Section>
            )}

            {hrNotes && (
              <Text style={reviewItem}>
                <strong>HR Instructions / Note:</strong> {hrNotes}
              </Text>
            )}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Nermin Ismail Schools - Human Resources Portal. For inquiries, please contact the HR office at your campus.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default DocumentRequestNotificationEmail;

const main = {
  backgroundColor: "#f8fafc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "32px 24px 48px",
  maxWidth: "580px",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
};

const logo = {
  margin: "0 auto 16px",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#334155",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0 16px",
};

const footer = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "18px",
  textAlign: "center" as const,
};

const reviewSection = {
  padding: "16px 20px",
  backgroundColor: "#f1f5f9",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  margin: "20px 0",
};

const reviewHeader = {
  fontSize: "15px",
  fontWeight: "bold" as const,
  marginBottom: "10px",
  color: "#0f172a",
};

const reviewItem = {
  fontSize: "14px",
  lineHeight: "22px",
  margin: "4px 0",
  color: "#334155",
};

const rejectionBox = {
  marginTop: "10px",
  padding: "10px 14px",
  backgroundColor: "#fee2e2",
  borderRadius: "6px",
  border: "1px solid #fca5a5",
};

const rejectionText = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#b91c1c",
  margin: 0,
};
