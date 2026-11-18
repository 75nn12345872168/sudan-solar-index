import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit, requireAdminOrFailClosed } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";
import type { PriceBasis } from "@/types/solar";

export async function POST(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`admin-eq:${getClientIp(request)}`, 40, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "طلبات كثيرة جداً." }, { status: 429 });
  }

  let body: {
    slug?: unknown;
    referenceUsd?: unknown;
    manualEffectiveUsd?: unknown;
    priceBasis?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json({ error: "معرف الصنف مطلوب." }, { status: 400 });
  }

  const priceBasis = body.priceBasis as PriceBasis;
  if (!["reference", "observed", "manual"].includes(priceBasis)) {
    return NextResponse.json(
      { error: "نوع التسعير يجب أن يكون reference أو observed أو manual." },
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

  const { data: existing, error: fetchErr } = await supabase
    .from("solar_equipment")
    .select("*")
    .eq("slug", slug)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
  }

  const { data: latestFxRows } = await supabase
    .from("exchange_rates")
    .select("parallel_usd_sdg")
    .order("observed_at", { ascending: false })
    .limit(1);
  const parallelRate = Number(latestFxRows?.[0]?.parallel_usd_sdg ?? 12000);

  const referenceUsd =
    body.referenceUsd !== undefined
      ? Number(body.referenceUsd)
      : Number(existing.reference_usd);

  if (!Number.isFinite(referenceUsd) || referenceUsd <= 0) {
    return NextResponse.json(
      { error: "السعر المرجعي يجب أن يكون أكبر من صفر." },
      { status: 400 }
    );
  }

  let effectiveUsd = referenceUsd;
  let dataStatus = existing.data_status;
  let lastObservedAt = existing.last_observed_at;

  if (priceBasis === "manual") {
    const manualVal = Number(body.manualEffectiveUsd);
    if (!Number.isFinite(manualVal) || manualVal <= 0) {
      return NextResponse.json(
        { error: "السعر اليدوي الفعلي يجب أن يكون أكبر من صفر." },
        { status: 400 }
      );
    }
    effectiveUsd = Math.round(manualVal * 100) / 100;
    dataStatus = "live";
    lastObservedAt = new Date().toISOString();
  } else if (priceBasis === "observed") {
    if (existing.observed_usd === null || Number(existing.observed_usd) <= 0) {
      return NextResponse.json(
        { error: "لا يوجد سعر مرصود ميدانياً لهذا الصنف بعد." },
        { status: 400 }
      );
    }
    effectiveUsd = Number(existing.observed_usd);
  } else {
    effectiveUsd = Math.round(referenceUsd * 100) / 100;
  }

  const effectiveSdg = Math.round(effectiveUsd * parallelRate * 100) / 100;
  const nowIso = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from("solar_equipment")
    .update({
      reference_usd: Math.round(referenceUsd * 100) / 100,
      effective_usd: effectiveUsd,
      effective_sdg: effectiveSdg,
      price_basis: priceBasis,
      data_status: dataStatus,
      last_observed_at: lastObservedAt,
      updated_at: nowIso,
    })
    .eq("slug", slug)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: "تعذر تحديث بيانات الصنف." },
      { status: 500 }
    );
  }

  await recordAdminAudit(supabase, request, {
    actionType: "update_equipment_price",
    targetSlug: slug,
    oldValue: {
      reference_usd: existing.reference_usd,
      effective_usd: existing.effective_usd,
      price_basis: existing.price_basis,
      data_status: existing.data_status,
    },
    newValue: {
      reference_usd: updated.reference_usd,
      effective_usd: updated.effective_usd,
      price_basis: updated.price_basis,
      data_status: updated.data_status,
    },
  });

  return NextResponse.json({ ok: true, item: updated });
}
