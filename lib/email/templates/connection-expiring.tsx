import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface ConnectionExpiringEmailProps {
  provider: "quickbooks" | "xero";
  expiresAt: string;
}

const BASE_URL = "https://dockett.app";

const providerNames = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
};

export function ConnectionExpiringEmail({
  provider,
  expiresAt,
}: ConnectionExpiringEmailProps) {
  return (
    <EmailLayout
      preview={`Your ${providerNames[provider]} connection expires soon`}
    >
      <Text style={styles.heading}>Connection Expiring Soon</Text>
      <Text style={styles.paragraph}>
        Your {providerNames[provider]} connection will expire on {expiresAt}.
        Please reconnect to continue syncing invoices.
      </Text>

      <Text style={styles.paragraph}>
        If the connection expires, any pending invoice syncs will fail until you
        reconnect.
      </Text>

      <PrimaryButton href={`${BASE_URL}/settings`}>
        Reconnect Now
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

export default ConnectionExpiringEmail;
