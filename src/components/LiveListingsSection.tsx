"use client";

import React, { useState } from "react";

export interface LiveListing {
  id: string;
  external_id: string;
  category: string;
  title: string;
  price_sdg: number | null;
  price_usd: number | null;
  city: string;
  image_url: string | null;
  seller_phone: string | null;
  source_url: string | null;
  is_direct_partner: boolean;
  last_seen_at: string;
}

const COMPLAINTS_WHATSAPP = "249125939730";

const CATEGORY_LABELS: Record<string, string> = {
  all: "جميع العروض",
  starlink: "ستارلينك",
  solar_panels: "ألواح شمسية",
  batteries: "بطاريات",
  inverters: "إنفرترات",
};

export default function LiveListingsSection({ listings }: { listings: LiveListing[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");

  const cities = Array.from(new Set(listings.map((item) => item.city))).filter(Boolean);

  const filtered = listings.filter((item) => {
    const matchCat = selectedCategory === "all" || item.category === selectedCategory;
    const matchCity = selectedCity === "all" || item.city === selectedCity;
    return matchCat && matchCity;
  });

  const buildSellerWhatsAppUrl = (item: LiveListing) => {
    const priceLabel = item.price_sdg
      ? `${item.price_sdg.toLocaleString("en-US")} ج.س`
      : item.price_usd
      ? `${item.price_usd.toLocaleString("en-US")}$`
      : "السعر المعروض";
    const message = `مرحباً، شاهدت عرضك (${item.title}) بسعر (${priceLabel}) في مدينة (${item.city}) على منصة مؤشر الطاقة الشمسية وستارلينك في السودان، وأرغب في الاستفسار والشراء.`;
    return `https://wa.me/${item.seller_phone}?text=${encodeURIComponent(message)}`;
  };

  const buildComplaintWhatsAppUrl = (item: LiveListing) => {
    const message = `بلاغ / شكوى حول إعلان في منصة مؤشر الطاقة الشمسية:\n- كود الإعلان: ${item.external_id}\n- المنتج: ${item.title}\n- المدينة: ${item.city}\n- سبب البلاغ: (السعر غير مطابق / المنتج مباع / رقم البائع لا يرد)`;
    return `https://wa.me/${COMPLAINTS_WHATSAPP}?text=${encodeURIComponent(message)}`;
  };

  return (
    <section dir="rtl" className="my-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>عروض السوق الحية (مباشرة من البائعين)</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              {filtered.length} عرض متاح
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            تواصل مباشرة مع البائع دون وسطاء، أو أبلغ فوراً عن أي إعلان غير مطابق لضمان مصداقية السوق.
          </p>
        </div>

        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
        >
          <option value="all">كل المدن</option>
          {cities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              selectedCategory === key
                ? "bg-amber-500 text-slate-950 font-bold"
                : "bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
          لا توجد عروض مطابقة للتصفية الحالية.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-700 transition">
              <div>
                <div className="relative h-48 w-full bg-slate-950 overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">لا توجد صورة مرفقة</div>
                  )}
                  <span className="absolute top-3 right-3 bg-slate-950/85 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-800">
                    {item.city}
                  </span>
                  {item.is_direct_partner && (
                    <span className="absolute top-3 left-3 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                      تاجر معتمد
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="text-base font-bold text-white line-clamp-2 leading-snug">{item.title}</h3>
                  <div className="pt-1">
                    {item.price_sdg ? (
                      <p className="text-xl font-extrabold text-amber-400">
                        {item.price_sdg.toLocaleString("en-US")} <span className="text-xs font-normal text-slate-300">ج.س</span>
                      </p>
                    ) : item.price_usd ? (
                      <p className="text-xl font-extrabold text-emerald-400">
                        {item.price_usd.toLocaleString("en-US")}$ <span className="text-xs font-normal text-slate-300">دولار</span>
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-400">السعر عند التواصل مع البائع</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 pt-0 space-y-2">
                {item.seller_phone ? (
                  <a href={buildSellerWhatsAppUrl(item)} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-2.5 px-4 rounded-xl transition">
                    <span>تواصل مباشر مع البائع (واتساب)</span>
                  </a>
                ) : item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm py-2.5 px-4 rounded-xl transition">
                    <span>عرض تفاصيل الإعلان والتواصل</span>
                  </a>
                ) : null}

                <a href={buildComplaintWhatsAppUrl(item)} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700/70 text-xs py-2 px-3 rounded-xl transition">
                  <span>إبلاغ / شكاوى الأسعار (واتساب الإدارة)</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
