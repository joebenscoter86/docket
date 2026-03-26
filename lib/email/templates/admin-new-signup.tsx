import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface AdminNewSignupProps {
  userEmail: string;
  signupDate: string;
}

export function AdminNewSignupEmail({ userEmail, signupDate }: AdminNewSignupProps) {
  return (
    <EmailLayout preview={`New signup: ${userEmail}`}>
      <Text style={styles.heading}>New Dockett Signup</Text>
      <Text style={styles.paragraph}>
        <strong>{userEmail}</strong> just confirmed their account.
      </Text>
      <Text style={styles.mutedText}>
        Signed up at {signupDate}
      </Text>
      <PrimaryButton href="https://dockett.app/settings">
        View in Dashboard
      </PrimaryButton>
    </EmailLayout>
  );
}

export default AdminNewSignupEmail;
