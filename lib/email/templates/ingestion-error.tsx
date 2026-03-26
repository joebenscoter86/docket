import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

const BASE_URL = "https://dockett.app";

interface IngestionErrorEmailProps {
  type: "invalid_attachments" | "billing" | "usage_limit" | "extraction_failed";
  emailSubject: string;
  message: string;
}

const nextStepsByType: Record<IngestionErrorEmailProps["type"], string> = {
  invalid_attachments: "Try uploading the file manually in Dockett.",
  billing: "Update your subscription to continue processing.",
  usage_limit: "Upgrade your plan to process more invoices.",
  extraction_failed: "Review the invoice manually in Dockett.",
};

const buttonDestinationByType: Record<IngestionErrorEmailProps["type"], string> = {
  invalid_attachments: "/invoices",
  billing: "/settings",
  usage_limit: "/settings",
  extraction_failed: "/invoices",
};

export function IngestionErrorEmail({ type, emailSubject, message }: IngestionErrorEmailProps) {
  const nextStep = nextStepsByType[type];
  const destination = buttonDestinationByType[type];

  return (
    <EmailLayout preview="There was an issue processing your forwarded invoice">
      <Text style={styles.heading}>Email Ingestion Issue</Text>
      <Text style={styles.paragraph}>
        We ran into a problem processing your forwarded email. Here are the details:
      </Text>

      <table cellPadding="0" cellSpacing="0" style={detailsTable}>
        <tbody>
          <tr>
            <td style={labelCell}>Email</td>
            <td style={valueCell}>{emailSubject}</td>
          </tr>
          <tr>
            <td style={labelCell}>Issue</td>
            <td style={valueCell}>{message}</td>
          </tr>
        </tbody>
      </table>

      <Text style={styles.paragraph}>{nextStep}</Text>

      <PrimaryButton href={`${BASE_URL}${destination}`}>Go to Dockett</PrimaryButton>

      <Text style={styles.mutedText}>
        You can manage email notifications in your{" "}
        <a href={`${BASE_URL}/settings`} style={styles.link}>Settings</a>.
      </Text>
    </EmailLayout>
  );
}

const detailsTable = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  width: "100%" as const,
  margin: "16px 0",
};

const labelCell = {
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: "600" as const,
  padding: "4px 12px 4px 0",
  verticalAlign: "top" as const,
  width: "80px",
};

const valueCell = {
  color: "#1e293b",
  fontSize: "14px",
  padding: "4px 0",
  verticalAlign: "top" as const,
};

export default IngestionErrorEmail;
