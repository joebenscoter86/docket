import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface ExtractionCompleteEmailProps {
  invoiceFileName: string;
  vendorName: string | null;
  totalAmount: string | null;
  confidence: "high" | "medium" | "low";
  reviewUrl: string;
}

const BASE_URL = "https://dockett.app";

export function ExtractionCompleteEmail({
  invoiceFileName,
  vendorName,
  totalAmount,
  confidence,
  reviewUrl,
}: ExtractionCompleteEmailProps) {
  const confidenceLabel =
    confidence === "high"
      ? "High confidence"
      : confidence === "medium"
        ? "Medium confidence"
        : "Low confidence - review recommended";

  return (
    <EmailLayout preview={`Invoice extracted: ${vendorName || invoiceFileName}`}>
      <Text style={styles.heading}>Invoice Ready for Review</Text>
      <Text style={styles.paragraph}>
        Your invoice has been processed and is ready for review.
      </Text>

      {/* Invoice details */}
      <table cellPadding="0" cellSpacing="0" style={detailsTable}>
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
          {totalAmount && (
            <tr>
              <td style={labelCell}>Amount</td>
              <td style={valueCell}>{totalAmount}</td>
            </tr>
          )}
          <tr>
            <td style={labelCell}>Confidence</td>
            <td style={valueCell}>{confidenceLabel}</td>
          </tr>
        </tbody>
      </table>

      <PrimaryButton href={`${BASE_URL}${reviewUrl}`}>
        Review Invoice
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

export default ExtractionCompleteEmail;
