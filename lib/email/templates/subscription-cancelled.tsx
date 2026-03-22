import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface SubscriptionCancelledEmailProps {
  tierName: string;
}

const BASE_URL = "https://dockett.app";

export function SubscriptionCancelledEmail({
  tierName,
}: SubscriptionCancelledEmailProps) {
  return (
    <EmailLayout preview="Your Docket subscription has been cancelled">
      <Text style={styles.heading}>Subscription Cancelled</Text>
      <Text style={styles.paragraph}>
        Your {tierName} plan has been cancelled. Your data will remain
        accessible, but you will not be able to upload or sync new invoices.
      </Text>

      <Text style={styles.paragraph}>
        If you change your mind, you can reactivate your subscription anytime
        from the pricing page.
      </Text>

      <PrimaryButton href={`${BASE_URL}/pricing`}>
        Reactivate Subscription
      </PrimaryButton>

      <Text style={styles.mutedText}>
        If you have questions about your account, contact us at{" "}
        <a href="mailto:support@dockett.app" style={styles.link}>
          support@dockett.app
        </a>
        .
      </Text>
    </EmailLayout>
  );
}

export default SubscriptionCancelledEmail;
