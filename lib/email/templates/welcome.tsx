import { Section, Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface WelcomeEmailProps {
  email: string;
}

const BASE_URL = "https://dockett.app";

export function WelcomeEmail({ email }: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Welcome to Dockett - upload your first invoice to see the magic">
      <Text style={styles.heading}>Welcome to Dockett</Text>
      <Text style={styles.paragraph}>
        You&apos;re all set, {email}. Upload your first invoice and see the
        magic. Most users finish in under 60 seconds.
      </Text>

      {/* Steps */}
      <Section style={stepContainer}>
        <table cellPadding="0" cellSpacing="0" style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td style={stepNumberCell}>
                <span style={styles.stepNumber}>1</span>
              </td>
              <td style={stepTextCell}>
                <Text style={stepTitle}>Upload your first invoice</Text>
                <Text style={stepDesc}>
                  Drop a PDF, JPG, or PNG and our AI extracts the data
                  instantly.
                </Text>
              </td>
            </tr>
            <tr>
              <td style={stepNumberCell}>
                <span style={styles.stepNumber}>2</span>
              </td>
              <td style={stepTextCell}>
                <Text style={stepTitle}>Connect your accounting software</Text>
                <Text style={stepDesc}>
                  Link QuickBooks Online or Xero in one click from Settings.
                </Text>
              </td>
            </tr>
            <tr>
              <td style={stepNumberCell}>
                <span style={styles.stepNumber}>3</span>
              </td>
              <td style={stepTextCell}>
                <Text style={stepTitle}>Review and sync</Text>
                <Text style={stepDesc}>
                  Confirm the extracted data, then push it to your books with
                  one click.
                </Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <PrimaryButton href={`${BASE_URL}/upload`}>
        Upload Your First Invoice
      </PrimaryButton>

      <Text style={styles.mutedText}>
        Questions? Reply to this email or reach us at support@dockett.app.
      </Text>
    </EmailLayout>
  );
}

const stepContainer = {
  margin: "24px 0",
};

const stepNumberCell = {
  verticalAlign: "top" as const,
  width: "36px",
  paddingTop: "4px",
  paddingBottom: "16px",
};

const stepTextCell = {
  verticalAlign: "top" as const,
  paddingBottom: "16px",
};

const stepTitle = {
  color: "#1e293b",
  fontSize: "15px",
  fontWeight: "600" as const,
  lineHeight: "20px",
  margin: "0 0 2px",
};

const stepDesc = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

export default WelcomeEmail;
