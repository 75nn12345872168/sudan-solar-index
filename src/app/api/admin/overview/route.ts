import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrFailClosed } from "@/lib/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم. يرجى إضافته لإدارة قاعدة البيانات.",
      },
      { status: 503 }
    );
  }

  const [fxRes, eqRes, cfgRes, quotesRes, logsRes, auditRes] = await Promise.all([
    supabase
      .from("exchange_rates")
      .select("*")
      .order("observed_at", { ascending: false })
      .limit(5),
    supabase.from("solar_equipment").select("*").order("category"),
    supabase.from("app_config").select("*"),
    supabase
      .from("quote_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sync_logs")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(20),
    supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return NextResponse.json({
    exchangeRates: fxRes.data ?? [],
    equipment: eqRes.data ?? [],
    appConfig: cfgRes.data ?? [],
    quoteRequests: quotesRes.data ?? [],
    syncLogs: logsRes.data ?? [],
    auditLogs: auditRes.data ?? [],
  });
}
