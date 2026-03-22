import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface SyncSuccessEmailProps {
  invoiceFileName: string;
  vendorName: string;
  totalAmount: string;
  provider: "quickbooks" | "xero";
  providerBillId: string;
}

const BASE_URL = "https://dockett.app";

const providerNames = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
};

export function SyncSuccessEmail({
  invoiceFileName,
  vendorName,
  totalAmount,
  provider,
  providerBillId,
}: SyncSuccessEmailProps) {
  return (
    <EmailLayout
      preview={`Invoice synced to ${providerNames[provider]}: ${vendorName} - ${totalAmount}`}
    >
      <Text style={styles.heading}>Invoice Synced Successfully</Text>
      <Text style={styles.paragraph}>
        Your invoice has been pushed to {providerNames[provider]}.
      </Text>

      {/* Invoice details */}
      <table cellPadding="0" cellSpacing="0" style={detailsTable}>
        <tbody>
          <tr>
            <td style={labelCell}>File</td>
            <td style={valueCell}>{invoiceFileName}</td>
          </tr>
          <tr>
            <td style={labelCell}>Vendor</td>
            <td style={valueCell}>{vendorName}</td>
          </tr>
          <tr>
            <td style={labelCell}>Amount</td>
            <td style={valueCell}>{totalAmount}</td>
          </tr>
          <tr>
            <td style={labelCell}>Provider</td>
            <td style={valueCell}>{providerNames[provider]}</td>
          </tr>
          <tr>
            <td style={labelCell}>Bill ID</td>
            <td style={valueCell}>{providerBillId}</td>
          </tr>
        </tbody>
      </table>

      <PrimaryButton href={`${BASE_URL}/invoices`}>
        View Invoices
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

const detailsTable = {
  backgroundColor: "#f0fdf4",
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

export default SyncSuccessEmail;
