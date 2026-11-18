import type {
  ApplianceInput,
  BatteryChemistry,
  CalculatorAssumptions,
  CalculatorInput,
  CalculatorResult,
  EquipmentItem,
  SystemVoltage,
} from "@/types/solar";

interface InverterTierSpec {
  slug: string;
  ratedVa: number;
  ratedWatts: number;
  surgeWatts: number;
  systemVoltage: SystemVoltage;
  defaultNameAr: string;
  defaultPriceUsd: number;
}

const INVERTER_TIERS: InverterTierSpec[] = [
  {
    slug: "inverter-1500va-12v",
    ratedVa: 1500,
    ratedWatts: 1200,
    surgeWatts: 2400,
    systemVoltage: 12,
    defaultNameAr: "إنفرتر هايبرد موجة نقية 1.5kVA / 12V",
    defaultPriceUsd: 210,
  },
  {
    slug: "inverter-3500va-24v",
    ratedVa: 3500,
    ratedWatts: 3000,
    surgeWatts: 6000,
    systemVoltage: 24,
    defaultNameAr: "إنفرتر هايبرد موجة نقية 3.5kVA / 24V",
    defaultPriceUsd: 390,
  },
  {
    slug: "inverter-5500va-48v",
    ratedVa: 5500,
    ratedWatts: 5000,
    surgeWatts: 10000,
    systemVoltage: 48,
    defaultNameAr: "إنفرتر هايبرد موجة نقية 5.5kVA / 48V",
    defaultPriceUsd: 580,
  },
  {
    slug: "inverter-8000va-48v",
    ratedVa: 8000,
    ratedWatts: 7500,
    surgeWatts: 15000,
    systemVoltage: 48,
    defaultNameAr: "إنفرتر هايبرد صناعي 8.0kVA / 48V",
    defaultPriceUsd: 920,
  },
];

const BATTERY_DOD: Record<BatteryChemistry, number> = {
  gel: 0.5,
  lifepo4: 0.8,
};

const LFP_MAX_24V_PARALLEL_USABLE_WH = 4096; // 2 x 24V(25.6V) 100Ah x 80% DoD

