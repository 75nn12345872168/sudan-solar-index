import {
  BASELINE_EQUIPMENT,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_EXCHANGE_RATE,
  DEFAULT_REGIONAL_MARKUPS,
} from "@/lib/baseline-catalog";
import { getPublicSupabaseClient } from "@/lib/supabase";
import type {
  CalculatorAssumptions,
  DataStatus,
  EquipmentItem,
  ExchangeRateRecord,
  PriceObservationRecord,
  RegionalMarkupMap,
  SyncLogRecord,
} from "@/types/solar";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface MarketSnapshot {
  exchangeRate: ExchangeRateRecord;
  equipment: EquipmentItem[];
  assumptions: CalculatorAssumptions;
  syncLogs: SyncLogRecord[];
  recentObservations: PriceObservationRecord[];
  isSupabaseConnected: boolean;
}

export function resolveFreshnessStatus(
  status: DataStatus,
  timestampIso: string | null
): DataStatus {
  if (status === "demo" || !timestampIso) return "demo";
  const parsed = Date.parse(timestampIso);
  if (Number.isNaN(parsed)) return "stale";
  return Date.now() - parsed > TWENTY_FOUR_HOURS_MS ? "stale" : status;
}

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const client = getPublicSupabaseClient();
  if (!client) {
    return {
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      equipment: BASELINE_EQUIPMENT,
      assumptions: DEFAULT_ASSUMPTIONS,
      syncLogs: [],
      recentObservations: [],
      isSupabaseConnected: false,
    };
  }

  try {
    const [fxRes, eqRes, cfgRes, logsRes, obsRes] = await Promise.all([
      client
        .from("exchange_rates")
        .select("*")
        .order("observed_at", { ascending: false })
        .limit(1),
      client.from("solar_equipment").select("*").order("category"),
      client.from("app_config").select("*"),
      client
        .from("sync_logs")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(10),
      client
        .from("price_observations")
        .select("*")
        .order("observed_at", { ascending: false })
        .limit(25),
    ]);

    const rawFx = fxRes.data?.[0];
    const exchangeRate: ExchangeRateRecord = rawFx
      ? {
          id: String(rawFx.id),
          parallel_usd_sdg: Number(rawFx.parallel_usd_sdg),
          official_usd_sdg: Number(rawFx.official_usd_sdg),
          data_status: resolveFreshnessStatus(
            rawFx.data_status as DataStatus,
            rawFx.observed_at ? String(rawFx.observed_at) : null
          ),
          source: String(rawFx.source),
          observed_at: String(rawFx.observed_at),
        }
      : DEFAULT_EXCHANGE_RATE;

    const equipment: EquipmentItem[] =
      eqRes.data && eqRes.data.length > 0
        ? eqRes.data.map((row) => ({
            id: String(row.id),
            slug: String(row.slug),
            category: row.category,
            billing_type: row.billing_type,
            name_ar: String(row.name_ar),
            specs_ar: String(row.specs_ar),
            power_watts_or_ah: Number(row.power_watts_or_ah),
            system_voltage:
              row.system_voltage !== null ? Number(row.system_voltage) : null,
            reference_usd: Number(row.reference_usd),
            observed_usd:
              row.observed_usd !== null ? Number(row.observed_usd) : null,
            market_min_usd:
              row.market_min_usd !== null ? Number(row.market_min_usd) : null,
            market_max_usd:
              row.market_max_usd !== null ? Number(row.market_max_usd) : null,
            effective_usd: Number(row.effective_usd),
            effective_sdg: Number(row.effective_sdg),
            price_basis: row.price_basis,
            data_status: resolveFreshnessStatus(
              row.data_status as DataStatus,
              row.last_observed_at ? String(row.last_observed_at) : null
            ),
            sample_count: Number(row.sample_count ?? 0),
            confidence: row.confidence,
            demand_level: row.demand_level,
            last_observed_at: row.last_observed_at
              ? String(row.last_observed_at)
              : null,
            updated_at: String(row.updated_at),
          }))
        : BASELINE_EQUIPMENT;

    const cfgMap = new Map<string, Record<string, unknown>>();
    for (const row of cfgRes.data ?? []) {
      if (row.key && row.value && typeof row.value === "object") {
        cfgMap.set(String(row.key), row.value as Record<string, unknown>);
      }
    }

    const regionalMarkups =
      (cfgMap.get("regional_markups") as RegionalMarkupMap | undefined) ??
      DEFAULT_REGIONAL_MARKUPS;
    const bosCfg = cfgMap.get("bos_percentage");
    const sunCfg = cfgMap.get("peak_sun_hours");

    const assumptions: CalculatorAssumptions = {
      parallelUsdSdg: exchangeRate.parallel_usd_sdg,
      peakSunHours: Number(sunCfg?.hours ?? DEFAULT_ASSUMPTIONS.peakSunHours),
      deratingFactor: Number(
        sunCfg?.derating_factor ?? DEFAULT_ASSUMPTIONS.deratingFactor
      ),
      inverterEfficiency: Number(
        sunCfg?.inverter_efficiency ?? DEFAULT_ASSUMPTIONS.inverterEfficiency
      ),
      bosPercentage: Number(
        bosCfg?.percentage ?? DEFAULT_ASSUMPTIONS.bosPercentage
      ),
      regionalMarkups,
      isDemoAssumptions: exchangeRate.data_status === "demo",
    };

    const syncLogs: SyncLogRecord[] = (logsRes.data ?? []).map((row) => ({
      id: String(row.id),
      run_mode: row.run_mode,
      status: row.status,
      fx_rate_used:
        row.fx_rate_used !== null ? Number(row.fx_rate_used) : null,
      fx_status: row.fx_status,
      items_updated: Number(row.items_updated ?? 0),
      observations_accepted: Number(row.observations_accepted ?? 0),
      observations_rejected: Number(row.observations_rejected ?? 0),
      error_summary: row.error_summary ? String(row.error_summary) : null,
      executed_at: String(row.executed_at),
    }));

    const recentObservations: PriceObservationRecord[] = (
      obsRes.data ?? []
    ).map((row) => ({
      id: String(row.id),
      equipment_slug: String(row.equipment_slug),
      source_name: String(row.source_name),
      raw_title: String(row.raw_title),
      raw_price_sdg: Number(row.raw_price_sdg),
      normalized_usd: Number(row.normalized_usd),
      accepted: Boolean(row.accepted),
      rejection_reason: row.rejection_reason
        ? String(row.rejection_reason)
        : null,
      observed_at: String(row.observed_at),
    }));

    return {
      exchangeRate,
      equipment,
      assumptions,
      syncLogs,
      recentObservations,
      isSupabaseConnected: true,
    };
  } catch (err) {
    console.error("[fetchMarketSnapshot] falling back to baseline:", err);
    return {
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      equipment: BASELINE_EQUIPMENT,
      assumptions: DEFAULT_ASSUMPTIONS,
      syncLogs: [],
      recentObservations: [],
      isSupabaseConnected: false,
    };
  }
}
