import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

const BASE_URL = "https://dockett.app";

interface IngestionNoAttachmentEmailProps {
  emailSubject: string;
}

export function IngestionNoAttachmentEmail({ emailSubject }: IngestionNoAttachmentEmailProps) {
  return (
    <EmailLayout preview="No invoice attachment found in your email">
      <Text style={styles.heading}>No Invoice Attachment Found</Text>
      <Text style={styles.paragraph}>
        We received your email &quot;{emailSubject}&quot; but couldn&apos;t find a PDF or image
        attachment. Make sure the invoice is attached as a PDF, JPEG, or PNG file and try
        forwarding it again.
      </Text>
      <PrimaryButton href={`${BASE_URL}/invoices`}>Go to Invoices</PrimaryButton>
      <Text style={styles.mutedText}>
        You can manage email notifications in your{" "}
        <a href={`${BASE_URL}/settings`} style={styles.link}>Settings</a>.
      </Text>
    </EmailLayout>
  );
}

export default IngestionNoAttachmentEmail;
