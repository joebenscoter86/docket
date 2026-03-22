import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface TrialProgressEmailProps {
  invoicesUsed: number;
  invoiceLimit: number;
}

const BASE_URL = "https://dockett.app";

export function TrialProgressEmail({
  invoicesUsed,
  invoiceLimit,
}: TrialProgressEmailProps) {
  const remaining = invoiceLimit - invoicesUsed;

  return (
    <EmailLayout
      preview={`You've processed ${invoicesUsed} of ${invoiceLimit} trial invoices. Like what you see?`}
    >
      <Text style={styles.heading}>
        {invoicesUsed} of {invoiceLimit} Trial Invoices Used
      </Text>
      <Text style={styles.paragraph}>
        You&apos;ve got {remaining}{" "}
        {remaining === 1 ? "invoice" : "invoices"} left in your free trial.
        Like what you see so far?
      </Text>

      <Text style={styles.paragraph}>
        Plans start at <strong>$29/mo</strong> for 75 invoices. All plans
        include AI extraction, vendor matching, GL account inference, and
        QuickBooks + Xero integration.
      </Text>

      <PrimaryButton href={`${BASE_URL}/pricing`}>
        View Plans
      </PrimaryButton>

      <Text style={styles.mutedText}>
        Your extracted data stays safe regardless of whether you upgrade.
      </Text>
    </EmailLayout>
  );
}

export default TrialProgressEmail;
