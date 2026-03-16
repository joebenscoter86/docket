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

    // Fetch current status
    supabase
      .from("invoices")
      .select("status, error_message")
      .eq("id", invoiceId)
      .single()
      .then(({ data, error }) => {
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
          const newRecord = payload.new as {
            status: InvoiceStatus;
            error_message: string | null;
          };
          setStatus(newRecord.status);
          setErrorMessage(newRecord.error_message ?? null);
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [invoiceId, resetState]);

  return { status, errorMessage, isConnected };
}
