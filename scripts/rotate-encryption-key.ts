/**
 * Encryption key rotation script.
 *
 * Re-encrypts all OAuth tokens in accounting_connections with the current
 * ENCRYPTION_KEY. Requires ENCRYPTION_KEY_PREVIOUS to be set so old tokens
 * can be decrypted.
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-key.ts            # live run
 *   npx tsx scripts/rotate-encryption-key.ts --dry-run   # verify only
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "../lib/utils/encryption";

const DRY_RUN = process.argv.includes("--dry-run");

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY is required");
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? "DRY RUN: verifying all tokens can be decrypted (no writes)"
      : "LIVE RUN: re-encrypting all tokens with current key"
  );

  const supabase = createAdminClient();

  const { data: connections, error } = await supabase
    .from("accounting_connections")
    .select("id, org_id, provider, access_token, refresh_token");

  if (error) {
    console.error("Failed to fetch connections:", error.message);
    process.exit(1);
  }

  if (!connections || connections.length === 0) {
    console.log("No accounting connections found. Nothing to rotate.");
    return;
  }

  console.log(`Found ${connections.length} connection(s) to process.\n`);

  let rotated = 0;
  let failed = 0;

  for (const conn of connections) {
    const label = `[${conn.provider}] org=${conn.org_id} id=${conn.id}`;
    try {
      // Decrypt with any valid key (current or previous)
      const accessToken = decrypt(conn.access_token);
      const refreshToken = decrypt(conn.refresh_token);

      if (DRY_RUN) {
        console.log(`  OK ${label} - decrypted successfully`);
        rotated++;
        continue;
      }

      // Re-encrypt with current key
      const newAccessToken = encrypt(accessToken);
      const newRefreshToken = encrypt(refreshToken);

      const { error: updateError } = await supabase
        .from("accounting_connections")
        .update({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
        })
        .eq("id", conn.id);

      if (updateError) {
        console.error(`  FAIL ${label} - DB update failed: ${updateError.message}`);
        failed++;
        continue;
      }

      console.log(`  OK ${label} - rotated`);
      rotated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL ${label} - ${msg}`);
      failed++;
    }
  }

  console.log(
    `\nDone. ${DRY_RUN ? "Verified" : "Rotated"} ${rotated} of ${connections.length} connections.`
  );
  if (failed > 0) {
    console.error(`${failed} connection(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
