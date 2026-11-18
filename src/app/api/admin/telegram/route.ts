import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit, requireAdminOrFailClosed } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

const STATUS_AR: Record<string, string> = {
  live: "بيانات حية (Live)",
  stale: "آخر رصد قديم (>24 ساعة)",
  demo: "أسعار مرجعية تقديرية (Demo)",
};

export async function POST(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`admin-tg:${getClientIp(request)}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم إرسال نشرة تيليغرام مؤخراً. يرجى الانتظار قليلاً." },
      { status: 429 }
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!botToken || !channelId) {
    return NextResponse.json(
      {
        error:
          "إعدادات تيليغرام (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID) غير مضبوطة على الخادم.",
      },
      { status: 503 }
    );
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير متصلة." },
      { status: 503 }
    );
  }

  const [fxRes, eqRes] = await Promise.all([
    supabase
      .from("exchange_rates")
      .select("*")
      .order("observed_at", { ascending: false })
      .limit(1),
    supabase
      .from("solar_equipment")
      .select("*")
      .in("slug", [
        "starlink-v4-standard",
        "panel-longi-550w",
        "battery-gel-200ah-12v",
        "inverter-5500va-48v",
      ]),
  ]);

  const fx = fxRes.data?.[0];
  const fxRate = Number(fx?.parallel_usd_sdg ?? 12000);
  const fxStatus = String(fx?.data_status ?? "demo");
  const fxTime = String(fx?.observed_at ?? "غير محدد");

  const lines = [
    "📊 *تحديث يدوي — مرصد الطاقة الشمسية وستارلينك في السودان*",
    `• دولار السوق الموازي: *${fxRate.toLocaleString("en-US")} ج.س* (${STATUS_AR[fxStatus] ?? fxStatus})`,
    `• تاريخ الرصد (FX): \`${fxTime}\``,
    "",
    "⚡ *أبرز المؤشرات:*",
  ];

  for (const item of eqRes.data ?? []) {
    const badge = STATUS_AR[String(item.data_status)] ?? String(item.data_status);
    const obsTs = item.last_observed_at ?? "سعر مرجعي/يدوي";
    lines.push(
      `- ${item.name_ar}: *$${Number(item.effective_usd).toLocaleString("en-US")}* (${Number(item.effective_sdg).toLocaleString("en-US")} ج.س) | ${badge} | آخر رصد: \`${obsTs}\``
    );
  }

  const message = lines.join("\n");
  const tgRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    }
  );

  if (!tgRes.ok) {
    return NextResponse.json(
      { error: "فشل الإرسال إلى Telegram Bot API." },
      { status: 502 }
    );
  }

  await recordAdminAudit(supabase, request, {
    actionType: "manual_telegram_broadcast",
    targetSlug: channelId,
    newValue: { fxRate, fxStatus },
  });

  return NextResponse.json({ ok: true, messagePreview: message });
}
