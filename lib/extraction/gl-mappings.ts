import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeForMatching } from "@/lib/utils/normalize";
import { logger } from "@/lib/utils/logger";

/**
 * Record a vendor+description → GL account mapping.
 * Uses a Postgres function for proper usage_count incrementing.
 * Non-blocking: logs errors but never throws.
 */
export async function upsertGlMapping(
  orgId: string,
  vendorName: string,
  description: string,
  glAccountId: string
): Promise<void> {
  const normalizedVendor = normalizeForMatching(vendorName);
  const normalizedDesc = normalizeForMatching(description);

  if (!normalizedVendor || !normalizedDesc) return;

  const admin = createAdminClient();

  const { error } = await admin.rpc("upsert_gl_mapping", {
    p_org_id: orgId,
    p_vendor_name: normalizedVendor,
    p_description_pattern: normalizedDesc,
    p_gl_account_id: glAccountId,
  });

  if (error) {
    logger.warn("gl_mapping_upsert_failed", {
      orgId,
      vendor: normalizedVendor,
      description: normalizedDesc,
      error: error.message,
    });
  }
}

/**
 * Look up GL account mappings for an org + vendor.
 * Returns a Map of normalized description → gl_account_id.
 * Non-blocking: returns empty map on failure.
 */
export async function lookupGlMappings(
  orgId: string,
  vendorName: string
): Promise<Map<string, string>> {
  const normalizedVendor = normalizeForMatching(vendorName);
  if (!normalizedVendor) return new Map();

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("gl_account_mappings")
    .select("description_pattern, gl_account_id")
    .eq("org_id", orgId)
    .eq("vendor_name", normalizedVendor);

  if (error || !data) {
    logger.warn("gl_mapping_lookup_failed", {
      orgId,
      vendor: normalizedVendor,
      error: error?.message ?? "no data",
    });
    return new Map();
  }

  const mappings = new Map<string, string>();
  for (const row of data) {
    mappings.set(row.description_pattern, row.gl_account_id);
  }
  return mappings;
}
