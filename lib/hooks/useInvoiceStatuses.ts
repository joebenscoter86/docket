"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface InvoiceStatusEntry {
  status: InvoiceStatus;
  errorMessage: string | null;
}

interface UseInvoiceStatusesReturn {
  statuses: Record<string, InvoiceStatusEntry>;
  isConnected: boolean;
}

export function useInvoiceStatuses(
  invoiceIds: string[]
): UseInvoiceStatusesReturn {
  const [statuses, setStatuses] = useState<Record<string, InvoiceStatusEntry>>(
    {}
  );
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const subscriptionKey = useMemo(
    () => [...invoiceIds].sort().join(","),
    [invoiceIds]
  );

  const resetState = useCallback(() => {
    setStatuses({});
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (invoiceIds.length === 0) {
      resetState();
      return;
    }

    const supabase = createClient();
    const isMounted = { current: true };
    const hasReceivedRealtimeUpdate = new Set<string>();

    supabase
      .from("invoices")
      .select("id, status, error_message")
      .in("id", invoiceIds)
      .then(({ data, error }) => {
        if (!isMounted.current) return;
        if (!error && data) {
          setStatuses((prev) => {
            const next = { ...prev };
            for (const row of data) {
              if (hasReceivedRealtimeUpdate.has(row.id)) continue;
              next[row.id] = {
                status: row.status as InvoiceStatus,
                errorMessage: row.error_message ?? null,
              };
            }
            return next;
          });
        }
      });

    const channel = supabase
      .channel(`invoice-statuses-${subscriptionKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
        },
        (payload) => {
          if (!isMounted.current) return;
          const newRecord = payload.new as {
            id: string;
            status: InvoiceStatus;
            error_message: string | null;
          };
          if (!invoiceIds.includes(newRecord.id)) return;
          hasReceivedRealtimeUpdate.add(newRecord.id);
          setStatuses((prev) => ({
            ...prev,
            [newRecord.id]: {
              status: newRecord.status,
              errorMessage: newRecord.error_message ?? null,
            },
          }));
        }
      )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey, resetState]);

  return { statuses, isConnected };
}
