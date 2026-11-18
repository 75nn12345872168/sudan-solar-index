import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  normalizeArabicDigits,
} from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

const SUDAN_PHONE_REGEX = /^(?:\+?249|0)(?:1|9)\d{8}$/;

interface QuotePayload {
  customerName?: unknown;
  whatsappPhone?: unknown;
  city?: unknown;
  presetOrSummary?: unknown;
  capexSdg?: unknown;
  capexUsd?: unknown;
  recurringMonthlyUsd?: unknown;
  website?: unknown; // Honeypot field (must stay empty)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`quotes:${ip}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `تم تجاوز الحد المسموح للطلبات. يرجى المحاولة بعد ${rl.retryAfterSec} ثانية.`,
      },
      { status: 429 }
    );
  }

  let body: QuotePayload;
  try {
    body = (await request.json()) as QuotePayload;
  } catch {
    return NextResponse.json(
      { error: "صيغة البيانات المرسلة غير صالحة." },
      { status: 400 }
    );
  }

  // Honeypot check against automated spam bots
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json(
      { error: "تعذر معالجة الطلب." },
      { status: 400 }
    );
  }

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  if (customerName.length < 2 || customerName.length > 120) {
    return NextResponse.json(
      { error: "يرجى إدخال الاسم الكامل (من 2 إلى 120 حرفاً)." },
      { status: 400 }
    );
  }

  const rawPhone =
    typeof body.whatsappPhone === "string" ? body.whatsappPhone : "";
  const normalizedPhone = normalizeArabicDigits(rawPhone).replace(/[\s\-()]/g, "");
  if (!SUDAN_PHONE_REGEX.test(normalizedPhone)) {
    return NextResponse.json(
      {
        error:
          "رقم الواتساب السوداني غير صالح (مثال: 0912345678 أو 249912345678+).",
      },
      { status: 400 }
    );
  }

  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (city.length < 2 || city.length > 60) {
    return NextResponse.json(
      { error: "يرجى اختيار المدينة بشكل صحيح." },
      { status: 400 }
    );
  }

  const presetOrSummary =
    typeof body.presetOrSummary === "string" ? body.presetOrSummary.trim() : "";
  if (presetOrSummary.length < 5 || presetOrSummary.length > 1500) {
    return NextResponse.json(
      { error: "ملخص الباقة غير مكتمل." },
      { status: 400 }
    );
  }

  const capexSdg = Number(body.capexSdg);
  const capexUsd = Number(body.capexUsd);
  const recurringMonthlyUsd = Number(body.recurringMonthlyUsd ?? 0);

  if (
    !Number.isFinite(capexSdg) ||
    capexSdg < 0 ||
    !Number.isFinite(capexUsd) ||
    capexUsd < 0 ||
    !Number.isFinite(recurringMonthlyUsd) ||
    recurringMonthlyUsd < 0
  ) {
    return NextResponse.json(
      { error: "قيم التكلفة غير صالحة." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "قاعدة البيانات غير متصلة حالياً لحفظ طلبات عروض الأسعار. يمكنك مشاركة الطلب مباشرة عبر واتساب.",
      },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("quote_requests")
    .insert({
      customer_name: customerName,
      whatsapp_phone: normalizedPhone,
      city,
      preset_or_summary: presetOrSummary,
      capex_sdg: Math.round(capexSdg * 100) / 100,
      capex_usd: Math.round(capexUsd * 100) / 100,
      recurring_monthly_usd: Math.round(recurringMonthlyUsd * 100) / 100,
      status: "new",
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[POST /api/quotes] insert failed:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء حفظ طلب العرض. يرجى المحاولة لاحقاً." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      referenceId: data.id,
      createdAt: data.created_at,
      message: "تم استلام طلب عرض السعر بنجاح وسيتم التواصل معك قريباً.",
    },
    { status: 201 }
  );
}
