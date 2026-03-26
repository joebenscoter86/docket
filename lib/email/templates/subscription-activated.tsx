import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface SubscriptionActivatedEmailProps {
  tierName: string;
  monthlyPrice: string;
  invoiceCap: number;
}

const BASE_URL = "https://dockett.app";

export function SubscriptionActivatedEmail({
  tierName,
  monthlyPrice,
  invoiceCap,
}: SubscriptionActivatedEmailProps) {
  return (
    <EmailLayout preview={`Your Dockett ${tierName} plan is active`}>
      <Text style={styles.heading}>Subscription Activated</Text>
      <Text style={styles.paragraph}>
        Your {tierName} plan is now active. Here are your plan details:
      </Text>

      {/* Plan details */}
      <table cellPadding="0" cellSpacing="0" style={detailsTable}>
        <tbody>
          <tr>
            <td style={labelCell}>Plan</td>
            <td style={valueCell}>{tierName}</td>
          </tr>
          <tr>
            <td style={labelCell}>Price</td>
            <td style={valueCell}>{monthlyPrice}</td>
          </tr>
          <tr>
            <td style={labelCell}>Invoice limit</td>
            <td style={valueCell}>{invoiceCap} invoices/month</td>
          </tr>
        </tbody>
      </table>

      <Text style={styles.paragraph}>
        You can manage your subscription, update payment methods, or change
        plans anytime from your Settings page.
      </Text>

      <PrimaryButton href={`${BASE_URL}/invoices`}>
        Go to Dashboard
      </PrimaryButton>

      <Text style={styles.mutedText}>
        Manage billing in your{" "}
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
  width: "100px",
};

const valueCell = {
  color: "#1e293b",
  fontSize: "14px",
  padding: "4px 0",
  verticalAlign: "top" as const,
};

export default SubscriptionActivatedEmail;
