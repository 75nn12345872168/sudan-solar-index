import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { isAdminConfigured } from "@/lib/admin-auth";
import { AdminDashboardClient } from "@/components/AdminDashboardClient";

export const dynamic = "force-dynamic";

export default function AdminUpdatePage() {
  if (!isAdminConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-card max-w-md rounded-2xl border-rose-500/40 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-rose-400" />
          <h1 className="text-lg font-bold text-rose-300">
            لوحة الإدارة مقفلة (503)
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            تطبق المنصة سياسة الإغلاق الآمن (Fail-Closed). متغير البيئة{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">
              ADMIN_PASSWORD
            </code>{" "}
            غير مضبوط أو يقل عن 8 أحرف على الخادم.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى الرئيسية
          </Link>
        </div>
      </main>
    );
  }

  return <AdminDashboardClient />;
}
