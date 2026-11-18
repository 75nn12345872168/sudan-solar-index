"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
} from "lucide-react";
import { ProvenanceBadge, formatObservedTimeAr } from "@/components/ProvenanceBadge";
import type { EquipmentItem, PriceBasis, SyncLogRecord } from "@/types/solar";

interface AdminOverviewData {
  exchangeRates: Array<{
    id: string;
    parallel_usd_sdg: number;
    official_usd_sdg: number;
    data_status: "live" | "stale" | "demo";
    source: string;
    observed_at: string;
  }>;
  equipment: EquipmentItem[];
  appConfig: Array<{
    key: string;
    value: Record<string, unknown>;
    description_ar: string;
  }>;
  quoteRequests: Array<{
    id: string;
    customer_name: string;
    whatsapp_phone: string;
    city: string;
    preset_or_summary: string;
    capex_sdg: number;
    capex_usd: number;
    recurring_monthly_usd: number;
    status: string;
    created_at: string;
  }>;
  syncLogs: SyncLogRecord[];
  auditLogs: Array<{
    id: string;
    action_type: string;
    target_slug: string | null;
    ip_hash: string;
    created_at: string;
  }>;
}

export function AdminDashboardClient() {
  const [password, setPassword] = useState("");
  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "unauthenticated" | "unconfigured"
  >("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [parallelFx, setParallelFx] = useState("12000");
  const [officialFx, setOfficialFx] = useState("9000");
  const [bosPct, setBosPct] = useState("12");
  const [peakSun, setPeakSun] = useState("5.5");

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.status === 503) {
      const body = (await res.json()) as { code?: string; error?: string };
      if (body.code === "ADMIN_UNCONFIGURED") {
        setAuthState("unconfigured");
        return;
      }
      setAuthError(body.error || "قاعدة البيانات غير متصلة.");
      return;
    }
    if (res.status === 401) {
      setAuthState("unauthenticated");
      return;
    }
    if (res.ok) {
      const data = (await res.json()) as AdminOverviewData;
      setOverview(data);
      setAuthState("authenticated");
      const latestFx = data.exchangeRates[0];
      if (latestFx) {
        setParallelFx(String(latestFx.parallel_usd_sdg));
        setOfficialFx(String(latestFx.official_usd_sdg));
      }
      const bosRow = data.appConfig.find((c) => c.key === "bos_percentage");
      if (bosRow?.value?.percentage !== undefined) {
        setBosPct(String(bosRow.value.percentage));
      }
      const sunRow = data.appConfig.find((c) => c.key === "peak_sun_hours");
      if (sunRow?.value?.hours !== undefined) {
        setPeakSun(String(sunRow.value.hours));
      }
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string; authenticated?: boolean };
      if (res.status === 503) {
        setAuthState("unconfigured");
        setAuthError(data.error || "المتغير ADMIN_PASSWORD غير مضبوط.");
      } else if (!res.ok) {
        setAuthError(data.error || "فشل تسجيل الدخول.");
      } else {
        setPassword("");
        await loadOverview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setOverview(null);
    setAuthState("unauthenticated");
  }

  async function handleUpdateFx(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parallelUsdSdg: Number(parallelFx),
          officialUsdSdg: Number(officialFx),
        }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      setFeedback(
        res.ok
          ? "تم تحديث سعر الصرف وإعادة احتساب الأسعار بالجنيه السوداني."
          : data.error || "تعذر التحديث."
      );
      if (res.ok) await loadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function handleEquipmentSave(
    slug: string,
    referenceUsd: number,
    manualEffectiveUsd: number,
    priceBasis: PriceBasis
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          referenceUsd,
          manualEffectiveUsd,
          priceBasis,
        }),
      });
      const data = (await res.json()) as { error?: string };
      setFeedback(
        res.ok ? `تم تحديث الصنف (${slug}) بنجاح.` : data.error || "فشل التحديث."
      );
      if (res.ok) await loadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveConfig(key: string, value: Record<string, unknown>) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = (await res.json()) as { error?: string };
      setFeedback(
        res.ok ? `تم حفظ الإعداد (${key}).` : data.error || "تعذر الحفظ."
      );
      if (res.ok) await loadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function handleQuoteStatus(id: string, status: string) {
    setBusy(true);
    try {
      await fetch("/api/admin/quotes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await loadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function handleTelegramBroadcast() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/telegram", { method: "POST" });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      setFeedback(
        res.ok
          ? "تم إرسال النشرة الميدانية إلى قناة تيليغرام بنجاح."
          : data.error || "فشل إرسال نشرة تيليغرام."
      );
    } finally {
      setBusy(false);
    }
  }

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-400">
        جاري التحقق من حالة الجلسة...
      </div>
    );
  }

  if (authState === "unconfigured") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-card max-w-md rounded-2xl border-rose-500/40 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-rose-400" />
          <h1 className="text-lg font-bold text-rose-300">
            لوحة الإدارة مقفلة (HTTP 503)
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            تطبق المنصة سياسة الإغلاق الآمن (Fail-Closed). يجب ضبط متغير البيئة{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">
              ADMIN_PASSWORD
            </code>{" "}
            على الخادم بطول لا يقل عن 8 أحرف لتفعيل لوحة الإدارة.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى المرصد
          </Link>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="glass-card w-full max-w-sm space-y-4 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-400" />
            <h1 className="text-base font-bold">دخول لوحة التحديث الميداني</h1>
          </div>

          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="أدخل كلمة مرور الإدارة"
            className="surface-elevated w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500"
          />

          {authError && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            {busy ? "جاري التحقق..." : "تسجيل الدخول"}
          </button>

          <Link
            href="/"
            className="block text-center text-xs text-slate-400 hover:text-white"
          >
            العودة إلى الرئيسية
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h1 className="text-lg font-bold">
            لوحة التحديث الميداني والإدارة — مرصد الطاقة الشمسية
          </h1>
          <p className="text-xs text-slate-400">
            كل تعديل يُسجل تلقائياً في سجل التدقيق (admin_audit_logs)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleTelegramBroadcast}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-3.5 py-2 text-xs font-bold text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
          >
            <Send className="h-3.5 w-3.5" />
            بث نشرة تيليغرام الآن
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="surface-elevated flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="surface-elevated flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </button>
          <Link
            href="/"
            className="surface-elevated flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            الواجهة العامة
          </Link>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
          {feedback}
        </div>
      )}

      {authError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {authError}
        </div>
      )}

      {overview && (
        <>
          {/* FX & Assumptions */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <form
              onSubmit={handleUpdateFx}
              className="glass-card space-y-3 rounded-2xl p-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">تحديث سعر الصرف (USD/SDG)</h2>
                {overview.exchangeRates[0] && (
                  <ProvenanceBadge
                    status={overview.exchangeRates[0].data_status}
                    compact
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="mb-1 block text-slate-400">
                    السوق الموازي (ج.س)
                  </label>
                  <input
                    type="number"
                    min={500}
                    max={50000}
                    step="0.01"
                    value={parallelFx}
                    onChange={(e) => setParallelFx(e.target.value)}
                    className="surface-elevated w-full rounded-xl px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-slate-400">
                    السعر الرسمي (ج.س)
                  </label>
                  <input
                    type="number"
                    min={500}
                    max={50000}
                    step="0.01"
                    value={officialFx}
                    onChange={(e) => setOfficialFx(e.target.value)}
                    className="surface-elevated w-full rounded-xl px-3 py-2 tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                <Save className="h-3.5 w-3.5" />
                حفظ سعر الصرف وتحديث أسعار الجنيه
              </button>
            </form>

            <div className="glass-card space-y-3 rounded-2xl p-5">
              <h2 className="text-sm font-bold">
                تعديل الافتراضات التقديرية (BOS وساعات الذروة)
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="mb-1 block text-slate-400">
                    نسبة التركيب والكابلات BOS (%)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={bosPct}
                      onChange={(e) => setBosPct(e.target.value)}
                      className="surface-elevated w-full rounded-xl px-3 py-2 tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handleSaveConfig("bos_percentage", {
                          percentage: Number(bosPct),
                        })
                      }
                      className="rounded-xl bg-slate-700 px-3 py-2 font-semibold hover:bg-slate-600"
                    >
                      حفظ
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-slate-400">
                    ساعات الذروة الشمسية (PSH)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={peakSun}
                      onChange={(e) => setPeakSun(e.target.value)}
                      className="surface-elevated w-full rounded-xl px-3 py-2 tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handleSaveConfig("peak_sun_hours", {
                          hours: Number(peakSun),
                          derating_factor: 0.8,
                          inverter_efficiency: 0.9,
                        })
                      }
                      className="rounded-xl bg-slate-700 px-3 py-2 font-semibold hover:bg-slate-600"
                    >
                      حفظ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Equipment Three-Tier Pricing Editor */}
          <div className="glass-card rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-bold">
              إدارة أسعار الكتالوج ثلاثية الطبقات (reference / observed / manual)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pl-3">الصنف</th>
                    <th className="py-2 px-2">الحالة</th>
                    <th className="py-2 px-2">المرجعي ($)</th>
                    <th className="py-2 px-2">المرصود ($)</th>
                    <th className="py-2 px-2">الفعلي ($)</th>
                    <th className="py-2 px-2">نوع التسعير</th>
                    <th className="py-2 pr-2">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 tabular-nums">
                  {overview.equipment.map((item) => (
                    <EquipmentAdminRow
                      key={item.slug}
                      item={item}
                      busy={busy}
                      onSave={handleEquipmentSave}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leads (quote_requests) & Logs */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="glass-card rounded-2xl p-5">
              <h2 className="mb-3 text-sm font-bold">
                طلبات عروض الأسعار ({overview.quoteRequests.length})
              </h2>
              <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
                {overview.quoteRequests.length === 0 ? (
                  <p className="text-slate-400">لا توجد طلبات مسجلة بعد.</p>
                ) : (
                  overview.quoteRequests.map((q) => (
                    <div
                      key={q.id}
                      className="surface-elevated space-y-1 rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between">
                        <strong>
                          {q.customer_name} — {q.city}
                        </strong>
                        <select
                          value={q.status}
                          onChange={(e) =>
                            void handleQuoteStatus(q.id, e.target.value)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
                        >
                          <option value="new">جديد</option>
                          <option value="contacted">تم التواصل</option>
                          <option value="quoted">تم التسعير</option>
                          <option value="closed">مغلق</option>
                          <option value="spam">سبام</option>
                        </select>
                      </div>
                      <div className="text-slate-400 tabular-nums">
                        واتساب: {q.whatsapp_phone} | CapEx: ${q.capex_usd}
                      </div>
                      <p className="text-slate-300">{q.preset_or_summary}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <h2 className="mb-3 text-sm font-bold">
                سجل تدقيق الإدارة (admin_audit_logs)
              </h2>
              <div className="max-h-72 space-y-1.5 overflow-y-auto text-xs tabular-nums">
                {overview.auditLogs.length === 0 ? (
                  <p className="text-slate-400">لا توجد سجلات تدقيق بعد.</p>
                ) : (
                  overview.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="surface-elevated flex items-center justify-between rounded-xl px-3 py-2"
                    >
                      <span>
                        {log.action_type}{" "}
                        {log.target_slug ? `(${log.target_slug})` : ""}
                      </span>
                      <span className="text-slate-400">
                        {formatObservedTimeAr(log.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EquipmentAdminRow({
  item,
  busy,
  onSave,
}: {
  item: EquipmentItem;
  busy: boolean;
  onSave: (
    slug: string,
    refUsd: number,
    manualUsd: number,
    basis: PriceBasis
  ) => Promise<void>;
}) {
  const [refVal, setRefVal] = useState(String(item.reference_usd));
  const [effVal, setEffVal] = useState(String(item.effective_usd));
  const [basis, setBasis] = useState<PriceBasis>(item.price_basis);

  return (
    <tr>
      <td className="py-2.5 pl-3 font-medium">{item.name_ar}</td>
      <td className="py-2.5 px-2">
        <ProvenanceBadge status={item.data_status} compact />
      </td>
      <td className="py-2.5 px-2">
        <input
          type="number"
          step="0.01"
          value={refVal}
          onChange={(e) => setRefVal(e.target.value)}
          className="surface-elevated w-20 rounded-lg px-2 py-1 text-xs"
        />
      </td>
      <td className="py-2.5 px-2 text-slate-400">
        {item.observed_usd !== null ? `$${item.observed_usd}` : "—"}
      </td>
      <td className="py-2.5 px-2">
        <input
          type="number"
          step="0.01"
          value={effVal}
          onChange={(e) => setEffVal(e.target.value)}
          className="surface-elevated w-20 rounded-lg px-2 py-1 text-xs"
        />
      </td>
      <td className="py-2.5 px-2">
        <select
          value={basis}
          onChange={(e) => setBasis(e.target.value as PriceBasis)}
          className="surface-elevated rounded-lg px-2 py-1 text-xs"
        >
          <option value="reference">reference</option>
          <option value="observed">observed</option>
          <option value="manual">manual</option>
        </select>
      </td>
      <td className="py-2.5 pr-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onSave(item.slug, Number(refVal), Number(effVal), basis)
          }
          className="rounded-lg bg-amber-500 px-3 py-1 font-bold text-slate-950 hover:bg-amber-400"
        >
          حفظ
        </button>
      </td>
    </tr>
  );
}
