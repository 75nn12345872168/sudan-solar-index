import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit, requireAdminOrFailClosed } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

const VALID_STATUSES = new Set(["new", "contacted", "quoted", "closed", "spam"]);

export async function PATCH(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`admin-quotes:${getClientIp(request)}`, 40, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "طلبات كثيرة جداً." }, { status: 429 });
  }

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!id || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "معرف الطلب أو الحالة غير صالحة." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير متصلة." },
      { status: 503 }
    );
  }

  const { data: existing } = await supabase
    .from("quote_requests")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("quote_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "تعذر تحديث حالة الطلب." },
      { status: 500 }
    );
  }

  await recordAdminAudit(supabase, request, {
    actionType: "update_quote_status",
    targetSlug: id,
    oldValue: { status: existing.status },
    newValue: { status: updated.status },
  });

  return NextResponse.json({ ok: true, quote: updated });
}
