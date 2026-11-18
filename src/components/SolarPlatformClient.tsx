"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Cpu,
  DollarSign,
  ExternalLink,
  HelpCircle,
  MessageCircle,
  Moon,
  Plus,
  Minus,
  Satellite,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Zap,
} from "lucide-react";
import {
  DEFAULT_APPLIANCES_CATALOG,
  SOLAR_PRESETS,
  type SolarPreset,
} from "@/lib/baseline-catalog";
import { FAQ_ITEMS } from "@/lib/faq-data";
import { calculateSolarSystem } from "@/lib/solar-calculator";
import {
  PriceBasisBadge,
  ProvenanceBadge,
  formatObservedTimeAr,
} from "@/components/ProvenanceBadge";
import { QuoteRequestModal } from "@/components/QuoteRequestModal";
import type {
  ApplianceInput,
  BatteryChemistry,
  CalculatorAssumptions,
  EquipmentCategory,
  EquipmentItem,
  ExchangeRateRecord,
  PriceObservationRecord,
  StarlinkVariant,
  SyncLogRecord,
} from "@/types/solar";

type CurrencyMode = "both" | "sdg" | "usd";
type CategoryFilter = "all" | EquipmentCategory;

interface SolarPlatformClientProps {
  exchangeRate: ExchangeRateRecord;
  equipment: EquipmentItem[];
  assumptions: CalculatorAssumptions;
  syncLogs: SyncLogRecord[];
  recentObservations: PriceObservationRecord[];
  isSupabaseConnected: boolean;
}

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "الكل (14)",
  starlink: "ستارلينك",
  solar_panels: "ألواح شمسية",
  batteries: "بطاريات",
  inverters: "إنفرترات",
  generators: "مولدات",
};

const DEMAND_LABELS: Record<EquipmentItem["demand_level"], string> = {
  high: "طلب مرتفع",
  medium: "طلب متوسط",
  low: "طلب موسمي",
};

const CONFIDENCE_LABELS: Record<EquipmentItem["confidence"], string> = {
  high: "ثقة عالية (5+ عينات)",
  medium: "ثقة متوسطة (2-4 عينات)",
  low: "عينة واحدة",
  none: "بدون رصد سوقي بعد",
};

