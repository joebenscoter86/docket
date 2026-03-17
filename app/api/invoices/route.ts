import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authError, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { validateListParams, fetchInvoiceList, fetchInvoiceCounts } from "@/lib/invoices/queries";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return authError();
    }

    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    const params = validateListParams({
      status: searchParams.get("status") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
    });

    const [listResult, counts] = await Promise.all([
      fetchInvoiceList(supabase, params),
      fetchInvoiceCounts(supabase),
    ]);

    logger.info({
      action: "list_invoices",
      userId: user.id,
      status: "success",
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      invoices: listResult.invoices,
      nextCursor: listResult.nextCursor,
      counts,
    });
  } catch (err) {
    logger.error({
      action: "list_invoices",
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError();
  }
}
