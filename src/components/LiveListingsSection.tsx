"use client";

import React, { useState } from "react";

export interface LiveListing {
  id: string;
  external_id: string;
  source_platform?: string;
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

const CITIES = [
  "بورتسودان",
  "القضارف",
  "عطبرة",
  "أم درمان",
  "الخرطوم",
  "الخرطوم بحري",
  "ود مدني",
  "كسلا",
  "دنقلا",
  "الأبيض",
  "كوستي",
  "السودان",
];

function normalizeSdPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const match = digits.match(/^(?:249|0)?(9\d{8}|1\d{8})$/);
  return match ? `249${match[1]}` : null;
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxWidth = 1000;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        "image/jpeg",
        0.78
      );
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export default function LiveListingsSection({
  listings: initialListings,
}: {
  listings: LiveListing[];
}) {
  const [listings, setListings] = useState<LiveListing[]>(initialListings);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");

  // حالة نافذة إضافة إعلان جديد
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("starlink");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"SDG" | "USD">("SDG");
  const [city, setCity] = useState("بورتسودان");
  const [phone, setPhone] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const availableCities = Array.from(
    new Set(listings.map((item) => item.city))
  ).filter(Boolean);

  const filtered = listings.filter((item) => {
    const matchCat =
      selectedCategory === "all" || item.category === selectedCategory;
    const matchCity = selectedCity === "all" || item.city === selectedCity;
    return matchCat && matchCity;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedPhone = normalizeSdPhone(phone);
    if (!normalizedPhone) {
      setFormError("يرجى إدخال رقم واتساب سوداني صحيح (مثل 0912345678 أو 0123456789).");
      return;
    }
    if (!title.trim() || title.trim().length < 5) {
      setFormError("يرجى كتابة اسم المنتج ومواصفاته بوضوح.");
      return;
    }
    const numericPrice = Number(price.replace(/,/g, ""));
    if (!numericPrice || numericPrice <= 0) {
      setFormError("يرجى إدخال سعر صحيح للمنتج.");
      return;
    }
    if (!imageFile) {
      setFormError("يرجى تصوير المنتج أو اختيار صورة واضحة له.");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      setFormError("خطأ في إعدادات الاتصال بقاعدة البيانات.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. ضغط الصورة ورفعها إلى Supabase Storage
      const compressedBlob = await compressImage(imageFile);
      const fileName = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/listing-images/${fileName}`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "image/jpeg",
          },
          body: compressedBlob,
        }
      );

      if (!uploadRes.ok) {
        throw new Error("تعذر رفع الصورة، تأكد من حجم الصورة واتصال الإنترنت.");
      }

      const publicImageUrl = `${supabaseUrl}/storage/v1/object/public/listing-images/${fileName}`;

      // 2. حفظ بيانات الإعلان في جدول live_listings
      const newRecord = {
        external_id: `direct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        source_platform: "DirectUser",
        category,
        title: title.trim(),
        price_sdg: currency === "SDG" ? numericPrice : null,
        price_usd: currency === "USD" ? numericPrice : null,
        city,
        image_url: publicImageUrl,
        seller_phone: normalizedPhone,
        source_url: null,
        is_direct_partner: false,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      };

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/live_listings`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(newRecord),
      });

      if (!insertRes.ok) {
        throw new Error("تعذر حفظ الإعلان، يرجى المحاولة مرة أخرى.");
      }

      const insertedRows = (await insertRes.json()) as LiveListing[];
      if (insertedRows?.[0]) {
        setListings((prev) => [insertedRows[0], ...prev]);
      }

      setFormSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setFormSuccess(false);
        setTitle("");
        setPrice("");
        setImageFile(null);
        setImagePreview(null);
      }, 1400);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setSubmitting(false);
    }
  };

  const buildSellerWhatsAppUrl = (item: LiveListing) => {
    const priceLabel = item.price_sdg
      ? `${item.price_sdg.toLocaleString("en-US")} ج.س`
      : item.price_usd
      ? `${item.price_usd.toLocaleString("en-US")}$`
      : "السعر المعروض";
    const message = `مرحباً، شاهدت عرضك (${item.title}) بسعر (${priceLabel}) في مدينة (${item.city}) على منصة مؤشر الطاقة الشمسية وستارلينك في السودان، وأرغب في الاستفسار والشراء.`;
    return `https://wa.me/${item.seller_phone}?text=${encodeURIComponent(message)}`;
  };

  const buildShareWhatsAppUrl = (item: LiveListing) => {
    const priceText =
      item.price_sdg && item.price_sdg >= 5000
        ? `${item.price_sdg.toLocaleString("en-US")} ج.س`
        : "السعر محدث على المنصة";
    const text = `شاهد هذا العرض على مرصد الطاقة الشمسية وستارلينك في السودان:\n*${item.title}*\n- المدينة: ${item.city}\n- السعر: ${priceText}\nللتفاصيل والتواصل المباشر مع البائع:\nhttps://sudan-solar-index.vercel.app`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const buildComplaintWhatsAppUrl = (item: LiveListing) => {
    const message = `بلاغ / شكوى حول إعلان في منصة مؤشر الطاقة الشمسية:\n- كود الإعلان: ${item.external_id}\n- المنتج: ${item.title}\n- المدينة: ${item.city}\n- سبب البلاغ: (السعر غير مطابق / المنتج مباع / رقم البائع لا يرد)`;
    return `https://wa.me/${COMPLAINTS_WHATSAPP}?text=${encodeURIComponent(message)}`;
  };

  return (
    <section dir="rtl" className="my-4 space-y-5">
      {/* الترويسة + زر إضافة إعلان */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex flex-wrap items-center gap-2">
            <span>عروض السوق الحية (مباشرة من البائعين)</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              {filtered.length} عرض متاح
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            تواصل مع البائع مباشرة دون عمولة، أو صوّر منتجك وارفعه مجاناً ليصل لآلاف المشترين.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/10 transition cursor-pointer"
          >
            + صوّر وارفع منتجك للبيع (مجاناً)
          </button>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
          >
            <option value="all">كل المدن</option>
            {availableCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* أزرار تصفية الأقسام */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
              selectedCategory === key
                ? "bg-amber-500 text-slate-950 font-bold"
                : "bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* شبكة بطاقات المنتجات */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
          لا توجد عروض مطابقة للتصفية الحالية.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-700 transition"
            >
              <div>
                <div className="relative h-48 w-full bg-slate-950 overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
                      لا توجد صورة مرفقة
                    </div>
                  )}

                  <span className="absolute top-3 right-3 bg-slate-950/85 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-800">
                    {item.city}
                  </span>

                  {item.source_platform === "DirectUser" && (
                    <span className="absolute top-3 left-3 bg-sky-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                      مُضاف مباشرة
                    </span>
                  )}

                  {item.is_direct_partner && (
                    <span className="absolute top-3 left-3 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                      تاجر معتمد
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="text-base font-bold text-white line-clamp-2 leading-snug">
                    {item.title}
                  </h3>
                  <div className="pt-1">
                    {item.price_sdg && item.price_sdg >= 5000 ? (
                      <p className="text-xl font-extrabold text-amber-400">
                        {item.price_sdg.toLocaleString("en-US")}{" "}
                        <span className="text-xs font-normal text-slate-300">
                          ج.س
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-400">
                        السعر عند التواصل مع البائع
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 pt-0 space-y-2">
                {item.seller_phone ? (
                  <a
                    href={buildSellerWhatsAppUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-2.5 px-4 rounded-xl transition"
                  >
                    <span>تواصل مباشر مع البائع (واتساب)</span>
                  </a>
                ) : item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm py-2.5 px-4 rounded-xl transition"
                  >
                    <span>عرض تفاصيل الإعلان والتواصل</span>
                  </a>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={buildShareWhatsAppUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold py-2 px-2 rounded-xl transition"
                  >
                    <span>مشاركة العرض (واتساب)</span>
                  </a>

                  <a
                    href={buildComplaintWhatsAppUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700/70 text-xs py-2 px-2 rounded-xl transition"
                  >
                    <span>إبلاغ / شكوى</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة تصوير ورفع منتج جديد */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">
                نشر منتج للبيع مجاناً
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm px-2 py-1"
              >
                إغلاق ✕
              </button>
            </div>

            {formSuccess ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-emerald-400 font-bold text-lg">
                  تم نشر إعلانك بنجاح!
                </p>
                <p className="text-slate-400 text-sm">
                  يظهر منتجك الآن في أعلى الصفحة الرئيسية.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePublish} className="space-y-3.5">
                {/* تصوير أو اختيار صورة */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    1. صورة المنتج (افتح الكاميرا أو اختر من المعرض)
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl p-4 cursor-pointer bg-slate-950/60 transition">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="معاينة المنتج"
                        className="h-40 w-full object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-1 py-3">
                        <p className="text-amber-400 font-bold text-sm">
                          اضغط هنا لتصوير المنتج بالكاميرا
                        </p>
                        <p className="text-slate-500 text-xs">
                          يتم ضغط الصورة تلقائياً لتعمل مع الإنترنت الضعيف
                        </p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* اسم المنتج */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    2. اسم المنتج والمواصفات
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: جهاز ستارلينك الجيل الثالث جديد بالكرتونة"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* القسم والمدينة */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      3. القسم
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    >
                      <option value="starlink">ستارلينك</option>
                      <option value="solar_panels">ألواح شمسية</option>
                      <option value="batteries">بطاريات</option>
                      <option value="inverters">إنفرترات</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      4. المدينة
                    </label>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    >
                      {CITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* السعر والعملة */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      5. السعر
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="مثال: 6200000"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      العملة
                    </label>
                    <select
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value as "SDG" | "USD")
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-white"
                    >
                      <option value="SDG">جنيه (ج.س)</option>
                      <option value="USD">دولار ($)</option>
                    </select>
                  </div>
                </div>

                {/* رقم واتساب البائع */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    6. رقم الواتساب للتواصل معك مباشرة
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0912345678 أو 0123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {formError && (
                  <p className="text-xs text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl transition cursor-pointer"
                >
                  {submitting ? "جاري ضغط الصورة ونشر الإعلان..." : "نشر الإعلان الآن مجاناً"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}


