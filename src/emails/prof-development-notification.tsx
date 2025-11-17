

import {
  Body,
  Button,
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

interface ProfDevelopmentNotificationEmailProps {
  managerName?: string;
  employeeName: string;
  courseName: string;
  date: string;
  submissionLink: string;
  reason?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const ProfDevelopmentNotificationEmail = ({
  managerName,
  employeeName,
  courseName,
  date,
  submissionLink,
  reason,
}: ProfDevelopmentNotificationEmailProps) => (
  <Html>
    <Head />
    <Preview>New Professional Development Submission for Review</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${baseUrl}/nis_logo.png`}
          width="48"
          height="48"
          alt="HR System"
          style={logo}
        />
        <Text style={paragraph}>Hi {managerName || "Manager"},</Text>
        <Text style={paragraph}>
          A new professional development entry has been submitted by {" "}
          <strong>{employeeName}</strong> and is ready for your review.
        </Text>
        <Section style={reviewSection}>
            <Text style={reviewHeader}>Submission Details:</Text>
            <Text style={reviewItem}><strong>Employee:</strong> {employeeName}</Text>
            <Text style={reviewItem}><strong>Course/Training:</strong> {courseName}</Text>
            <Text style={reviewItem}><strong>Date:</strong> {date}</Text>
             {reason && <Text style={reviewItem}><strong>Notes:</strong> {reason}</Text>}
        </Section>
        <Section style={btnContainer}>
          <Button style={button} href={submissionLink}>
            Review Submission
          </Button>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>
          This email was sent from the HR Assistant system. You can view the submission details in the employee's profile.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ProfDevelopmentNotificationEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "580px",
};

const logo = {
  margin: "0 auto",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
};

const btnContainer = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const button = {
  backgroundColor: "#465975",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 20px",
};

const hr = {
  borderColor: "#cccccc",
  margin: "20px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
};

const reviewSection = {
    padding: '16px',
    backgroundColor: '#f2f3f4',
    borderRadius: '5px',
    border: '1px solid #e2e8f0',
};

const reviewHeader = {
    fontSize: "14px",
    fontWeight: "bold" as const,
    marginBottom: '12px',
}

const reviewItem = {
    fontSize: "14px",
    lineHeight: "22px",
    margin: '4px 0',
}
