import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";


interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Content */}
          {children}

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              Dockett by JB Technologies LLC
            </Text>
            <Text style={footerText}>
              Need help?{" "}
              <Link href="mailto:support@dockett.app" style={footerLink}>
                support@dockett.app
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={buttonSection}>
      <Link href={href} style={primaryButton}>
        {children}
      </Link>
    </Section>
  );
}

// Shared styles
const body = {
  backgroundColor: "#f7f7f8",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: "0" as const,
  padding: "0" as const,
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  margin: "40px auto",
  maxWidth: "600px",
  padding: "40px 32px",
};


const hr = {
  borderColor: "#e5e7eb",
  borderTop: "1px solid #e5e7eb",
  margin: "32px 0 24px",
};

const footer = {
  textAlign: "center" as const,
};

const footerText = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0",
};

const footerLink = {
  color: "#6b7280",
  textDecoration: "underline",
};

const buttonSection = {
  textAlign: "center" as const,
  margin: "28px 0",
};

const primaryButton = {
  backgroundColor: "#2563eb",
  borderRadius: "12px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "100%",
  padding: "14px 32px",
  textDecoration: "none",
};

// Exported for use in templates
export const styles = {
  heading: {
    color: "#1e293b",
    fontSize: "22px",
    fontWeight: "700" as const,
    lineHeight: "28px",
    margin: "0 0 12px",
    textAlign: "center" as const,
  },
  paragraph: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  mutedText: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 8px",
  },
  link: {
    color: "#2563eb",
    textDecoration: "underline",
  },
  stepNumber: {
    backgroundColor: "#2563eb",
    borderRadius: "50%",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "13px",
    fontWeight: "700" as const,
    height: "24px",
    lineHeight: "24px",
    textAlign: "center" as const,
    width: "24px",
  },
};
