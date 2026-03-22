import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface NoSyncNudgeEmailProps {
  extractedCount: number;
}

const BASE_URL = "https://dockett.app";

export function NoSyncNudgeEmail({ extractedCount }: NoSyncNudgeEmailProps) {
  return (
    <EmailLayout preview={`You've extracted ${extractedCount} invoices but haven't synced any yet.`}>
      <Text style={styles.heading}>Ready to Sync?</Text>
      <Text style={styles.paragraph}>
        You&apos;ve extracted data from {extractedCount}{" "}
        {extractedCount === 1 ? "invoice" : "invoices"}, but haven&apos;t
        synced any to your accounting software yet.
      </Text>

      <Text style={styles.paragraph}>
        Connect QuickBooks Online or Xero in Settings, then push your
        extracted invoices with one click. No manual data entry required.
      </Text>

      <PrimaryButton href={`${BASE_URL}/settings`}>
        Connect Your Accounting Software
      </PrimaryButton>

      <Text style={styles.mutedText}>
        Need help? Reply to this email or reach us at support@dockett.app.
      </Text>
    </EmailLayout>
  );
}

export default NoSyncNudgeEmail;
