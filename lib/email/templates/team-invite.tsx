import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface TeamInviteEmailProps {
  inviterEmail: string;
  inviterName: string | null;
  orgName: string;
  inviteUrl: string;
  expiresAt: string;
}

export function TeamInviteEmail({
  inviterEmail,
  inviterName,
  orgName,
  inviteUrl,
  expiresAt,
}: TeamInviteEmailProps) {
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const inviterDisplay = inviterName
    ? `${inviterName} (${inviterEmail})`
    : inviterEmail;

  return (
    <EmailLayout preview={`${inviterName || inviterEmail} invited you to join ${orgName} on Dockett`}>
      <Text style={styles.heading}>You&apos;re invited to {orgName}</Text>
      <Text style={styles.paragraph}>
        {inviterDisplay} invited you to join <strong>{orgName}</strong> on
        Dockett. You&apos;ll be able to upload invoices, review AI-extracted
        data, and sync bills to your accounting software.
      </Text>

      <PrimaryButton href={inviteUrl}>Accept Invite</PrimaryButton>

      <Text style={styles.mutedText}>
        This invite expires on {expiryDate}. If you don&apos;t have an account
        yet, you&apos;ll be able to create one when you accept.
      </Text>
    </EmailLayout>
  );
}

export default TeamInviteEmail;
