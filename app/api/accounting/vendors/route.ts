import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  apiSuccess,
  internalError,
  validationError,
  conflict,
  unprocessableEntity,
} from "@/lib/utils/errors";

/**
 * GET /api/accounting/vendors
 *
 * Returns active vendors formatted for dropdown UI.
 * Provider-agnostic — works with any connected accounting system.
 * Returns an empty array if no accounting connection exists.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Verify authentication
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // Get user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    // Check for a connected accounting provider
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return apiSuccess([]);
    }

    const provider = getAccountingProvider(providerType);
    const vendors = await provider.fetchVendors(adminSupabase, orgId);

    logger.info("accounting.vendors_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(vendors.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendors);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.vendors_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError(
          "Accounting connection expired. Please reconnect in Settings."
        );
      }
    }

    logger.error("accounting.vendors_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    // Legacy: existing QBO helpers throw this message — return empty array
    if (
      error instanceof Error &&
      error.message.includes("No QuickBooks connection")
    ) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch vendors.");
  }
}

/**
 * POST /api/accounting/vendors
 *
 * Creates a new vendor in the connected accounting system.
 * Body: { displayName: string, address?: string | null }
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    // Require an active accounting connection to create a vendor
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return unprocessableEntity(
        "No accounting connection found. Connect an accounting provider in Settings."
      );
    }

    const body = await request.json();
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const address =
      typeof body.address === "string" ? body.address : null;

    if (!displayName) {
      return validationError("Vendor name is required.");
    }

    const provider = getAccountingProvider(providerType);
    const vendor = await provider.createVendor(
      adminSupabase,
      orgId,
      displayName,
      address
    );

    logger.info("accounting.vendor_created", {
      userId: user.id,
      orgId,
      provider: providerType,
      vendorId: vendor.value,
      displayName: vendor.label,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendor);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.vendor_create_api_error", {
        error: error.message,
        code: error.errorCode,
        element: error.element,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.errorCode === "6240") {
        return conflict(
          "A vendor with this name already exists. Try refreshing."
        );
      }

      if (error.statusCode === 401) {
        return authError(
          "Accounting connection expired. Reconnect in Settings."
        );
      }
    }

    logger.error("accounting.vendor_create_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to create vendor. Please try again.");
  }
}
