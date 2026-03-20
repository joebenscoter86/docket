"use client";

import { useState, useEffect, useCallback } from "react";
import type { VendorOption, AccountOption } from "@/lib/accounting";

interface QboOptionsState {
  vendors: VendorOption[];
  accounts: AccountOption[];
  loading: boolean;
  connected: boolean;
  error: string | null;
}

export function useQboOptions(): QboOptionsState & { addVendor: (vendor: VendorOption) => void } {
  const [state, setState] = useState<QboOptionsState>({
    vendors: [],
    accounts: [],
    loading: true,
    connected: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchOptions() {
      try {
        const [vendorRes, accountRes] = await Promise.all([
          fetch("/api/accounting/vendors"),
          fetch("/api/accounting/accounts"),
        ]);

        if (cancelled) return;

        // 401 means token expired — treat as disconnected
        if (vendorRes.status === 401 || accountRes.status === 401) {
          setState({
            vendors: [],
            accounts: [],
            loading: false,
            connected: false,
            error: "Accounting connection expired. Reconnect in Settings.",
          });
          return;
        }

        const vendorBody = await vendorRes.json();
        const accountBody = await accountRes.json();

        if (cancelled) return;

        const vendors: VendorOption[] = vendorBody.data ?? [];
        const accounts: AccountOption[] = accountBody.data ?? [];

        const connected = vendorRes.ok && accountRes.ok;

        setState({
          vendors,
          accounts,
          loading: false,
          connected,
          error: null,
        });
      } catch {
        if (cancelled) return;
        setState({
          vendors: [],
          accounts: [],
          loading: false,
          connected: false,
          error: "Failed to load accounting data.",
        });
      }
    }

    fetchOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const addVendor = useCallback((vendor: VendorOption) => {
    setState((prev) => ({
      ...prev,
      vendors: [...prev.vendors, vendor].sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, []);

  return { ...state, addVendor };
}
