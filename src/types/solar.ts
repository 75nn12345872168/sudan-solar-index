export type DataStatus = "live" | "stale" | "demo";

export type PriceBasis = "reference" | "observed" | "manual";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type EquipmentCategory =
  | "starlink"
  | "solar_panels"
  | "batteries"
  | "inverters"
  | "generators";

export type BillingType = "one_time" | "recurring_monthly";

export type BatteryChemistry = "gel" | "lifepo4";

export type SystemVoltage = 12 | 24 | 48;

export interface ExchangeRateRecord {
  id: string;
  parallel_usd_sdg: number;
  official_usd_sdg: number;
  data_status: DataStatus;
  source: string;
  observed_at: string;
}

export interface EquipmentItem {
  id: string;
  slug: string;
  category: EquipmentCategory;
  billing_type: BillingType;
  name_ar: string;
  specs_ar: string;
  power_watts_or_ah: number;
  system_voltage: number | null;
  reference_usd: number;
  observed_usd: number | null;
  market_min_usd: number | null;
  market_max_usd: number | null;
  effective_usd: number;
  effective_sdg: number;
  price_basis: PriceBasis;
  data_status: DataStatus;
  sample_count: number;
  confidence: ConfidenceLevel;
  demand_level: "high" | "medium" | "low";
  last_observed_at: string | null;
  updated_at: string;
}

export interface RegionalMarkupOption {
  label_ar: string;
  markup_pct: number;
}

export type RegionalMarkupMap = Record<string, RegionalMarkupOption>;

export interface CalculatorAssumptions {
  parallelUsdSdg: number;
  peakSunHours: number;
  deratingFactor: number;
  inverterEfficiency: number;
  bosPercentage: number;
  regionalMarkups: RegionalMarkupMap;
  isDemoAssumptions: boolean;
}

export interface ApplianceInput {
  id: string;
  nameAr: string;
  quantity: number;
  runningWatts: number;
  surgeMultiplier: number;
  dutyCycle: number;
  hoursPerDay: number;
  includeInBackup?: boolean;
}

export type StarlinkVariant = "standard_v4" | "mini" | "none";

export interface CalculatorInput {
  appliances: ApplianceInput[];
  backupHours: number;
  batteryChemistry: BatteryChemistry;
  cityKey: string;
  includeBosInstallation: boolean;
  starlinkVariant: StarlinkVariant;
  includeStarlinkMonthly: boolean;
}

export interface SelectedInverterSummary {
  slug: string;
  nameAr: string;
  ratedVa: number;
  ratedWatts: number;
  surgeWatts: number;
  systemVoltage: SystemVoltage;
  unitPriceUsd: number;
  loadUtilizationPct: number;
  surgeUtilizationPct: number;
}

export interface SelectedBatterySummary {
  slug: string;
  nameAr: string;
  chemistry: BatteryChemistry;
  unitAh: number;
  unitVoltage: number;
  unitWh: number;
  count: number;
  seriesCount: number;
  parallelStrings: number;
  totalBankWh: number;
  usableBankWh: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

export interface SelectedPanelsSummary {
  slug: string;
  nameAr: string;
  unitWatts: number;
  count: number;
  totalArrayWatts: number;
  estimatedDailyGenWh: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

export interface CalculatorCosts {
  hardwareBaseUsd: number;
  regionalMarkupPct: number;
  regionalMarkupUsd: number;
  bosPercentage: number;
  bosUsd: number;
  totalCapexUsd: number;
  totalCapexSdg: number;
  recurringMonthlyUsd: number;
  recurringMonthlySdg: number;
}

export interface CalculatorResult {
  totalContinuousWatts: number;
  averageDutyWatts: number;
  peakSurgeWatts: number;
  dailyEnergyWh: number;
  backupEnergyWh: number;
  requiredBatteryUsableWh: number;
  requiredBatteryGrossWh: number;
  batteryDoD: number;
  selectedInverter: SelectedInverterSummary;
  selectedBattery: SelectedBatterySummary;
  selectedPanels: SelectedPanelsSummary;
  starlinkHardware: {
    slug: string;
    nameAr: string;
    unitPriceUsd: number;
    watts: number;
  } | null;
  starlinkMonthly: {
    slug: string;
    nameAr: string;
    monthlyUsd: number;
    monthlySdg: number;
  } | null;
  costs: CalculatorCosts;
  loadStatus: "optimal" | "moderate" | "overload_risk";
  warningsAr: string[];
}

export interface SyncLogRecord {
  id: string;
  run_mode: "live" | "dry_run";
  status: "success" | "partial" | "failed";
  fx_rate_used: number | null;
  fx_status: DataStatus;
  items_updated: number;
  observations_accepted: number;
  observations_rejected: number;
  error_summary: string | null;
  executed_at: string;
}

export interface PriceObservationRecord {
  id: string;
  equipment_slug: string;
  source_name: string;
  raw_title: string;
  raw_price_sdg: number;
  normalized_usd: number;
  accepted: boolean;
  rejection_reason: string | null;
  observed_at: string;
}
