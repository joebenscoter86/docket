import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface BatchCompleteEmailProps {
  totalCount: number;
  successCount: number;
  failedCount: number;
}

const BASE_URL = "https://dockett.app";

export function BatchCompleteEmail({
  totalCount,
  successCount,
  failedCount,
}: BatchCompleteEmailProps) {
  const allSucceeded = failedCount === 0;

  return (
    <EmailLayout
      preview={`Batch extraction complete: ${successCount} of ${totalCount} invoices ready`}
    >
      <Text style={styles.heading}>Batch Extraction Complete</Text>
      <Text style={styles.paragraph}>
        {allSucceeded
          ? `All ${totalCount} invoices have been extracted and are ready for review.`
          : `${successCount} of ${totalCount} invoices have been extracted. ${failedCount} could not be processed.`}
      </Text>

      {/* Summary */}
      <table cellPadding="0" cellSpacing="0" style={summaryTable}>
        <tbody>
          <tr>
            <td style={statCell}>
              <Text style={statNumber}>{totalCount}</Text>
              <Text style={statLabel}>Uploaded</Text>
            </td>
            <td style={statCell}>
              <Text style={{ ...statNumber, color: "#16a34a" }}>
                {successCount}
              </Text>
              <Text style={statLabel}>Ready</Text>
            </td>
            {failedCount > 0 && (
              <td style={statCell}>
                <Text style={{ ...statNumber, color: "#dc2626" }}>
                  {failedCount}
                </Text>
                <Text style={statLabel}>Failed</Text>
              </td>
            )}
          </tr>
        </tbody>
      </table>

      <PrimaryButton href={`${BASE_URL}/invoices`}>
        Review Invoices
      </PrimaryButton>

      <Text style={styles.mutedText}>
        You can manage email notifications in your{" "}
        <a href={`${BASE_URL}/settings`} style={styles.link}>
          Settings
        </a>
        .
      </Text>
    </EmailLayout>
  );
}

const summaryTable = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  margin: "16px 0",
  padding: "16px",
  textAlign: "center" as const,
  width: "100%" as const,
};

const statCell = {
  padding: "8px 16px",
  textAlign: "center" as const,
};

const statNumber = {
  color: "#1e293b",
  fontSize: "28px",
  fontWeight: "700" as const,
  lineHeight: "32px",
  margin: "0",
};

const statLabel = {
  color: "#6b7280",
  fontSize: "12px",
  lineHeight: "16px",
  margin: "4px 0 0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

export default BatchCompleteEmail;
