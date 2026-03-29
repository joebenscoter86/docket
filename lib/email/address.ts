import { customAlphabet } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePrefix, buildAddress } from "./prefix-validation";

const INBOUND_DOMAIN = "ingest.dockett.app";
const ADDRESS_PREFIX = "invoices";
const ID_LENGTH = 10;

// Lowercase alphanumeric minus ambiguous chars: 0/O, 1/l/i
// Uses 2-9 (8) + a-h,j-k,m-n,p-z (23) = 31 chars
const generateId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyz",
  ID_LENGTH
);

/**
 * Generate a new inbound email address for an org.
 * Format: invoices-{nanoid10}@ingest.dockett.app
 */
export function generateInboundAddress(): string {
  return `${ADDRESS_PREFIX}-${generateId()}@${INBOUND_DOMAIN}`;
}

/**
 * Look up which org owns a given inbound email address.
 * Returns null if the address is not registered (unknown/disabled).
 */
export async function getOrgByInboundAddress(
  address: string
): Promise<{ orgId: string; ownerId: string } | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("inbound_email_address", address)
    .single();

  if (error || !data) return null;

  // Resolve the org owner for userId context
  const { data: membership } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", data.id)
    .eq("role", "owner")
    .single();

  if (!membership) return null;

  return { orgId: data.id, ownerId: membership.user_id };
}

/**
 * Assign an inbound email address to an org.
 * Idempotent: if the org already has one, returns it.
 */
export async function assignInboundAddress(orgId: string): Promise<string> {
  const admin = createAdminClient();

  // Check if org already has an address
  const { data: existing } = await admin
    .from("organizations")
    .select("inbound_email_address")
    .eq("id", orgId)
    .single();

  if (existing?.inbound_email_address) {
    return existing.inbound_email_address;
  }

  // Generate and assign
  const address = generateInboundAddress();
  const { data, error } = await admin
    .from("organizations")
    .update({ inbound_email_address: address })
    .eq("id", orgId)
    .select("inbound_email_address")
    .single();

  if (error) {
    throw new Error(
      "Failed to assign inbound email address: " + error.message
    );
  }

  return data!.inbound_email_address;
}

/**
 * Remove the inbound email address from an org (disable email forwarding).
 */
export async function removeInboundAddress(orgId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({ inbound_email_address: null })
    .eq("id", orgId);

  if (error) {
    throw new Error(
      "Failed to remove inbound email address: " + error.message
    );
  }
}

type SetPrefixResult =
  | { success: true; address: string }
  | { success: false; error: string; code?: "CONFLICT" };

/**
 * Set a custom email prefix for an org.
 * Validates the prefix, checks uniqueness, and updates the org's address.
 * Returns the new full address on success.
 */
export async function setCustomPrefix(
  orgId: string,
  rawPrefix: string
): Promise<SetPrefixResult> {
  const validation = validatePrefix(rawPrefix);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const address = buildAddress(rawPrefix);
  const admin = createAdminClient();

  // Check if another org already uses this address
  const { data: existing, error: checkError } = await admin
    .from("organizations")
    .select("id")
    .eq("inbound_email_address", address)
    .single();

  // PGRST116 = no rows found (address available) — any other error is unexpected
  if (checkError && checkError.code !== "PGRST116") {
    throw new Error("Failed to check address availability: " + checkError.message);
  }

  if (existing && existing.id !== orgId) {
    return {
      success: false,
      error: `"${rawPrefix.toLowerCase().trim()}" is already in use. Choose another prefix.`,
      code: "CONFLICT",
    };
  }

  // Update the org's address
  const { data, error } = await admin
    .from("organizations")
    .update({ inbound_email_address: address })
    .eq("id", orgId)
    .select("inbound_email_address")
    .single();

  if (error) {
    // Handle race condition: unique constraint violation
    if (error.code === "23505") {
      return {
        success: false,
        error: `"${rawPrefix.toLowerCase().trim()}" is already in use. Choose another prefix.`,
        code: "CONFLICT",
      };
    }
    throw new Error("Failed to set custom prefix: " + error.message);
  }

  return { success: true, address: data!.inbound_email_address };
}