export function SolarPlatformClient({
  exchangeRate,
  equipment,
  assumptions,
  syncLogs,
  recentObservations,
  isSupabaseConnected,
}: SolarPlatformClientProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("both");
  const [activePresetId, setActivePresetId] = useState<string>(
    "complete_home_fridge"
  );
  const [appliances, setAppliances] = useState<ApplianceInput[]>(
    SOLAR_PRESETS[2].appliances
  );
  const [starlinkVariant, setStarlinkVariant] = useState<StarlinkVariant>(
    SOLAR_PRESETS[2].starlinkVariant
  );
  const [includeStarlinkMonthly, setIncludeStarlinkMonthly] = useState<boolean>(
    SOLAR_PRESETS[2].includeStarlinkMonthly
  );
  const [batteryChemistry, setBatteryChemistry] = useState<BatteryChemistry>(
    SOLAR_PRESETS[2].batteryChemistry
  );
  const [backupHours, setBackupHours] = useState<number>(
    SOLAR_PRESETS[2].backupHours
  );
  const [cityKey, setCityKey] = useState<string>("portsudan");
  const [includeBosInstallation, setIncludeBosInstallation] =
    useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [quoteModalOpen, setQuoteModalOpen] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const result = useMemo(
    () =>
      calculateSolarSystem(
        {
          appliances,
          backupHours,
          batteryChemistry,
          cityKey,
          includeBosInstallation,
          starlinkVariant,
          includeStarlinkMonthly,
        },
        equipment,
        assumptions
      ),
    [
      appliances,
      backupHours,
      batteryChemistry,
      cityKey,
      includeBosInstallation,
      starlinkVariant,
      includeStarlinkMonthly,
      equipment,
      assumptions,
    ]
  );

  const cityLabel =
    assumptions.regionalMarkups[cityKey]?.label_ar ?? "بورتسودان";

  function applyPreset(preset: SolarPreset) {
    setActivePresetId(preset.id);
    setAppliances(preset.appliances.map((a) => ({ ...a })));
    setStarlinkVariant(preset.starlinkVariant);
    setIncludeStarlinkMonthly(preset.includeStarlinkMonthly);
    setBatteryChemistry(preset.batteryChemistry);
    setBackupHours(preset.backupHours);
  }

  function updateApplianceQty(id: string, delta: number) {
    setActivePresetId("custom");
    setAppliances((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      )
    );
  }

  function updateApplianceHours(id: string, hours: number) {
    setActivePresetId("custom");
    setAppliances((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, hoursPerDay: Math.min(24, Math.max(0, hours)) }
          : item
      )
    );
  }

  function formatPrice(usd: number, sdg: number): string {
    const usdStr = `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const sdgStr = `${Math.round(sdg).toLocaleString("en-US")} ج.س`;
    if (currencyMode === "usd") return usdStr;
    if (currencyMode === "sdg") return sdgStr;
    return `${sdgStr} (${usdStr})`;
  }

  const presetLabel =
    SOLAR_PRESETS.find((p) => p.id === activePresetId)?.titleAr ??
    "منظومة مخصصة";

  const systemSummaryText = `${presetLabel} | إنفرتر ${result.selectedInverter.ratedVa / 1000}kVA/${result.selectedInverter.systemVoltage}V | ${result.selectedPanels.count}×${result.selectedPanels.unitWatts}W ألواح | ${result.selectedBattery.count}×${result.selectedBattery.unitAh}Ah (${batteryChemistry === "lifepo4" ? "LiFePO4" : "Gel"}) | ${result.starlinkHardware ? result.starlinkHardware.nameAr : "بدون ستارلينك"} | المدينة: ${cityLabel}`;

  const whatsappText = [
    "مرصد الطاقة الشمسية وستارلينك في السودان",
    `• الباقة: ${presetLabel}`,
    `• المدينة: ${cityLabel}`,
    `• الإنفرتر: ${result.selectedInverter.nameAr}`,
    `• الألواح: ${result.selectedPanels.count} لوح × ${result.selectedPanels.unitWatts}W (${result.selectedPanels.totalArrayWatts}W)`,
    `• البطاريات: ${result.selectedBattery.count} × ${result.selectedBattery.unitAh}Ah/${result.selectedBattery.unitVoltage}V`,
    result.starlinkHardware
      ? `• الإنترنت: ${result.starlinkHardware.nameAr}`
      : "• الإنترنت: بدون ستارلينك",
    `• التكلفة الرأسمالية التقديرية (CapEx): $${result.costs.totalCapexUsd.toLocaleString("en-US")} (${Math.round(result.costs.totalCapexSdg).toLocaleString("en-US")} ج.س)`,
    result.costs.recurringMonthlyUsd > 0
      ? `• الاشتراك الشهري المنفصل: $${result.costs.recurringMonthlyUsd}/شهر`
      : "",
    `• حالة بيانات التسعير: ${exchangeRate.data_status === "live" ? "بيانات حية" : exchangeRate.data_status === "stale" ? "آخر رصد قديم" : "أسعار مرجعية تقديرية"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  const filteredEquipment = useMemo(() => {
    if (categoryFilter === "all") return equipment;
    return equipment.filter((item) => item.category === categoryFilter);
  }, [equipment, categoryFilter]);

  const gaugeColor =
    result.loadStatus === "optimal"
      ? "bg-emerald-500 text-emerald-400"
      : result.loadStatus === "moderate"
      ? "bg-amber-500 text-amber-400"
      : "bg-rose-500 text-rose-400";

  const hasAnyLiveEquipment = equipment.some((e) => e.data_status === "live");

  return (
    <div className="min-h-screen pb-28 md:pb-12">
      {/* Top FX & Provenance Ticker */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0B1120]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                مرصد الطاقة الشمسية وستارلينك في السودان
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <ProvenanceBadge status={exchangeRate.data_status} compact />
                <span className="tabular-nums">
                  آخر رصد للصرف: {formatObservedTimeAr(exchangeRate.observed_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* FX Pill */}
            <div className="surface-elevated flex items-center gap-3 rounded-xl px-3 py-1.5 text-xs tabular-nums">
              <div>
                <span className="text-slate-400">الموازي: </span>
                <strong className="text-amber-400">
                  {exchangeRate.parallel_usd_sdg.toLocaleString("en-US")} ج.س
                </strong>
              </div>
              <span className="text-slate-600">|</span>
              <div>
                <span className="text-slate-400">الرسمي: </span>
                <strong>
                  {exchangeRate.official_usd_sdg.toLocaleString("en-US")} ج.س
                </strong>
              </div>
            </div>

            {/* Currency Switcher */}
            <div className="surface-elevated flex rounded-xl p-1 text-xs font-medium">
              {(
                [
                  ["both", "كلاهما"],
                  ["sdg", "ج.س SDG"],
                  ["usd", "$ USD"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCurrencyMode(mode)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    currencyMode === mode
                      ? "bg-amber-500 font-bold text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Light/Dark Toggle */}
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="surface-elevated rounded-xl p-2 text-slate-300 hover:text-amber-400"
              aria-label="تبديل المظهر الفاتح والداكن"
              title="تبديل المظهر"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <Link
              href="/admin/update"
              className="surface-elevated flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-cyan-400 hover:border-cyan-500/40"
            >
              <Settings className="h-3.5 w-3.5" />
              لوحة الإدارة
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 pt-6">
        {/* Explicit Provenance & Assumptions Banner */}
        <section
          aria-label="شفافية مصادر البيانات"
          className="glass-card flex flex-col justify-between gap-4 rounded-2xl border-cyan-500/25 p-4 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
            <div className="space-y-1 text-xs leading-relaxed text-slate-300">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                <span>مؤشر شفافية البيانات والافتراضات</span>
                <ProvenanceBadge
                  status={hasAnyLiveEquipment ? "live" : exchangeRate.data_status}
                />
              </div>
              <p>
                {hasAnyLiveEquipment
                  ? "تُعرض الأصناف المرصودة بالوسيط السعري بعد استبعاد القيم الشاذة (±35%)، مع حفظ الطابع الزمني الدقيق لكل صنف."
                  : "الأسعار ونسب الشحن الإقليمي وتكلفة التركيب (BOS 12%) المعروضة حالياً هي افتراضات مرجعية قابلة للتعديل (Demo Baseline) ريثما يتم ربط قاعدة البيانات وتشغيل الرصد اليومي."}
                {!isSupabaseConnected &&
                  " (وضع العرض المحلي غير المتصل بقاعدة بيانات Supabase)."}
              </p>
            </div>
          </div>

          <a
            href="https://tasaheel-bice.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-300 ring-1 ring-cyan-500/40 transition hover:bg-cyan-500/25"
          >
            <span>سوق تساهيل للإعلانات المبوبة (Tasaheel)</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>

        {/* One-Click Presets */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Zap className="h-5 w-5 text-amber-400" />
              باقات مقترحة بضغطة واحدة
            </h2>
            <span className="text-xs text-slate-400">
              اضغط على أي باقة لضبط الأحمال تلقائياً
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SOLAR_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`glass-card relative flex flex-col items-start rounded-2xl p-4 text-right transition ${
                    selected
                      ? "border-amber-500 ring-2 ring-amber-500/30"
                      : "hover:border-slate-600"
                  }`}
                >
                  {preset.badgeAr && (
                    <span className="mb-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-950">
                      {preset.badgeAr}
                    </span>
                  )}
                  <span className="text-sm font-bold">{preset.titleAr}</span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-400">
                    {preset.subtitleAr}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Interactive Calculator Grid */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left/Right RTL Controls Column (7 cols) */}
          <div className="space-y-5 lg:col-span-7">
            <div className="glass-card rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <SlidersHorizontal className="h-4 w-4 text-amber-400" />
                  1. تفاصيل الأحمال والأجهزة الكهربائية
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setActivePresetId("custom");
                    setAppliances(
                      DEFAULT_APPLIANCES_CATALOG.map((a) => ({
                        ...a,
                        quantity: 0,
                      }))
                    );
                  }}
                  className="text-xs text-slate-400 hover:text-amber-400"
                >
                  تصفير الكل
                </button>
              </div>

              <div className="space-y-2.5">
                {appliances.map((app) => (
                  <div
                    key={app.id}
                    className="surface-elevated flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
                  >
                    <div className="min-w-[180px] flex-1">
                      <div className="text-sm font-semibold">{app.nameAr}</div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400 tabular-nums">
                        <span>{app.runningWatts}W</span>
                        <span>• معامل تشغيل {Math.round(app.dutyCycle * 100)}%</span>
                        {app.surgeMultiplier > 1 && (
                          <span className="text-amber-400">
                            • إقلاع {app.surgeMultiplier}x
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span>ساعات/يوم:</span>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          value={app.hoursPerDay}
                          onChange={(e) =>
                            updateApplianceHours(app.id, Number(e.target.value))
                          }
                          className="w-14 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center text-xs tabular-nums text-white"
                        />
                      </label>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateApplianceQty(app.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-500"
                          aria-label={`تقليل ${app.nameAr}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">
                          {app.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateApplianceQty(app.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-500"
                          aria-label={`زيادة ${app.nameAr}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Starlink, Battery Chemistry, City & BOS Settings */}
            <div className="glass-card grid grid-cols-1 gap-4 rounded-2xl p-5 sm:grid-cols-2">
              {/* Starlink Selector */}
              <div className="space-y-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-bold text-cyan-400">
                  <Satellite className="h-4 w-4" />
                  2. الإنترنت الفضائي (Starlink)
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["none", "بدون ستارلينك", "0W"],
                      ["mini", "Starlink Mini", "35W محمول"],
                      ["standard_v4", "Starlink Gen 3 / V4", "75W قياسي"],
                    ] as const
                  ).map(([val, title, sub]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setStarlinkVariant(val);
                        if (val === "none") setIncludeStarlinkMonthly(false);
                      }}
                      className={`rounded-xl border p-2.5 text-right text-xs transition ${
                        starlinkVariant === val
                          ? "border-cyan-400 bg-cyan-500/15 text-white"
                          : "border-slate-700/60 bg-slate-900/50 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <div className="font-bold">{title}</div>
                      <div className="mt-0.5 text-[11px] tabular-nums">{sub}</div>
                    </button>
                  ))}
                </div>

                {starlinkVariant !== "none" && (
                  <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs">
                    <span>
                      عرض تقدير الاشتراك الشهري المتكرر (Roam Unlimited — يُحسب منفصلاً عن CapEx)
                    </span>
                    <input
                      type="checkbox"
                      checked={includeStarlinkMonthly}
                      onChange={(e) => setIncludeStarlinkMonthly(e.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                )}
              </div>

              {/* Battery Chemistry */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  نوع البطاريات (عمق التفريغ DoD)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatteryChemistry("gel")}
                    className={`rounded-xl border p-2.5 text-xs font-semibold ${
                      batteryChemistry === "gel"
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-slate-700 text-slate-400"
                    }`}
                  >
                    جل (50% DoD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatteryChemistry("lifepo4")}
                    className={`rounded-xl border p-2.5 text-xs font-semibold ${
                      batteryChemistry === "lifepo4"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 text-slate-400"
                    }`}
                  >
                    ليثيوم LiFePO4 (80%)
                  </button>
                </div>
              </div>

              {/* Backup Hours */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>ساعات التشغيل الاحتياطي (الليل/القطوعات)</span>
                  <span className="tabular-nums text-amber-400">
                    {backupHours} ساعة
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={16}
                  step={1}
                  value={backupHours}
                  onChange={(e) => setBackupHours(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              {/* City Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  المدينة (افتراضات شحن إقليمية قابلة للتعديل)
                </label>
                <select
                  value={cityKey}
                  onChange={(e) => setCityKey(e.target.value)}
                  className="surface-elevated w-full rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-amber-500"
                >
                  {Object.entries(assumptions.regionalMarkups).map(
                    ([key, opt]) => (
                      <option key={key} value={key} className="bg-slate-900">
                        {opt.label_ar} (+{opt.markup_pct}% شحن تقديري)
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* BOS Installation Toggle */}
              <div className="flex items-end">
                <label className="surface-elevated flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-xs">
                  <span>
                    إضافة كابلات وحوامل وتركيب BOS (+{assumptions.bosPercentage}% تقديري)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeBosInstallation}
                    onChange={(e) => setIncludeBosInstallation(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Engineering Sizing & Cost Output Column (5 cols) */}
          <div className="space-y-5 lg:col-span-5">
            <div className="glass-card rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Cpu className="h-5 w-5 text-amber-400" />
                  النتيجة الهندسية والتكلفة
                </h2>
                <ProvenanceBadge status={exchangeRate.data_status} compact />
              </div>

              {/* Live Inverter Load Gauge */}
              <div className="surface-elevated mb-4 rounded-xl p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold">مؤشر تحميل الإنفرتر المستمر</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${gaugeColor} bg-opacity-20`}
                  >
                    {result.selectedInverter.loadUtilizationPct}% من{" "}
                    {result.selectedInverter.ratedWatts}W
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      result.loadStatus === "optimal"
                        ? "bg-emerald-500"
                        : result.loadStatus === "moderate"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{
                      width: `${Math.min(100, result.selectedInverter.loadUtilizationPct)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-400 tabular-nums">
                  <span>الحمل المستمر: {result.totalContinuousWatts}W</span>
                  <span>تيار الإقلاع الأقصى: {result.peakSurgeWatts}W</span>
                </div>
              </div>

              {/* Engineering Warnings */}
              {result.warningsAr.length > 0 && (
                <div className="mb-4 space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  {result.warningsAr.map((w, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended Hardware Specs */}
              <div className="space-y-2.5 text-xs">
                <div className="surface-elevated flex items-center justify-between rounded-xl p-3">
                  <div>
                    <div className="font-bold text-white">
                      {result.selectedInverter.nameAr}
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      فولتية النظام: {result.selectedInverter.systemVoltage}V | قدرة الإقلاع:{" "}
                      {result.selectedInverter.surgeWatts}W
                    </div>
                  </div>
                  <div className="font-bold tabular-nums text-amber-400">
                    ${result.selectedInverter.unitPriceUsd.toLocaleString("en-US")}
                  </div>
                </div>

                <div className="surface-elevated flex items-center justify-between rounded-xl p-3">
                  <div>
                    <div className="font-bold text-white">
                      {result.selectedPanels.count} × {result.selectedPanels.nameAr}
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      القدرة الكلية: {result.selectedPanels.totalArrayWatts}W (توليد{" "}
                      {Math.round(result.selectedPanels.estimatedDailyGenWh)}Wh/يوم عند{" "}
                      {assumptions.peakSunHours}h ذروة)
                    </div>
                  </div>
                  <div className="font-bold tabular-nums text-amber-400">
                    ${result.selectedPanels.totalPriceUsd.toLocaleString("en-US")}
                  </div>
                </div>

                <div className="surface-elevated flex items-center justify-between rounded-xl p-3">
                  <div>
                    <div className="font-bold text-white">
                      {result.selectedBattery.count} × {result.selectedBattery.nameAr}
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      توصيل: {result.selectedBattery.seriesCount} توالي ×{" "}
                      {result.selectedBattery.parallelStrings} توازي | فعلي:{" "}
                      {Math.round(result.selectedBattery.usableBankWh)}Wh
                    </div>
                  </div>
                  <div className="font-bold tabular-nums text-amber-400">
                    ${result.selectedBattery.totalPriceUsd.toLocaleString("en-US")}
                  </div>
                </div>

                {result.starlinkHardware && (
                  <div className="surface-elevated flex items-center justify-between rounded-xl border-cyan-500/30 p-3">
                    <div>
                      <div className="font-bold text-cyan-300">
                        {result.starlinkHardware.nameAr}
                      </div>
                      <div className="text-slate-400 tabular-nums">
                        استهلاك الهوائي: {result.starlinkHardware.watts}W
                      </div>
                    </div>
                    <div className="font-bold tabular-nums text-cyan-400">
                      ${result.starlinkHardware.unitPriceUsd.toLocaleString("en-US")}
                    </div>
                  </div>
                )}
              </div>

              {/* Strictly Separated CapEx vs Recurring Monthly */}
              <div className="mt-4 space-y-2 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900 p-4">
                <div className="flex items-center justify-between text-xs text-slate-300 tabular-nums">
                  <span>تكلفة المعدات الأساسية</span>
                  <span>${result.costs.hardwareBaseUsd.toLocaleString("en-US")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300 tabular-nums">
                  <span>
                    تقدير شحن {cityLabel} (+{result.costs.regionalMarkupPct}%)
                  </span>
                  <span>${result.costs.regionalMarkupUsd.toLocaleString("en-US")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300 tabular-nums">
                  <span>الكابلات والتركيب BOS (+{result.costs.bosPercentage}%)</span>
                  <span>${result.costs.bosUsd.toLocaleString("en-US")}</span>
                </div>

                <div className="border-t border-slate-700/80 pt-3">
                  <div className="text-xs font-semibold text-amber-300">
                    إجمالي التكلفة الرأسمالية التأسيسية (CapEx - مرة واحدة)
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-white">
                    {formatPrice(
                      result.costs.totalCapexUsd,
                      result.costs.totalCapexSdg
                    )}
                  </div>
                </div>

                {result.costs.recurringMonthlyUsd > 0 && (
                  <div className="mt-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="text-[11px] font-bold text-cyan-300">
                      الاشتراك الشهري المتكرر (منفصل تماماً عن CapEx):
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-cyan-200">
                      {formatPrice(
                        result.costs.recurringMonthlyUsd,
                        result.costs.recurringMonthlySdg
                      )}{" "}
                      / شهرياً
                    </div>
                  </div>
                )}
              </div>

              {/* Action CTAs */}
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setQuoteModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <DollarSign className="h-4 w-4" />
                  اطلب عرض سعر من مورد في مدينتك
                </button>
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                >
                  <MessageCircle className="h-4 w-4" />
                  مشاركة المقايسة عبر واتساب
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Equipment Market Board */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BatteryCharging className="h-5 w-5 text-amber-400" />
              مؤشر أسعار السوق للمعدات (14 صنفاً)
            </h2>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    categoryFilter === cat
                      ? "bg-amber-500 text-slate-950"
                      : "surface-elevated text-slate-300 hover:text-white"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEquipment.map((item) => {
              const hasRange =
                item.market_min_usd !== null &&
                item.market_max_usd !== null &&
                item.market_max_usd > item.market_min_usd;

              const markerPct = hasRange
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      ((item.effective_usd - item.market_min_usd!) /
                        (item.market_max_usd! - item.market_min_usd!)) *
                        100
                    )
                  )
                : 50;

              return (
                <article
                  key={item.slug}
                  className="glass-card flex flex-col justify-between rounded-2xl p-4"
                >
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                      <ProvenanceBadge status={item.data_status} compact />
                      <PriceBasisBadge basis={item.price_basis} />
                    </div>

                    <h3 className="text-sm font-bold leading-snug">
                      {item.name_ar}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {item.specs_ar}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3 border-t border-slate-800/80 pt-3">
                    <div className="flex items-baseline justify-between">
                      <div className="text-base font-bold tabular-nums text-amber-400">
                        {formatPrice(item.effective_usd, item.effective_sdg)}
                        {item.billing_type === "recurring_monthly" && (
                          <span className="mr-1 text-xs font-normal text-cyan-400">
                            /شهرياً
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {DEMAND_LABELS[item.demand_level]}
                      </span>
                    </div>

                    {/* Fair-Price Range Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
                        <span>
                          المرجعي: ${item.reference_usd.toLocaleString("en-US")}
                        </span>
                        <span>
                          {hasRange
                            ? `نطاق السوق: $${item.market_min_usd} - $${item.market_max_usd}`
                            : CONFIDENCE_LABELS[item.confidence]}
                        </span>
                      </div>
                      <div className="relative h-2 w-full rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            hasRange
                              ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 opacity-75"
                              : "bg-slate-700"
                          }`}
                        />
                        {hasRange && (
                          <span
                            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
                            style={{ left: `${markerPct}%` }}
                            title={`الوسيط الفعلي: $${item.effective_usd}`}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                      <span>العينات: {item.sample_count}</span>
                      <span>
                        آخر رصد: {formatObservedTimeAr(item.last_observed_at)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Sync History & Observation Log (Honest empty state — never fake historical curves) */}
        <section className="glass-card rounded-2xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Activity className="h-5 w-5 text-cyan-400" />
              سجل الرصد اليومي وتدقيق العينات (بدون بيانات تاريخية مصطنعة)
            </h2>
            <span className="text-xs text-slate-400 tabular-nums">
              {syncLogs.length} تشغيل مسجل | {recentObservations.length} عينة حديثة
            </span>
          </div>

          {syncLogs.length === 0 && recentObservations.length === 0 ? (
            <div className="surface-elevated rounded-xl p-4 text-xs leading-relaxed text-slate-300">
              لا توجد تشغيلات رصد حية مسجلة في قاعدة البيانات بعد. يعرض المؤشر حالياً
              الأسعار المرجعية التقديرية (Demo) فقط ولن يتم رسم أي منحنيات تاريخية
              مصطنعة حتى تتراكم قراءات الرصد الفعلية عبر GitHub Actions أو لوحة الإدارة.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300">
                  آخر عمليات المزامنة (sync_logs)
                </h3>
                <div className="space-y-1.5 text-xs tabular-nums">
                  {syncLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="surface-elevated flex items-center justify-between rounded-xl px-3 py-2"
                    >
                      <span>
                        {log.status === "success" ? (
                          <CheckCircle2 className="ml-1.5 inline h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-amber-400" />
                        )}
                        {formatObservedTimeAr(log.executed_at)}
                      </span>
                      <span className="text-slate-300">
                        مقبول: {log.observations_accepted} | مرفوض:{" "}
                        {log.observations_rejected}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300">
                  أحدث العينات المرصودة وسبب الرفض (price_observations)
                </h3>
                <div className="max-h-48 space-y-1.5 overflow-y-auto text-xs tabular-nums">
                  {recentObservations.slice(0, 8).map((obs) => (
                    <div
                      key={obs.id}
                      className="surface-elevated flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                    >
                      <span className="truncate">{obs.raw_title}</span>
                      <span
                        className={
                          obs.accepted ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        ${obs.normalized_usd}{" "}
                        {obs.accepted ? "✓" : `(${obs.rejection_reason})`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* FAQ Section (Paired with JSON-LD FAQPage) */}
        <section className="glass-card rounded-2xl p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
            <HelpCircle className="h-5 w-5 text-amber-400" />
            الأسئلة الشائعة ومنهجية الحساب
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FAQ_ITEMS.map((faq, idx) => (
              <div key={idx} className="surface-elevated rounded-xl p-4">
                <h3 className="text-sm font-bold text-amber-300">{faq.q}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Mobile Sticky Bottom Summary Bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-[#0B1120]/95 p-3 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400">
              التكلفة التأسيسية ({cityLabel}) | حمل {result.selectedInverter.loadUtilizationPct}%
            </div>
            <div className="truncate text-sm font-bold tabular-nums text-amber-400">
              {formatPrice(result.costs.totalCapexUsd, result.costs.totalCapexSdg)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQuoteModalOpen(true)}
            className="shrink-0 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950"
          >
            اطلب عرض سعر
          </button>
        </div>
      </div>

      <QuoteRequestModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        cityLabel={cityLabel}
        presetOrSummary={systemSummaryText}
        capexSdg={result.costs.totalCapexSdg}
        capexUsd={result.costs.totalCapexUsd}
        recurringMonthlyUsd={result.costs.recurringMonthlyUsd}
        whatsappShareUrl={whatsappShareUrl}
      />
    </div>
  );
}
