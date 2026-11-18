import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit, requireAdminOrFailClosed } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`admin-fx:${getClientIp(request)}`, 20, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "طلبات كثيرة جداً." }, { status: 429 });
  }

  let body: { parallelUsdSdg?: unknown; officialUsdSdg?: unknown };
  try {
    body = (await request.json()) as {
      parallelUsdSdg?: unknown;
      officialUsdSdg?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  }

  const parallel = Number(body.parallelUsdSdg);
  const official = Number(body.officialUsdSdg);

  if (
    !Number.isFinite(parallel) ||
    parallel < 500 ||
    parallel > 50000 ||
    !Number.isFinite(official) ||
    official < 500 ||
    official > 50000
  ) {
    return NextResponse.json(
      { error: "يجب أن يكون سعر الصرف بين 500 و 50,000 ج.س." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير متصلة (SUPABASE_SERVICE_ROLE_KEY مفقود)." },
      { status: 503 }
    );
  }

  const { data: prevRows } = await supabase
    .from("exchange_rates")
    .select("*")
    .order("observed_at", { ascending: false })
    .limit(1);
  const prevFx = prevRows?.[0] ?? null;

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("exchange_rates")
    .insert({
      parallel_usd_sdg: Math.round(parallel * 100) / 100,
      official_usd_sdg: Math.round(official * 100) / 100,
      data_status: "live",
      source: "admin_manual",
      observed_at: nowIso,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "تعذر تحديث سعر الصرف في قاعدة البيانات." },
      { status: 500 }
    );
  }

  // Recalculate effective_sdg across equipment catalog
  const { data: equipmentList } = await supabase
    .from("solar_equipment")
    .select("slug, effective_usd");

  for (const item of equipmentList ?? []) {
    const newSdg = Math.round(Number(item.effective_usd) * parallel * 100) / 100;
    await supabase
      .from("solar_equipment")
      .update({ effective_sdg: newSdg, updated_at: nowIso })
      .eq("slug", item.slug);
  }

  await recordAdminAudit(supabase, request, {
    actionType: "update_fx_rate",
    targetSlug: "exchange_rates",
    oldValue: prevFx
      ? {
          parallel_usd_sdg: prevFx.parallel_usd_sdg,
          official_usd_sdg: prevFx.official_usd_sdg,
        }
      : null,
    newValue: {
      parallel_usd_sdg: inserted.parallel_usd_sdg,
      official_usd_sdg: inserted.official_usd_sdg,
    },
  });

  return NextResponse.json({ ok: true, exchangeRate: inserted });
}
