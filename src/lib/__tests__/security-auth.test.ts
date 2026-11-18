import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  isAdminConfigured,
  verifyAdminPassword,
  verifySessionToken,
} from "@/lib/admin-auth";
import { checkRateLimit, normalizeArabicDigits } from "@/lib/security";

const ORIGINAL_ADMIN_PW = process.env.ADMIN_PASSWORD;

afterEach(() => {
  if (ORIGINAL_ADMIN_PW === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = ORIGINAL_ADMIN_PW;
  }
});

describe("admin fail-closed auth & security helpers", () => {
  it("fails closed when ADMIN_PASSWORD is unset or shorter than 8 characters", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("anything123")).toBe(false);

    process.env.ADMIN_PASSWORD = "short";
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("short")).toBe(false);
  });

  it("verifies password and signed session tokens using timing-safe HMAC", () => {
    process.env.ADMIN_PASSWORD = "SudanSolarStrongPassword2026!";
    expect(isAdminConfigured()).toBe(true);
    expect(verifyAdminPassword("wrong-password")).toBe(false);
    expect(verifyAdminPassword("SudanSolarStrongPassword2026!")).toBe(true);

    const token = createSessionToken("SudanSolarStrongPassword2026!");
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(`${token}tampered`)).toBe(false);

    // Changing server password invalidates existing tokens immediately
    process.env.ADMIN_PASSWORD = "RotatedStrongPassword999!";
    expect(verifySessionToken(token)).toBe(false);
  });

  it("enforces rate limiting per key and normalizes Arabic numerals", () => {
    const key = `test-key-${Date.now()}`;
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(false);

    expect(normalizeArabicDigits("٠٩١٢٣٤٥٦٧٨")).toBe("0912345678");
  });
});
