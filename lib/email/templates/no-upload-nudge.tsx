import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

const BASE_URL = "https://dockett.app";

export function NoUploadNudgeEmail() {
  return (
    <EmailLayout preview="Ready to try your first invoice? Just drag a PDF in.">
      <Text style={styles.heading}>Your First Invoice Is Waiting</Text>
      <Text style={styles.paragraph}>
        You signed up for Dockett a few days ago, but you haven&apos;t uploaded
        an invoice yet. Here&apos;s how fast it works:
      </Text>

      <Text style={styles.paragraph}>
        <strong>Drop a PDF, JPG, or PNG</strong> into Dockett. Our AI reads the
        vendor, line items, totals, and due date in seconds. You review,
        correct anything if needed, and sync it to QuickBooks or Xero with
        one click.
      </Text>

      <Text style={styles.paragraph}>
        Most users finish their first invoice in under 60 seconds.
      </Text>

      <PrimaryButton href={`${BASE_URL}/upload`}>
        Upload Your First Invoice
      </PrimaryButton>

      <Text style={styles.mutedText}>
        You have 10 free invoices to try before choosing a plan.
      </Text>
    </EmailLayout>
  );
}

export default NoUploadNudgeEmail;
