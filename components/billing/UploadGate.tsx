import Link from "next/link";

interface UploadGateProps {
  subscriptionStatus: string;
  trialExpired: boolean;
}

function getGateContent(subscriptionStatus: string, trialExpired: boolean) {
  if (trialExpired) {
    return {
      heading: "Your free trial has ended",
      body: "Subscribe to continue processing invoices.",
      ctaText: "View Plans",
      ctaHref: "/app/settings",
    };
  }

  if (subscriptionStatus === "cancelled") {
    return {
      heading: "Your subscription is inactive",
      body: "Resubscribe to continue processing invoices.",
      ctaText: "Manage Subscription",
      ctaHref: "/app/settings",
    };
  }

  if (subscriptionStatus === "past_due") {
    return {
      heading: "Payment issue",
      body: "Update your payment method to continue processing invoices.",
      ctaText: "Update Payment",
      ctaHref: "/app/settings",
    };
  }

  // Default: never subscribed
  return {
    heading: "Subscribe to process invoices",
    body: "Start your subscription to upload, extract, and sync invoices.",
    ctaText: "View Plans",
    ctaHref: "/app/settings",
  };
}

export default function UploadGate({ subscriptionStatus, trialExpired }: UploadGateProps) {
  const { heading, body, ctaText, ctaHref } = getGateContent(subscriptionStatus, trialExpired);

  return (
    <div className="flex flex-col items-center justify-center rounded-brand-lg border border-border bg-surface px-8 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        <svg
          className="h-6 w-6 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <h2 className="font-headings text-xl font-semibold text-text">{heading}</h2>
      <p className="mt-2 font-body text-[15px] text-muted max-w-md">{body}</p>
      <Link
        href={ctaHref}
        className="mt-6 inline-flex items-center rounded-brand bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
      >
        {ctaText}
      </Link>
    </div>
  );
}
