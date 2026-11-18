"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";

interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityLabel: string;
  presetOrSummary: string;
  capexSdg: number;
  capexUsd: number;
  recurringMonthlyUsd: number;
  whatsappShareUrl: string;
}

export function QuoteRequestModal({
  isOpen,
  onClose,
  cityLabel,
  presetOrSummary,
  capexSdg,
  capexUsd,
  recurringMonthlyUsd,
  whatsappShareUrl,
}: QuoteRequestModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [websiteHoneypot, setWebsiteHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          whatsappPhone,
          city: cityLabel,
          presetOrSummary,
          capexSdg,
          capexUsd,
          recurringMonthlyUsd,
          website: websiteHoneypot,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        referenceId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || "تعذر إرسال الطلب. يرجى التحقق من البيانات.");
      } else {
        setSuccessRef(data.referenceId || "SUBMITTED");
        setCustomerName("");
        setWhatsappPhone("");
      }
    } catch {
      setErrorMsg("تعذر الاتصال بالخادم. يمكنك الإرسال مباشرة عبر واتساب.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-modal-title"
    >
      <div className="glass-card w-full max-w-lg rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="quote-modal-title" className="text-lg font-bold">
            اطلب عرض سعر من مورد في {cityLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {successRef ? (
          <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <h4 className="text-base font-bold text-emerald-300">
              تم استلام طلب عرض السعر بنجاح
            </h4>
            <p className="text-sm text-slate-300">
              رقم المرجع:{" "}
              <span className="tabular-nums font-mono font-semibold text-white">
                {successRef.slice(0, 8)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setSuccessRef(null);
                onClose();
              }}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="surface-elevated rounded-xl p-3 text-xs leading-relaxed text-slate-300">
              <div className="font-semibold text-amber-400">ملخص المنظومة:</div>
              <p className="mt-1">{presetOrSummary}</p>
              <div className="mt-2 flex flex-wrap gap-3 tabular-nums">
                <span>
                  التكلفة الرأسمالية: <strong>${capexUsd.toLocaleString("en-US")}</strong> (
                  {Math.round(capexSdg).toLocaleString("en-US")} ج.س)
                </span>
                {recurringMonthlyUsd > 0 && (
                  <span className="text-cyan-400">
                    اشتراك شهري منفصل: ${recurringMonthlyUsd.toLocaleString("en-US")}/شهر
                  </span>
                )}
              </div>
            </div>

            {/* Honeypot field hidden from real users */}
            <input
              type="text"
              name="website"
              value={websiteHoneypot}
              onChange={(e) => setWebsiteHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                الاسم الكامل
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="مثال: أحمد محمد عثمان"
                className="surface-elevated w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                رقم الواتساب السوداني
              </label>
              <input
                type="tel"
                required
                dir="ltr"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="0912345678 or +249912345678"
                className="surface-elevated w-full rounded-xl px-3.5 py-2.5 text-left text-sm tabular-nums outline-none focus:border-amber-500"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                <p>{errorMsg}</p>
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-semibold text-emerald-400 underline"
                >
                  أو أرسل التفاصيل مباشرة عبر واتساب
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? "جاري إرسال الطلب..." : "تأكيد وإرسال طلب العرض"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
