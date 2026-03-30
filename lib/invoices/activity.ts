import { createAdminClient } from "@/lib/supabase/admin";

export interface ActivityEvent {
  type: "uploaded" | "edited" | "approved" | "synced";
  userEmail: string | null;
  userId: string | null;
  timestamp: string;
  detail?: string;
}

// Group corrections by user within 60-second windows.
// Corrections within the same window are collapsed into one "edited" event
// listing all field names.
function groupCorrections(
  corrections: Array<{
    user_id: string | null;
    field_name: string;
    corrected_at: string;
  }>
): Array<{ userId: string | null; fieldNames: string[]; timestamp: string }> {
  if (corrections.length === 0) return [];

  // Sort by corrected_at ascending so we walk forward in time
  const sorted = [...corrections].sort(
    (a, b) =>
      new Date(a.corrected_at).getTime() - new Date(b.corrected_at).getTime()
  );

  const groups: Array<{
    userId: string | null;
    fieldNames: string[];
    timestamp: string;
    windowStart: number;
  }> = [];

  for (const correction of sorted) {
    const ts = new Date(correction.corrected_at).getTime();
    const lastGroup = groups[groups.length - 1];

    const sameUser = lastGroup && lastGroup.userId === correction.user_id;
    const withinWindow =
      lastGroup && ts - lastGroup.windowStart <= 60_000;

    if (lastGroup && sameUser && withinWindow) {
      // Add field to existing group (deduplicate)
      if (!lastGroup.fieldNames.includes(correction.field_name)) {
        lastGroup.fieldNames.push(correction.field_name);
      }
    } else {
      groups.push({
        userId: correction.user_id,
        fieldNames: [correction.field_name],
        timestamp: correction.corrected_at,
        windowStart: ts,
      });
    }
  }

  return groups.map(({ userId, fieldNames, timestamp }) => ({
    userId,
    fieldNames,
    timestamp,
  }));
}

export async function getInvoiceActivity(
  invoiceId: string
): Promise<ActivityEvent[]> {
  const admin = createAdminClient();

  // Fetch all three data sources in parallel
  const [invoiceResult, correctionsResult, syncLogResult] = await Promise.all([
    admin
      .from("invoices")
      .select("uploaded_by, uploaded_at, approved_by, approved_at")
      .eq("id", invoiceId)
      .single(),
    admin
      .from("corrections")
      .select("user_id, field_name, corrected_at")
      .eq("invoice_id", invoiceId)
      .order("corrected_at", { ascending: true }),
    admin
      .from("sync_log")
      .select("synced_by, synced_at, status, provider")
      .eq("invoice_id", invoiceId)
      .order("synced_at", { ascending: true }),
  ]);

  // Collect unique user IDs for batch email lookup
  const userIdSet = new Set<string>();

  const invoice = invoiceResult.data;
  const corrections = correctionsResult.data ?? [];
  const syncLogs = syncLogResult.data ?? [];

  if (invoice?.uploaded_by) userIdSet.add(invoice.uploaded_by);
  if (invoice?.approved_by) userIdSet.add(invoice.approved_by);
  for (const c of corrections) {
    if (c.user_id) userIdSet.add(c.user_id);
  }
  for (const s of syncLogs) {
    if (s.synced_by) userIdSet.add(s.synced_by);
  }

  // Batch-fetch emails from users table
  const emailMap = new Map<string, string>();
  if (userIdSet.size > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, email")
      .in("id", Array.from(userIdSet));

    if (users) {
      for (const user of users) {
        emailMap.set(user.id, user.email);
      }
    }
  }

  const events: ActivityEvent[] = [];

  // Upload event
  if (invoice?.uploaded_at) {
    const userId = invoice.uploaded_by ?? null;
    events.push({
      type: "uploaded",
      userId,
      userEmail: userId ? (emailMap.get(userId) ?? null) : null,
      timestamp: invoice.uploaded_at,
    });
  }

  // Correction events (grouped by user + 60s window)
  const correctionGroups = groupCorrections(corrections);
  for (const group of correctionGroups) {
    events.push({
      type: "edited",
      userId: group.userId,
      userEmail: group.userId ? (emailMap.get(group.userId) ?? null) : null,
      timestamp: group.timestamp,
      detail: group.fieldNames.join(", "),
    });
  }

  // Approval event
  if (invoice?.approved_at) {
    const userId = invoice.approved_by ?? null;
    events.push({
      type: "approved",
      userId,
      userEmail: userId ? (emailMap.get(userId) ?? null) : null,
      timestamp: invoice.approved_at,
    });
  }

  // Sync events (only successful ones are shown; include all if desired)
  for (const s of syncLogs) {
    const userId = s.synced_by ?? null;
    events.push({
      type: "synced",
      userId,
      userEmail: userId ? (emailMap.get(userId) ?? null) : null,
      timestamp: s.synced_at,
      detail: s.provider,
    });
  }

  // Sort all events chronologically
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return events;
}
