import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface PostTrialFollowupEmailProps {
  /** Which email in the sequence: 1 (Day 3), 2 (Day 7), or 3 (Day 14) */
  sequenceNumber: 1 | 2 | 3;
  invoicesProcessed: number;
}

const BASE_URL = "https://dockett.app";

export function PostTrialFollowupEmail({
  sequenceNumber,
  invoicesProcessed,
}: PostTrialFollowupEmailProps) {
  if (sequenceNumber === 1) {
    return (
      <EmailLayout preview="Your extracted data is still here. Pick up where you left off.">
        <Text style={styles.heading}>Your Data Is Still Here</Text>
        <Text style={styles.paragraph}>
          You processed {invoicesProcessed} invoices during your trial, and all
          that extracted data is waiting for you. Upgrade to keep going.
        </Text>

        <Text style={styles.paragraph}>
          Plans start at <strong>$19/mo</strong> for 75 invoices. No setup
          fees, cancel anytime.
        </Text>

        <PrimaryButton href={`${BASE_URL}/pricing`}>
          Upgrade Now
        </PrimaryButton>
      </EmailLayout>
    );
  }

  if (sequenceNumber === 2) {
    return (
      <EmailLayout preview="Still entering invoices by hand? There's a faster way.">
        <Text style={styles.heading}>Still Entering Invoices by Hand?</Text>
        <Text style={styles.paragraph}>
          Every invoice you type manually is time you could spend running your
          business. Dockett extracts vendor details, line items, and totals in
          seconds, then syncs to QuickBooks or Xero with one click.
        </Text>

        <Text style={styles.paragraph}>
          You already processed {invoicesProcessed} invoices during your trial.
          Pick up where you left off.
        </Text>

        <PrimaryButton href={`${BASE_URL}/pricing`}>
          View Plans Starting at $19/mo
        </PrimaryButton>
      </EmailLayout>
    );
  }

  // sequenceNumber === 3
  return (
    <EmailLayout preview="Last chance: your Dockett trial data will be archived soon.">
      <Text style={styles.heading}>Last Chance to Keep Your Data Active</Text>
      <Text style={styles.paragraph}>
        Your {invoicesProcessed} extracted invoices are still saved, but
        they&apos;ll be archived if you don&apos;t upgrade. Choose a plan to
        keep your data active and process new invoices.
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
        All plans include AI extraction, vendor matching, GL inference,
        and QuickBooks + Xero integration.
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

export default PostTrialFollowupEmail;