function computeBatteryUnitWh(
  chemistry: BatteryChemistry,
  unitAh: number,
  unitVoltage: number
): number {
  if (chemistry === "lifepo4") {
    const nominalVoltage =
      unitVoltage === 24 ? 25.6 : unitVoltage === 48 ? 51.2 : unitVoltage;
    return unitAh * nominalVoltage;
  }
  return unitAh * unitVoltage;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function findEquipment(
  catalog: EquipmentItem[],
  slug: string
): EquipmentItem | undefined {
  return catalog.find((item) => item.slug === slug);
}

function resolveBatteryModel(
  catalog: EquipmentItem[],
  chemistry: BatteryChemistry,
  systemVoltage: SystemVoltage
): {
  slug: string;
  nameAr: string;
  unitAh: number;
  unitVoltage: number;
  unitPriceUsd: number;
  seriesCount: number;
} {
  if (chemistry === "gel") {
    const gel =
      findEquipment(catalog, "battery-gel-200ah-12v") ??
      catalog.find((i) => i.category === "batteries" && i.system_voltage === 12);
    const unitVoltage = gel?.system_voltage ?? 12;
    const seriesCount = Math.max(1, Math.round(systemVoltage / unitVoltage));
    return {
      slug: gel?.slug ?? "battery-gel-200ah-12v",
      nameAr: gel?.name_ar ?? "بطارية جل ديب سايكل 200 أمبير / 12 فولت",
      unitAh: gel?.power_watts_or_ah ?? 200,
      unitVoltage,
      unitPriceUsd: gel?.effective_usd ?? 240,
      seriesCount,
    };
  }

  // LiFePO4: prefer voltage-native battery module matching systemVoltage (24V or 48V)
  if (systemVoltage === 48) {
    const lfp48 = findEquipment(catalog, "battery-lifepo4-100ah-48v");
    if (lfp48) {
      return {
        slug: lfp48.slug,
        nameAr: lfp48.name_ar,
        unitAh: lfp48.power_watts_or_ah,
        unitVoltage: lfp48.system_voltage ?? 48,
        unitPriceUsd: lfp48.effective_usd,
        seriesCount: 1,
      };
    }
  }

  const lfp24 = findEquipment(catalog, "battery-lifepo4-100ah-24v");
  const unitVoltage = lfp24?.system_voltage ?? 24;
  const seriesCount = Math.max(1, Math.round(systemVoltage / unitVoltage));
  return {
    slug: lfp24?.slug ?? "battery-lifepo4-100ah-24v",
    nameAr: lfp24?.name_ar ?? "بطارية ليثيوم فوسفات 100 أمبير / 24 فولت",
    unitAh: lfp24?.power_watts_or_ah ?? 100,
    unitVoltage,
    unitPriceUsd: lfp24?.effective_usd ?? 520,
    seriesCount,
  };
}

/**
 * Pure engineering solar & Starlink sizing calculator.
 * - Models per-appliance duty cycles, daily Wh/day, and motor/compressor startup surges.
 * - Enforces <= 80% continuous inverter loading AND surge coverage, plus battery/inverter voltage compatibility.
 * - Strictly separates recurring monthly subscriptions (Starlink Roam) from one-time CapEx.
 */
export function calculateSolarSystem(
  input: CalculatorInput,
  catalog: EquipmentItem[],
  assumptions: CalculatorAssumptions
): CalculatorResult {
  const warningsAr: string[] = [];

  const starlinkHardwareItem =
    input.starlinkVariant === "standard_v4"
      ? findEquipment(catalog, "starlink-v4-standard")
      : input.starlinkVariant === "mini"
      ? findEquipment(catalog, "starlink-mini")
      : undefined;

  const starlinkMonthlyItem = input.includeStarlinkMonthly
    ? findEquipment(catalog, "starlink-roam-monthly")
    : undefined;

  // Build effective electrical loads; include selected Starlink dish wattage if not already present
  const effectiveAppliances: ApplianceInput[] = input.appliances.map((item) => ({
    ...item,
    quantity: Math.max(0, Math.floor(item.quantity)),
    runningWatts: Math.max(0, item.runningWatts),
    surgeMultiplier: clamp(item.surgeMultiplier, 1, 10),
    dutyCycle: clamp(item.dutyCycle, 0, 1),
    hoursPerDay: clamp(item.hoursPerDay, 0, 24),
  }));

  const hasExplicitStarlinkLoad = effectiveAppliances.some((a) =>
    a.id.toLowerCase().includes("starlink")
  );

  if (starlinkHardwareItem && !hasExplicitStarlinkLoad) {
    effectiveAppliances.push({
      id: `starlink_${input.starlinkVariant}`,
      nameAr: starlinkHardwareItem.name_ar,
      quantity: 1,
      runningWatts: starlinkHardwareItem.power_watts_or_ah,
      surgeMultiplier: 1.0,
      dutyCycle: 1.0,
      hoursPerDay: 16,
      includeInBackup: true,
    });
  }

  let totalContinuousWatts = 0;
  let averageDutyWatts = 0;
  let dailyEnergyWh = 0;
  let backupDutyWatts = 0;
  let maxSurgeDeltaWatts = 0;

  for (const app of effectiveAppliances) {
    if (app.quantity <= 0 || app.runningWatts <= 0 || app.hoursPerDay <= 0) {
      continue;
    }

    const connectedWatts = app.quantity * app.runningWatts;
    const dutyWatts = connectedWatts * app.dutyCycle;
    const appDailyWh = dutyWatts * app.hoursPerDay;

    totalContinuousWatts += connectedWatts;
    averageDutyWatts += dutyWatts;
    dailyEnergyWh += appDailyWh;

    if (app.includeInBackup !== false) {
      backupDutyWatts += dutyWatts;
    }

    const singleUnitSurgeDelta = (app.surgeMultiplier - 1) * app.runningWatts;
    if (singleUnitSurgeDelta > maxSurgeDeltaWatts) {
      maxSurgeDeltaWatts = singleUnitSurgeDelta;
    }
  }

  const peakSurgeWatts =
    totalContinuousWatts > 0 ? totalContinuousWatts + maxSurgeDeltaWatts : 0;

  const backupHours = clamp(input.backupHours, 0, 24);
  const inverterEfficiency = clamp(assumptions.inverterEfficiency, 0.5, 0.99);
  const peakSunHours = clamp(assumptions.peakSunHours, 1, 10);
  const deratingFactor = clamp(assumptions.deratingFactor, 0.4, 0.98);
  const batteryDoD = BATTERY_DOD[input.batteryChemistry];

  const backupEnergyWh = backupDutyWatts * backupHours;
  const requiredBatteryUsableWh =
    backupEnergyWh > 0 ? backupEnergyWh / inverterEfficiency : 0;
  const requiredBatteryGrossWh =
    requiredBatteryUsableWh > 0 ? requiredBatteryUsableWh / batteryDoD : 0;

  // Choose minimum inverter tier satisfying <=80% continuous load, peak surge,
  // chemistry voltage compatibility, AND smart 48V step-up when LiFePO4 > 4096Wh usable (>2 parallel 24V units)
  const lithiumNeeds48vStepUp =
    input.batteryChemistry === "lifepo4" &&
    requiredBatteryUsableWh > LFP_MAX_24V_PARALLEL_USABLE_WH;
  const minVoltageForChemistry: SystemVoltage =
    input.batteryChemistry === "lifepo4"
      ? lithiumNeeds48vStepUp
        ? 48
        : 24
      : 12;

  let chosenTier = INVERTER_TIERS[INVERTER_TIERS.length - 1];
  let matchedAllConstraints = false;

  for (const tier of INVERTER_TIERS) {
    const catalogInv = findEquipment(catalog, tier.slug);
    const ratedWatts = catalogInv?.power_watts_or_ah ?? tier.ratedWatts;
    const surgeWatts = ratedWatts * 2.0;
    const meetsContinuous = totalContinuousWatts <= ratedWatts * 0.8;
    const meetsSurge = peakSurgeWatts <= surgeWatts;
    const meetsVoltage = tier.systemVoltage >= minVoltageForChemistry;

    if (meetsContinuous && meetsSurge && meetsVoltage) {
      chosenTier = {
        ...tier,
        ratedWatts,
        surgeWatts,
        defaultNameAr: catalogInv?.name_ar ?? tier.defaultNameAr,
        defaultPriceUsd: catalogInv?.effective_usd ?? tier.defaultPriceUsd,
      };
      matchedAllConstraints = true;
      break;
    }
  }

  if (!matchedAllConstraints) {
    const largestCatalog = findEquipment(catalog, chosenTier.slug);
    const ratedWatts = largestCatalog?.power_watts_or_ah ?? chosenTier.ratedWatts;
    chosenTier = {
      ...chosenTier,
      ratedWatts,
      surgeWatts: ratedWatts * 2.0,
      defaultNameAr: largestCatalog?.name_ar ?? chosenTier.defaultNameAr,
      defaultPriceUsd: largestCatalog?.effective_usd ?? chosenTier.defaultPriceUsd,
    };
    warningsAr.push(
      "الأحمال المطلوبة تتجاوز حد الأمان (80%) لأكبر إنفرتر في الكتالوج (8.0kVA) — يُنصح بتقسيم الأحمال أو إضافة إنفرتر موازٍ."
    );
  } else if (
    lithiumNeeds48vStepUp &&
    totalContinuousWatts <= 3000 * 0.8 &&
    peakSurgeWatts <= 6000
  ) {
    warningsAr.push(
      "تمت الترقية الذكية إلى معمارية 48V (إنفرتر 5.5kVA/48V مع بطاريات ليثيوم 48V) لتجاوز السعة المطلوبة 4096Wh وتجنب توصيل أكثر من بطاريتين 24V على التوازي."
    );
  } else if (
    input.batteryChemistry === "lifepo4" &&
    !lithiumNeeds48vStepUp &&
    totalContinuousWatts <= 1200 * 0.8 &&
    peakSurgeWatts <= 2400
  ) {
    warningsAr.push(
      "تم اعتماد إنفرتر 24V تلقائياً للتوافق الهندسي مع بطاريات الليثيوم LiFePO4 المتوفرة (24V/48V)."
    );
  }

  const loadUtilizationPct = round2(
    (totalContinuousWatts / chosenTier.ratedWatts) * 100
  );
  const surgeUtilizationPct = round2(
    (peakSurgeWatts / chosenTier.surgeWatts) * 100
  );

  let loadStatus: "optimal" | "moderate" | "overload_risk" = "optimal";
  if (
    !matchedAllConstraints ||
    loadUtilizationPct > 85 ||
    surgeUtilizationPct > 100
  ) {
    loadStatus = "overload_risk";
  } else if (loadUtilizationPct >= 70) {
    loadStatus = "moderate";
  }

  // Voltage-compatible battery bank sizing
  const batterySpec = resolveBatteryModel(
    catalog,
    input.batteryChemistry,
    chosenTier.systemVoltage
  );
  const unitWh = computeBatteryUnitWh(
    input.batteryChemistry,
    batterySpec.unitAh,
    batterySpec.unitVoltage
  );
  const stringWh = batterySpec.seriesCount * unitWh;
  const parallelStrings =
    requiredBatteryGrossWh > 0
      ? Math.max(1, Math.ceil(requiredBatteryGrossWh / stringWh))
      : 1;
  const batteryCount = batterySpec.seriesCount * parallelStrings;
  const totalBankWh = batteryCount * unitWh;
  const usableBankWh = totalBankWh * batteryDoD;
  const batteryTotalPriceUsd = round2(batteryCount * batterySpec.unitPriceUsd);

  // Solar PV sizing (default 550W panel)
  const panelItem =
    findEquipment(catalog, "panel-longi-550w") ??
    catalog.find((i) => i.category === "solar_panels");
  const panelWatts = panelItem?.power_watts_or_ah ?? 550;
  const panelPriceUsd = panelItem?.effective_usd ?? 115;
  const requiredPvArrayWatts =
    dailyEnergyWh > 0 ? dailyEnergyWh / (peakSunHours * deratingFactor) : 0;
  const panelCount =
    requiredPvArrayWatts > 0
      ? Math.max(1, Math.ceil(requiredPvArrayWatts / panelWatts))
      : 0;
  const totalArrayWatts = panelCount * panelWatts;
  const estimatedDailyGenWh = round2(
    totalArrayWatts * peakSunHours * deratingFactor
  );
  const panelsTotalPriceUsd = round2(panelCount * panelPriceUsd);

  // One-time hardware CapEx (never includes recurring monthly fees)
  const starlinkHardwareUsd = starlinkHardwareItem?.effective_usd ?? 0;
  const hardwareBaseUsd = round2(
    chosenTier.defaultPriceUsd +
      batteryTotalPriceUsd +
      panelsTotalPriceUsd +
      starlinkHardwareUsd
  );

  const regionalMarkupPct =
    assumptions.regionalMarkups[input.cityKey]?.markup_pct ?? 0;
  const regionalMarkupUsd = round2(
    hardwareBaseUsd * (regionalMarkupPct / 100)
  );

  const bosPercentage = input.includeBosInstallation
    ? assumptions.bosPercentage
    : 0;
  const bosUsd = round2(hardwareBaseUsd * (bosPercentage / 100));

  const totalCapexUsd = round2(hardwareBaseUsd + regionalMarkupUsd + bosUsd);
  const parallelRate = Math.max(1, assumptions.parallelUsdSdg);
  const totalCapexSdg = round2(totalCapexUsd * parallelRate);

  // Recurring monthly subscription kept strictly separate from CapEx
  const recurringMonthlyUsd = starlinkMonthlyItem
    ? round2(starlinkMonthlyItem.effective_usd)
    : 0;
  const recurringMonthlySdg = round2(recurringMonthlyUsd * parallelRate);

  return {
    totalContinuousWatts: round2(totalContinuousWatts),
    averageDutyWatts: round2(averageDutyWatts),
    peakSurgeWatts: round2(peakSurgeWatts),
    dailyEnergyWh: round2(dailyEnergyWh),
    backupEnergyWh: round2(backupEnergyWh),
    requiredBatteryUsableWh: round2(requiredBatteryUsableWh),
    requiredBatteryGrossWh: round2(requiredBatteryGrossWh),
    batteryDoD,
    selectedInverter: {
      slug: chosenTier.slug,
      nameAr: chosenTier.defaultNameAr,
      ratedVa: chosenTier.ratedVa,
      ratedWatts: chosenTier.ratedWatts,
      surgeWatts: chosenTier.surgeWatts,
      systemVoltage: chosenTier.systemVoltage,
      unitPriceUsd: round2(chosenTier.defaultPriceUsd),
      loadUtilizationPct,
      surgeUtilizationPct,
    },
    selectedBattery: {
      slug: batterySpec.slug,
      nameAr: batterySpec.nameAr,
      chemistry: input.batteryChemistry,
      unitAh: batterySpec.unitAh,
      unitVoltage: batterySpec.unitVoltage,
      unitWh,
      count: batteryCount,
      seriesCount: batterySpec.seriesCount,
      parallelStrings,
      totalBankWh,
      usableBankWh,
      unitPriceUsd: round2(batterySpec.unitPriceUsd),
      totalPriceUsd: batteryTotalPriceUsd,
    },
    selectedPanels: {
      slug: panelItem?.slug ?? "panel-longi-550w",
      nameAr: panelItem?.name_ar ?? "لوح شمسي لونجي 550 واط (LONGi Mono PERC)",
      unitWatts: panelWatts,
      count: panelCount,
      totalArrayWatts,
      estimatedDailyGenWh,
      unitPriceUsd: round2(panelPriceUsd),
      totalPriceUsd: panelsTotalPriceUsd,
    },
    starlinkHardware: starlinkHardwareItem
      ? {
          slug: starlinkHardwareItem.slug,
          nameAr: starlinkHardwareItem.name_ar,
          unitPriceUsd: round2(starlinkHardwareItem.effective_usd),
          watts: starlinkHardwareItem.power_watts_or_ah,
        }
      : null,
    starlinkMonthly: starlinkMonthlyItem
      ? {
          slug: starlinkMonthlyItem.slug,
          nameAr: starlinkMonthlyItem.name_ar,
          monthlyUsd: round2(starlinkMonthlyItem.effective_usd),
          monthlySdg: round2(starlinkMonthlyItem.effective_usd * parallelRate),
        }
      : null,
    costs: {
      hardwareBaseUsd,
      regionalMarkupPct,
      regionalMarkupUsd,
      bosPercentage,
      bosUsd,
      totalCapexUsd,
      totalCapexSdg,
      recurringMonthlyUsd,
      recurringMonthlySdg,
    },
    loadStatus,
    warningsAr,
  };
}
