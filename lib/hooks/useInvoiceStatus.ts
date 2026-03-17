"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseInvoiceStatusReturn {
  status: InvoiceStatus | null;
  errorMessage: string | null;
  isConnected: boolean;
}

export function useInvoiceStatus(
  invoiceId: string | null
): UseInvoiceStatusReturn {
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const resetState = useCallback(() => {
    setStatus(null);
    setErrorMessage(null);
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!invoiceId) {
      resetState();
      return;
    }

    const supabase = createClient();

    // Fix 1: mounted guard — prevents stale state updates after cleanup
    const isMounted = { current: true };

    // Fix 2: race condition guard — realtime data is fresher than initial fetch
    const hasReceivedRealtimeUpdate = { current: false };

    // Fetch current status
    supabase
      .from("invoices")
      .select("status, error_message")
      .eq("id", invoiceId)
      .single()
      .then(({ data, error }) => {
        if (!isMounted.current) return;
        // Skip if realtime already delivered a fresher update
        if (hasReceivedRealtimeUpdate.current) return;
        if (!error && data) {
          setStatus(data.status as InvoiceStatus);
          setErrorMessage(data.error_message ?? null);
        }
      });

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`invoice-status-${invoiceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: `id=eq.${invoiceId}`,
        },
        (payload) => {
          if (!isMounted.current) return;
          hasReceivedRealtimeUpdate.current = true;
          const newRecord = payload.new as {
            status: InvoiceStatus;
            error_message: string | null;
          };
          setStatus(newRecord.status);
          setErrorMessage(newRecord.error_message ?? null);
        }
      )
      // Fix 3: handle all connection states — true only when SUBSCRIBED
      .subscribe((subscriptionStatus) => {
        if (!isMounted.current) return;
        setIsConnected(subscriptionStatus === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      isMounted.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [invoiceId, resetState]);

  return { status, errorMessage, isConnected };
}
