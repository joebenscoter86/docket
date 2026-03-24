import { customAlphabet } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";

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
