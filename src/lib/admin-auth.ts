import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIp, hashIp } from "@/lib/security";

export const ADMIN_COOKIE_NAME = "sudan_solar_admin";
const SESSION_TTL_SEC = 60 * 60 * 8; // 8 hours

export function getConfiguredAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  if (!pw || pw.length < 8) {
    return null;
  }
  return pw;
}

export function isAdminConfigured(): boolean {
  return getConfiguredAdminPassword() !== null;
}

function getSigningSecret(adminPassword: string): Buffer {
  return crypto
    .createHmac("sha256", adminPassword)
    .update("sudan-solar-index-admin-session-v1")
    .digest();
}

export function verifyAdminPassword(candidate: string): boolean {
  const expected = getConfiguredAdminPassword();
  if (!expected) return false;

  const candHash = crypto.createHash("sha256").update(candidate).digest();
  const expHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(candHash, expHash);
}

export function createSessionToken(adminPassword: string): string {
  const payloadObj = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    nonce: crypto.randomBytes(12).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", getSigningSecret(adminPassword))
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  const adminPassword = getConfiguredAdminPassword();
  if (!adminPassword || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret(adminPassword))
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdminOrFailClosed(
  request: NextRequest
): { ok: true } | { ok: false; response: NextResponse } {
  if (!isAdminConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "لوحة الإدارة مقفلة (503): متغير البيئة ADMIN_PASSWORD غير مضبوط أو أقل من 8 أحرف.",
          code: "ADMIN_UNCONFIGURED",
        },
        { status: 503 }
      ),
    };
  }

  const cookieToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifySessionToken(cookieToken)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "غير مصرح: يرجى تسجيل الدخول أولاً.", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

export async function recordAdminAudit(
  client: SupabaseClient | null,
  request: NextRequest,
  entry: {
    actionType: string;
    targetSlug?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  }
): Promise<void> {
  if (!client) return;
  try {
    await client.from("admin_audit_logs").insert({
      action_type: entry.actionType,
      target_slug: entry.targetSlug ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      ip_hash: hashIp(getClientIp(request)),
    });
  } catch (err) {
    console.error("[admin_audit_logs] insert failed:", err);
  }
}
