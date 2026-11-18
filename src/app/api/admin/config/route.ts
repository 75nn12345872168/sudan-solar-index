import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit, requireAdminOrFailClosed } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

const ALLOWED_KEYS = new Set([
  "regional_markups",
  "bos_percentage",
  "peak_sun_hours",
]);

export async function POST(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`admin-cfg:${getClientIp(request)}`, 20, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "طلبات كثيرة جداً." }, { status: 429 });
  }

  let body: { key?: unknown; value?: unknown };
  try {
    body = (await request.json()) as { key?: unknown; value?: unknown };
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!ALLOWED_KEYS.has(key) || !body.value || typeof body.value !== "object") {
    return NextResponse.json(
      { error: "مفتاح الإعداد أو القيمة غير صالحة." },
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
    .from("app_config")
    .select("*")
    .eq("key", key)
    .single();

  const { data: updated, error } = await supabase
    .from("app_config")
    .upsert({
      key,
      value: body.value,
      description_ar: existing?.description_ar ?? "إعدادات مرصد الطاقة الشمسية",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "تعذر تحديث الإعدادات." },
      { status: 500 }
    );
  }

  await recordAdminAudit(supabase, request, {
    actionType: "update_app_config",
    targetSlug: key,
    oldValue: existing?.value ?? null,
    newValue: updated.value,
  });

  return NextResponse.json({ ok: true, config: updated });
}
