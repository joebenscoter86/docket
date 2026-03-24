import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface TrialExhaustedEmailProps {
  invoicesProcessed: number;
}

const BASE_URL = "https://dockett.app";

export function TrialExhaustedEmail({
  invoicesProcessed,
}: TrialExhaustedEmailProps) {
  return (
    <EmailLayout preview="Your Docket trial has ended - choose a plan to continue">
      <Text style={styles.heading}>Your Trial Has Ended</Text>
      <Text style={styles.paragraph}>
        You&apos;ve processed {invoicesProcessed} invoices during your trial.
        Choose a plan to keep going.
      </Text>

      {/* Tier comparison */}
      <table cellPadding="0" cellSpacing="0" style={tiersTable}>
        <tbody>
          <tr>
            <td style={tierCell}>
              <Text style={tierName}>Starter</Text>
              <Text style={tierPrice}>$19/mo</Text>
              <Text style={tierDesc}>75 invoices/mo</Text>
            </td>
            <td style={{ ...tierCell, ...recommendedCell }}>
              <Text style={tierName}>Pro</Text>
              <Text style={tierPrice}>$39/mo</Text>
              <Text style={tierDesc}>150 invoices/mo</Text>
            </td>
            <td style={tierCell}>
              <Text style={tierName}>Growth</Text>
              <Text style={tierPrice}>$99/mo</Text>
              <Text style={tierDesc}>500 invoices/mo</Text>
            </td>
          </tr>
        </tbody>
      </table>

      <PrimaryButton href={`${BASE_URL}/pricing`}>
        Choose a Plan
      </PrimaryButton>

      <Text style={styles.mutedText}>
        All plans include AI extraction, QuickBooks + Xero integration, vendor
        matching, and GL account inference.
      </Text>
    </EmailLayout>
  );
}

const tiersTable = {
  margin: "20px 0",
  width: "100%" as const,
};

const tierCell = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 12px",
  textAlign: "center" as const,
  verticalAlign: "top" as const,
  width: "33%",
};

const recommendedCell = {
  backgroundColor: "#eff6ff",
  border: "2px solid #2563eb",
};

const tierName = {
  color: "#1e293b",
  fontSize: "15px",
  fontWeight: "700" as const,
  lineHeight: "20px",
  margin: "0 0 4px",
};

const tierPrice = {
  color: "#2563eb",
  fontSize: "20px",
  fontWeight: "700" as const,
  lineHeight: "24px",
  margin: "0 0 4px",
};

const tierDesc = {
  color: "#6b7280",
  fontSize: "12px",
  lineHeight: "16px",
  margin: "0",
};

export default TrialExhaustedEmail;
