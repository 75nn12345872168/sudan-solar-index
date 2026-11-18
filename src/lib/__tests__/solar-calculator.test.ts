import { describe, expect, it } from "vitest";
import {
  BASELINE_EQUIPMENT,
  DEFAULT_ASSUMPTIONS,
} from "@/lib/baseline-catalog";
import { calculateSolarSystem } from "@/lib/solar-calculator";
import type { CalculatorInput } from "@/types/solar";

function baseInput(overrides?: Partial<CalculatorInput>): CalculatorInput {
  return {
    appliances: [
      {
        id: "led",
        nameAr: "لمبات LED",
        quantity: 4,
        runningWatts: 12,
        surgeMultiplier: 1.0,
        dutyCycle: 1.0,
        hoursPerDay: 8,
        includeInBackup: true,
      },
    ],
    backupHours: 8,
    batteryChemistry: "gel",
    cityKey: "portsudan",
    includeBosInstallation: false,
    starlinkVariant: "none",
    includeStarlinkMonthly: false,
    ...overrides,
  };
}

describe("calculateSolarSystem", () => {
  it("models per-appliance duty cycles accurately for daily Wh and backup energy", () => {
    const result = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "fridge",
            nameAr: "ثلاجة",
            quantity: 1,
            runningWatts: 180,
            surgeMultiplier: 3.5,
            dutyCycle: 0.45,
            hoursPerDay: 24,
            includeInBackup: true,
          },
        ],
        backupHours: 10,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    // 180W * 0.45 * 24h = 1944 Wh/day
    expect(result.dailyEnergyWh).toBe(1944);
    expect(result.totalContinuousWatts).toBe(180);
    expect(result.averageDutyWatts).toBe(81);
    // 81W * 10h = 810 Wh backup energy; /0.90 inverter eff = 900 Wh usable
    expect(result.backupEnergyWh).toBe(810);
    expect(result.requiredBatteryUsableWh).toBe(900);
    // Gel DoD = 0.50 -> 1800 Wh gross
    expect(result.requiredBatteryGrossWh).toBe(1800);
  });

  it("upgrades inverter tier when peak surge power exceeds 1.5kVA surge rating", () => {
    // Continuous is 700W (<= 80% of 1200W = 960W),
    // but 5x surge on 700W motor = 3500W (> 2400W surge rating of 1.5kVA)
    const result = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "pump",
            nameAr: "مضخة مياه",
            quantity: 1,
            runningWatts: 700,
            surgeMultiplier: 5.0,
            dutyCycle: 1.0,
            hoursPerDay: 2,
            includeInBackup: true,
          },
        ],
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(result.peakSurgeWatts).toBe(3500);
    expect(result.selectedInverter.slug).toBe("inverter-3500va-24v");
    expect(result.selectedInverter.systemVoltage).toBe(24);
  });

  it("enforces 80% continuous load limit before selecting inverter tier", () => {
    // 1000W > 80% of 1200W (960W), so must step up to 3.5kVA/24V
    const result = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "ac_small",
            nameAr: "حمل مستمر",
            quantity: 1,
            runningWatts: 1000,
            surgeMultiplier: 1.0,
            dutyCycle: 1.0,
            hoursPerDay: 4,
          },
        ],
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(result.selectedInverter.slug).toBe("inverter-3500va-24v");
    expect(result.selectedInverter.loadUtilizationPct).toBeCloseTo(33.33, 1);
  });

  it("enforces battery-to-inverter voltage compatibility (series strings for 24V and 48V)", () => {
    // 3.5kVA/24V with Gel (12V batteries) -> seriesCount must be 2
    const gel24 = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "load24",
            nameAr: "حمل 1500 واط",
            quantity: 1,
            runningWatts: 1500,
            surgeMultiplier: 1.0,
            dutyCycle: 1.0,
            hoursPerDay: 6,
            includeInBackup: true,
          },
        ],
        batteryChemistry: "gel",
        backupHours: 6,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(gel24.selectedInverter.systemVoltage).toBe(24);
    expect(gel24.selectedBattery.seriesCount).toBe(2);
    expect(gel24.selectedBattery.count % 2).toBe(0);
    expect(
      gel24.selectedBattery.unitVoltage * gel24.selectedBattery.seriesCount
    ).toBe(gel24.selectedInverter.systemVoltage);

    // 5.5kVA/48V with Gel (12V batteries) -> seriesCount must be 4
    const gel48 = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "load48",
            nameAr: "حمل 3200 واط",
            quantity: 1,
            runningWatts: 3200,
            surgeMultiplier: 1.0,
            dutyCycle: 1.0,
            hoursPerDay: 6,
            includeInBackup: true,
          },
        ],
        batteryChemistry: "gel",
        backupHours: 6,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(gel48.selectedInverter.systemVoltage).toBe(48);
    expect(gel48.selectedBattery.seriesCount).toBe(4);
    expect(gel48.selectedBattery.count % 4).toBe(0);
    expect(
      gel48.selectedBattery.unitVoltage * gel48.selectedBattery.seriesCount
    ).toBe(gel48.selectedInverter.systemVoltage);
  });

  it("requires lower gross battery capacity for LiFePO4 (80% DoD) than Gel (50% DoD)", () => {
    const sharedLoads = [
      {
        id: "fridge",
        nameAr: "ثلاجة",
        quantity: 2,
        runningWatts: 250,
        surgeMultiplier: 2.0,
        dutyCycle: 0.6,
        hoursPerDay: 24,
        includeInBackup: true,
      },
      {
        id: "fans",
        nameAr: "مراوح",
        quantity: 4,
        runningWatts: 150,
        surgeMultiplier: 1.0,
        dutyCycle: 1.0,
        hoursPerDay: 12,
        includeInBackup: true,
      },
    ];

    const gelRes = calculateSolarSystem(
      baseInput({ appliances: sharedLoads, batteryChemistry: "gel", backupHours: 10 }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );
    const lfpRes = calculateSolarSystem(
      baseInput({ appliances: sharedLoads, batteryChemistry: "lifepo4", backupHours: 10 }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(gelRes.batteryDoD).toBe(0.5);
    expect(lfpRes.batteryDoD).toBe(0.8);
    expect(lfpRes.requiredBatteryGrossWh).toBeLessThan(
      gelRes.requiredBatteryGrossWh
    );
    expect(lfpRes.selectedBattery.unitVoltage * lfpRes.selectedBattery.seriesCount).toBe(
      lfpRes.selectedInverter.systemVoltage
    );
  });

  it("scales PV panels inversely with configurable Peak Sun Hours", () => {
    const loads = [
      {
        id: "office",
        nameAr: "أحمال مكتب",
        quantity: 1,
        runningWatts: 1000,
        surgeMultiplier: 1.0,
        dutyCycle: 1.0,
        hoursPerDay: 10,
      },
    ];

    const lowSun = calculateSolarSystem(
      baseInput({ appliances: loads }),
      BASELINE_EQUIPMENT,
      { ...DEFAULT_ASSUMPTIONS, peakSunHours: 4.0 }
    );
    const highSun = calculateSolarSystem(
      baseInput({ appliances: loads }),
      BASELINE_EQUIPMENT,
      { ...DEFAULT_ASSUMPTIONS, peakSunHours: 6.5 }
    );

    expect(lowSun.selectedPanels.count).toBeGreaterThan(
      highSun.selectedPanels.count
    );
  });

  it("applies regional city markup and optional BOS add-on correctly", () => {
    const portSudanNoBos = calculateSolarSystem(
      baseInput({ cityKey: "portsudan", includeBosInstallation: false }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );
    const khartoumWithBos = calculateSolarSystem(
      baseInput({ cityKey: "khartoum", includeBosInstallation: true }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(portSudanNoBos.costs.regionalMarkupPct).toBe(0);
    expect(portSudanNoBos.costs.bosUsd).toBe(0);
    expect(portSudanNoBos.costs.totalCapexUsd).toBe(
      portSudanNoBos.costs.hardwareBaseUsd
    );

    expect(khartoumWithBos.costs.regionalMarkupPct).toBe(8);
    expect(khartoumWithBos.costs.bosPercentage).toBe(12);
    expect(khartoumWithBos.costs.totalCapexUsd).toBeCloseTo(
      khartoumWithBos.costs.hardwareBaseUsd * 1.2,
      2
    );
    expect(khartoumWithBos.costs.totalCapexSdg).toBeCloseTo(
      khartoumWithBos.costs.totalCapexUsd * DEFAULT_ASSUMPTIONS.parallelUsdSdg,
      2
    );
  });

  it("strictly separates Starlink recurring monthly fees from one-time CapEx", () => {
    const withoutMonthly = calculateSolarSystem(
      baseInput({
        starlinkVariant: "standard_v4",
        includeStarlinkMonthly: false,
        cityKey: "khartoum",
        includeBosInstallation: true,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    const withMonthly = calculateSolarSystem(
      baseInput({
        starlinkVariant: "standard_v4",
        includeStarlinkMonthly: true,
        cityKey: "khartoum",
        includeBosInstallation: true,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(withoutMonthly.costs.recurringMonthlyUsd).toBe(0);
    expect(withMonthly.costs.recurringMonthlyUsd).toBe(120);
    expect(withMonthly.costs.recurringMonthlySdg).toBe(120 * 12000);
    // One-time hardware CapEx MUST NOT change when toggling monthly subscription
    expect(withMonthly.costs.totalCapexUsd).toBe(
      withoutMonthly.costs.totalCapexUsd
    );
    expect(withMonthly.costs.totalCapexSdg).toBe(
      withoutMonthly.costs.totalCapexSdg
    );
  });

  it("flags overload_risk and emits Arabic warning when load exceeds 8kVA inverter", () => {
    const overload = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "ac_heavy",
            nameAr: "مكيفات ثقيلة",
            quantity: 6,
            runningWatts: 1200,
            surgeMultiplier: 1.5,
            dutyCycle: 0.7,
            hoursPerDay: 8,
          },
        ],
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(overload.selectedInverter.slug).toBe("inverter-8000va-48v");
    expect(overload.loadStatus).toBe("overload_risk");
    expect(overload.warningsAr.length).toBeGreaterThan(0);
  });

  it("keeps LiFePO4 at 24V (<= 2 parallel units) when usable backup energy <= 4096Wh", () => {
    // 360W continuous for 10h -> 3600Wh / 0.90 = 4000Wh usable (<= 4096Wh)
    const res = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "home_light",
            nameAr: "أحمال منزلية خفيفة",
            quantity: 1,
            runningWatts: 360,
            surgeMultiplier: 1.0,
            dutyCycle: 1.0,
            hoursPerDay: 14,
            includeInBackup: true,
          },
        ],
        batteryChemistry: "lifepo4",
        backupHours: 10,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(res.requiredBatteryUsableWh).toBe(4000);
    expect(res.selectedInverter.slug).toBe("inverter-3500va-24v");
    expect(res.selectedInverter.systemVoltage).toBe(24);
    expect(res.selectedBattery.slug).toBe("battery-lifepo4-100ah-24v");
    expect(res.selectedBattery.parallelStrings).toBeLessThanOrEqual(2);
    expect(res.selectedBattery.count).toBe(2);
  });

  it("automatically steps up LiFePO4 to 48V architecture when usable backup energy > 4096Wh", () => {
    // 1350W continuous fits comfortably on 3.5kVA/24V (<= 2400W),
    // but 10h backup = 13500Wh / 0.90 = 15000Wh usable (> 4096Wh),
    // which would require 8 x 24V 100Ah ($4160 + $390 = $4550) vs 4 x 48V 100Ah ($3920 + $580 = $4500)
    const res = calculateSolarSystem(
      baseInput({
        appliances: [
          {
            id: "backup_load",
            nameAr: "أحمال تشغيل ليلي طويل",
            quantity: 1,
            runningWatts: 1350,
            surgeMultiplier: 1.0,
            dutyCycle: 1.0,
            hoursPerDay: 16,
            includeInBackup: true,
          },
        ],
        batteryChemistry: "lifepo4",
        backupHours: 10,
      }),
      BASELINE_EQUIPMENT,
      DEFAULT_ASSUMPTIONS
    );

    expect(res.requiredBatteryUsableWh).toBe(15000);
    expect(res.selectedInverter.slug).toBe("inverter-5500va-48v");
    expect(res.selectedInverter.systemVoltage).toBe(48);
    expect(res.selectedBattery.slug).toBe("battery-lifepo4-100ah-48v");
    expect(res.selectedBattery.unitVoltage).toBe(48);
    expect(res.selectedBattery.count).toBe(4);
    // Achieves lower total hardware CapEx (4x$980 + $580 = $4500) than 24V equivalent (8x$520 + $390 = $4550)
    const naive24vCost = 8 * 520 + 390 + res.selectedPanels.totalPriceUsd;
    expect(res.costs.hardwareBaseUsd).toBeLessThan(naive24vCost);
    expect(res.warningsAr.some((w) => w.includes("48V"))).toBe(true);
  });
});
