"use client";

import { useState, useEffect, useCallback } from "react";
import type { VendorOption, AccountOption, TrackingCategory } from "@/lib/accounting";

interface AccountingOptionsState {
  vendors: VendorOption[];
  accounts: AccountOption[];
  trackingCategories: TrackingCategory[];
  loading: boolean;
  connected: boolean;
  error: string | null;
}

export function useAccountingOptions(): AccountingOptionsState & { addVendor: (vendor: VendorOption) => void } {
  const [state, setState] = useState<AccountingOptionsState>({
    vendors: [],
    accounts: [],
    trackingCategories: [],
    loading: true,
    connected: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchOptions() {
      try {
        const [vendorRes, accountRes, trackingRes] = await Promise.all([
          fetch("/api/accounting/vendors"),
          fetch("/api/accounting/accounts"),
          fetch("/api/accounting/tracking-categories"),
        ]);

        if (cancelled) return;

        // 401 means token expired, 422 means no provider connected — treat as disconnected
        if (vendorRes.status === 401 || accountRes.status === 401) {
          setState({
            vendors: [],
            accounts: [],
            trackingCategories: [],
            loading: false,
            connected: false,
            error: "Accounting connection expired. Reconnect in Settings.",
          });
          return;
        }

        if (vendorRes.status === 422 || accountRes.status === 422) {
          setState({
            vendors: [],
            accounts: [],
            trackingCategories: [],
            loading: false,
            connected: false,
            error: null,
          });
          return;
        }

        const vendorBody = await vendorRes.json();
        const accountBody = await accountRes.json();
        const trackingBody = trackingRes.ok ? await trackingRes.json() : { data: [] };

        if (cancelled) return;

        const vendors: VendorOption[] = vendorBody.data ?? [];
        const accounts: AccountOption[] = accountBody.data ?? [];
        const trackingCategories: TrackingCategory[] = trackingBody.data ?? [];

        const connected = vendorRes.ok && accountRes.ok;

        setState({
          vendors,
          accounts,
          trackingCategories,
          loading: false,
          connected,
          error: null,
        });
      } catch {
        if (cancelled) return;
        setState({
          vendors: [],
          accounts: [],
          trackingCategories: [],
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
