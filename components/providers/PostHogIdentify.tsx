"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function PostHogIdentify({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    if (userId) {
      posthog.identify(userId, { email });
    }
  }, [userId, email]);

  return null;
}
