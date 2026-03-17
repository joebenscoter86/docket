import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVendorOptions, createVendor, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError, validationError, conflict, unprocessableEntity } from "@/lib/utils/errors";

/**
 * GET /api/quickbooks/vendors
 *
 * Returns active QBO vendors formatted for dropdown UI.
 * Requires authenticated user with a QBO connection.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

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

    // Fetch vendors from QBO
    const adminSupabase = createAdminClient();
    const vendors = await getVendorOptions(adminSupabase, membership.org_id);

    logger.info("qbo.vendors_fetched", {
      userId: user.id,
      orgId: membership.org_id,
      count: String(vendors.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendors);
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.vendors_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("qbo.vendors_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    // If no connection, return empty array (UI handles empty state)
    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch vendors from QuickBooks.");
  }
}

/**
 * POST /api/quickbooks/vendors
 *
 * Creates a new vendor in QBO.
 * Body: { displayName: string, address?: string | null }
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

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

    const body = await request.json();
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const address = typeof body.address === "string" ? body.address : null;

    if (!displayName) {
      return validationError("Vendor name is required.");
    }

    const adminSupabase = createAdminClient();
    const vendor = await createVendor(adminSupabase, membership.org_id, displayName, address);

    logger.info("qbo.vendor_created_via_api", {
      userId: user.id,
      orgId: membership.org_id,
      vendorId: vendor.value,
      displayName: vendor.label,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendor);
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.vendor_create_api_error", {
        error: error.message,
        code: error.errorCode,
        element: error.element,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.errorCode === "6240") {
        return conflict("A vendor with this name already exists in QuickBooks. Try refreshing.");
      }

      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Reconnect in Settings.");
      }
    }

    // No QBO connection
    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return unprocessableEntity("No QuickBooks connection found. Connect in Settings.");
    }

    logger.error("qbo.vendor_create_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to create vendor in QuickBooks. Please try again.");
  }
}
