import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface SyncFailureEmailProps {
  invoiceFileName: string;
  vendorName: string | null;
  provider: "quickbooks" | "xero";
  errorMessage: string;
  reviewUrl: string;
}

const BASE_URL = "https://dockett.app";

const providerNames = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
};

export function SyncFailureEmail({
  invoiceFileName,
  vendorName,
  provider,
  errorMessage,
  reviewUrl,
}: SyncFailureEmailProps) {
  return (
    <EmailLayout
      preview={`Sync failed: ${vendorName || invoiceFileName} to ${providerNames[provider]}`}
    >
      <Text style={styles.heading}>Invoice Sync Failed</Text>
      <Text style={styles.paragraph}>
        We were unable to sync your invoice to {providerNames[provider]}.
      </Text>

      {/* Error details */}
      <table cellPadding="0" cellSpacing="0" style={errorTable}>
        <tbody>
          <tr>
            <td style={labelCell}>File</td>
            <td style={valueCell}>{invoiceFileName}</td>
          </tr>
          {vendorName && (
            <tr>
              <td style={labelCell}>Vendor</td>
              <td style={valueCell}>{vendorName}</td>
            </tr>
          )}
          <tr>
            <td style={labelCell}>Error</td>
            <td style={errorValueCell}>{errorMessage}</td>
          </tr>
        </tbody>
      </table>

      <Text style={styles.paragraph}>
        You can retry the sync from the invoice review page, or reach out to us
        if the issue persists.
      </Text>

      <PrimaryButton href={`${BASE_URL}${reviewUrl}`}>
        Retry Sync
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

const errorTable = {
  backgroundColor: "#fef2f2",
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

const errorValueCell = {
  ...valueCell,
  color: "#dc2626",
};

export default SyncFailureEmail;
