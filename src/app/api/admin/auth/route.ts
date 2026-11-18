import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createSessionToken,
  getConfiguredAdminPassword,
  isAdminConfigured,
  recordAdminAudit,
  requireAdminOrFailClosed,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { getServiceSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = requireAdminOrFailClosed(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ authenticated: true });
}

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "لوحة الإدارة مقفلة (503): متغير البيئة ADMIN_PASSWORD غير مضبوط أو أقل من 8 أحرف على الخادم.",
        code: "ADMIN_UNCONFIGURED",
      },
      { status: 503 }
    );
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `محاولات تسجيل دخول متكررة. يرجى الانتظار ${rl.retryAfterSec} ثانية.`,
      },
      { status: 429 }
    );
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const candidate = typeof body.password === "string" ? body.password : "";
  if (!candidate || !verifyAdminPassword(candidate)) {
    const supabase = getServiceSupabaseClient();
    await recordAdminAudit(supabase, request, {
      actionType: "admin_login_failed",
    });
    return NextResponse.json(
      { error: "كلمة المرور غير صحيحة." },
      { status: 401 }
    );
  }

  const configured = getConfiguredAdminPassword();
  if (!configured) {
    return NextResponse.json({ error: "إعداد غير مكتمل." }, { status: 503 });
  }

  const token = createSessionToken(configured);
  const supabase = getServiceSupabaseClient();
  await recordAdminAudit(supabase, request, {
    actionType: "admin_login_success",
  });

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
