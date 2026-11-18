-- Sudan Solar & Starlink Index (مرصد الطاقة الشمسية وستارلينك في السودان)
-- Idempotent PostgreSQL / Supabase Schema
-- Safe to rerun: uses IF NOT EXISTS, DROP POLICY IF EXISTS, and ON CONFLICT DO NOTHING.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Exchange Rates (Parallel & Official USD/SDG)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parallel_usd_sdg NUMERIC(18, 2) NOT NULL CHECK (parallel_usd_sdg >= 500.00 AND parallel_usd_sdg <= 50000.00),
  official_usd_sdg NUMERIC(18, 2) NOT NULL CHECK (official_usd_sdg >= 500.00 AND official_usd_sdg <= 50000.00),
  data_status text NOT NULL DEFAULT 'demo' CHECK (data_status IN ('live', 'stale', 'demo')),
  source text NOT NULL DEFAULT 'baseline_demo_assumption',
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_observed_at
  ON public.exchange_rates (observed_at DESC);

-- Seed baseline demo exchange rate only if no exchange_rates exist
INSERT INTO public.exchange_rates (
  id,
  parallel_usd_sdg,
  official_usd_sdg,
  data_status,
  source,
  observed_at
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  12000.00,
  9000.00,
  'demo',
  'baseline_demo_assumption',
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_rates)
ON CONFLICT (id) DO NOTHING;

-- 2. Solar & Starlink Equipment Catalog (Three-Tier Pricing Model)
CREATE TABLE IF NOT EXISTS public.solar_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  category text NOT NULL CHECK (category IN ('starlink', 'solar_panels', 'batteries', 'inverters', 'generators')),
  billing_type text NOT NULL CHECK (billing_type IN ('one_time', 'recurring_monthly')),
  name_ar text NOT NULL,
  specs_ar text NOT NULL,
  power_watts_or_ah NUMERIC(18, 2) NOT NULL CHECK (power_watts_or_ah >= 0.00),
  system_voltage NUMERIC(18, 2) NULL CHECK (system_voltage IS NULL OR system_voltage IN (12.00, 24.00, 48.00, 220.00)),
  reference_usd NUMERIC(18, 2) NOT NULL CHECK (reference_usd > 0.00),
  observed_usd NUMERIC(18, 2) NULL CHECK (observed_usd IS NULL OR observed_usd > 0.00),
  market_min_usd NUMERIC(18, 2) NULL CHECK (market_min_usd IS NULL OR market_min_usd > 0.00),
  market_max_usd NUMERIC(18, 2) NULL CHECK (market_max_usd IS NULL OR market_max_usd > 0.00),
  effective_usd NUMERIC(18, 2) NOT NULL CHECK (effective_usd > 0.00),
  effective_sdg NUMERIC(18, 2) NOT NULL CHECK (effective_sdg > 0.00),
  price_basis text NOT NULL DEFAULT 'reference' CHECK (price_basis IN ('reference', 'observed', 'manual')),
  data_status text NOT NULL DEFAULT 'demo' CHECK (data_status IN ('demo', 'live', 'stale')),
  sample_count int NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  confidence text NOT NULL DEFAULT 'none' CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  demand_level text NOT NULL DEFAULT 'high' CHECK (demand_level IN ('high', 'medium', 'low')),
  last_observed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_market_min_le_max CHECK (
    market_min_usd IS NULL OR market_max_usd IS NULL OR market_min_usd <= market_max_usd
  )
);

CREATE INDEX IF NOT EXISTS idx_solar_equipment_category
  ON public.solar_equipment (category);

-- Seed 14 Sudanese-market baseline items (never overwrite existing production rows)
INSERT INTO public.solar_equipment (
  slug,
  category,
  billing_type,
  name_ar,
  specs_ar,
  power_watts_or_ah,
  system_voltage,
  reference_usd,
  observed_usd,
  market_min_usd,
  market_max_usd,
  effective_usd,
  effective_sdg,
  price_basis,
  data_status,
  sample_count,
  confidence,
  demand_level,
  last_observed_at
)
VALUES
  (
    'starlink-v4-standard',
    'starlink',
    'one_time',
    'جهاز ستارلينك القياسي (Gen 3 / V4)',
    'هوائي الجيل القياسي مع راوتر Gen 3 واي فاي 6 - استهلاك متوسط 75 واط',
    75.00,
    220.00,
    520.00,
    NULL,
    NULL,
    NULL,
    520.00,
    6240000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'starlink-mini',
    'starlink',
    'one_time',
    'جهاز ستارلينك ميني المحمول (Starlink Mini)',
    'تصميم مدمج مع راوتر داخلي - استهلاك منخفض 35 واط مناسب للبطاريات الصغيرة',
    35.00,
    220.00,
    380.00,
    NULL,
    NULL,
    NULL,
    380.00,
    4560000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'starlink-roam-monthly',
    'starlink',
    'recurring_monthly',
    'اشتراك ستارلينك الشهري (Roam Unlimited)',
    'رسوم اشتراك إنترنت فضائي شهرية متكررة - منفصلة عن تكلفة التركيب الرأسمالية',
    0.00,
    NULL,
    120.00,
    NULL,
    NULL,
    NULL,
    120.00,
    1440000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'panel-longi-550w',
    'solar_panels',
    'one_time',
    'لوح شمسي لونجي 550 واط (LONGi Mono PERC)',
    'خلايا أحادية البلورة نصف مقطوعة - كفاءة 21.3% مقاومة للحرارة والغبار',
    550.00,
    NULL,
    115.00,
    NULL,
    NULL,
    NULL,
    115.00,
    1380000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'panel-jinko-580w',
    'solar_panels',
    'one_time',
    'لوح شمسي جينكو 580 واط (Jinko N-Type Bifacial)',
    'تقنية N-Type ثنائي الوجه - أداء فائق في درجات حرارة السودان المرتفعة',
    580.00,
    NULL,
    128.00,
    NULL,
    NULL,
    NULL,
    128.00,
    1536000.00,
    'reference',
    'demo',
    0,
    'none',
    'medium',
    NULL
  ),
  (
    'battery-gel-200ah-12v',
    'batteries',
    'one_time',
    'بطارية جل ديب سايكل 200 أمبير / 12 فولت',
    'بطارية جل مغلقة لا تحتاج صيانة - عمق تفريغ آمن 50% (1200Wh فعلي)',
    200.00,
    12.00,
    240.00,
    NULL,
    NULL,
    NULL,
    240.00,
    2880000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'battery-tubular-220ah-12v',
    'batteries',
    'one_time',
    'بطارية أنبوبية 220 أمبير / 12 فولت (Tall Tubular)',
    'مصممة للانقطاعات الطويلة والحرارة العالية - سعة تخزينية عالية',
    220.00,
    12.00,
    265.00,
    NULL,
    NULL,
    NULL,
    265.00,
    3180000.00,
    'reference',
    'demo',
    0,
    'none',
    'medium',
    NULL
  ),
  (
    'battery-lifepo4-100ah-24v',
    'batteries',
    'one_time',
    'بطارية ليثيوم فوسفات 100 أمبير / 24 فولت (2.56kWh)',
    'بطارية LiFePO4 بعمر +4000 دورة شحن - عمق تفريغ 80% ونظام حماية BMS',
    100.00,
    24.00,
    520.00,
    NULL,
    NULL,
    NULL,
    520.00,
    6240000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'battery-lifepo4-100ah-48v',
    'batteries',
    'one_time',
    'بطارية ليثيوم جدارية 100 أمبير / 48 فولت (5.12kWh)',
    'بطارية LiFePO4 سعة 5.12 كيلوواط ساعة - +6000 دورة لأنظمة المنازل المتكاملة',
    100.00,
    48.00,
    980.00,
    NULL,
    NULL,
    NULL,
    980.00,
    11760000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'inverter-1500va-12v',
    'inverters',
    'one_time',
    'إنفرتر هايبرد موجة نقية 1.5kVA / 12V',
    'قدرة فعلية 1200 واط مع منظم شحن MPPT 60A للإنارة وستارلينك والعمل عن بُعد',
    1200.00,
    12.00,
    210.00,
    NULL,
    NULL,
    NULL,
    210.00,
    2520000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'inverter-3500va-24v',
    'inverters',
    'one_time',
    'إنفرتر هايبرد موجة نقية 3.5kVA / 24V',
    'قدرة فعلية 3000 واط مع MPPT 100A - يدعم تشغيل الثلاجة والأحمال المنزلية الأساسية',
    3000.00,
    24.00,
    390.00,
    NULL,
    NULL,
    NULL,
    390.00,
    4680000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'inverter-5500va-48v',
    'inverters',
    'one_time',
    'إنفرتر هايبرد موجة نقية 5.5kVA / 48V',
    'قدرة فعلية 5000 واط مع MPPT مزدوج - مثالي للمنازل المتكاملة ومكيفات الإنفرتر',
    5000.00,
    48.00,
    580.00,
    NULL,
    NULL,
    NULL,
    580.00,
    6960000.00,
    'reference',
    'demo',
    0,
    'none',
    'high',
    NULL
  ),
  (
    'inverter-8000va-48v',
    'inverters',
    'one_time',
    'إنفرتر هايبرد صناعي 8.0kVA / 48V',
    'قدرة فعلية 7500 واط - يدعم تشغيل مكيفات الإنفرتر والأحمال الثقيلة المستمرة',
    7500.00,
    48.00,
    920.00,
    NULL,
    NULL,
    NULL,
    920.00,
    11040000.00,
    'reference',
    'demo',
    0,
    'none',
    'medium',
    NULL
  ),
  (
    'generator-diesel-5kva',
    'generators',
    'one_time',
    'مولد كهرباء ديزل كاتم صوت 5kVA (احتياطي)',
    'قدرة فعلية 4000 واط - خزان 15 لتر ومفتاح تحويل احتياطي للطوارئ',
    4000.00,
    220.00,
    850.00,
    NULL,
    NULL,
    NULL,
    850.00,
    10200000.00,
    'reference',
    'demo',
    0,
    'none',
    'low',
    NULL
  )
ON CONFLICT (slug) DO NOTHING;

-- 3. Price Observations (Raw Scraped Listings & Outlier Filtering Audit)
CREATE TABLE IF NOT EXISTS public.price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_slug text NOT NULL REFERENCES public.solar_equipment(slug) ON DELETE CASCADE,
  source_name text NOT NULL,
  raw_title text NOT NULL,
  raw_price_sdg NUMERIC(18, 2) NOT NULL CHECK (raw_price_sdg >= 0.00),
  normalized_usd NUMERIC(18, 2) NOT NULL CHECK (normalized_usd >= 0.00),
  accepted boolean NOT NULL,
  rejection_reason text NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_observations_slug_time
  ON public.price_observations (equipment_slug, observed_at DESC);

-- 4. Sync Logs (Pipeline Execution Audit)
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_mode text NOT NULL CHECK (run_mode IN ('live', 'dry_run')),
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  fx_rate_used NUMERIC(18, 2) NULL CHECK (fx_rate_used IS NULL OR fx_rate_used > 0.00),
  fx_status text NOT NULL CHECK (fx_status IN ('live', 'stale', 'demo')),
  items_updated int NOT NULL DEFAULT 0 CHECK (items_updated >= 0),
  observations_accepted int NOT NULL DEFAULT 0 CHECK (observations_accepted >= 0),
  observations_rejected int NOT NULL DEFAULT 0 CHECK (observations_rejected >= 0),
  error_summary text NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_executed_at
  ON public.sync_logs (executed_at DESC);

-- 5. Quote Requests (Lead Capture - Server-Only via service_role)
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 120),
  whatsapp_phone text NOT NULL CHECK (char_length(whatsapp_phone) BETWEEN 8 AND 25),
  city text NOT NULL,
  preset_or_summary text NOT NULL,
  capex_sdg NUMERIC(18, 2) NOT NULL CHECK (capex_sdg >= 0.00),
  capex_usd NUMERIC(18, 2) NOT NULL CHECK (capex_usd >= 0.00),
  recurring_monthly_usd NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (recurring_monthly_usd >= 0.00),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'closed', 'spam')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at
  ON public.quote_requests (created_at DESC);

-- 6. Admin Audit Logs (Server-Only)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  target_slug text NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);

-- 7. App Config (Configurable Demo Assumptions editable by Admin)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description_ar text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_config (key, value, description_ar)
VALUES
  (
    'regional_markups',
    '{
      "portsudan": {"label_ar": "بورتسودان", "markup_pct": 0.00},
      "gedaref": {"label_ar": "القضارف", "markup_pct": 5.00},
      "kassala": {"label_ar": "كسلا", "markup_pct": 5.00},
      "atbara": {"label_ar": "عطبرة", "markup_pct": 5.00},
      "wad_madani": {"label_ar": "ود مدني", "markup_pct": 6.00},
      "omdurman": {"label_ar": "أم درمان", "markup_pct": 8.00},
      "khartoum": {"label_ar": "الخرطوم", "markup_pct": 8.00},
      "kosti": {"label_ar": "كوستي", "markup_pct": 8.00}
    }'::jsonb,
    'تقديرات الشحن والنقل الإقليمي المضافة حسب المدينة (قابلة للتعديل من لوحة الإدارة)'
  ),
  (
    'bos_percentage',
    '{"percentage": 12.00}'::jsonb,
    'نسبة تقديرية للكابلات والقواطع والحوامل والتركيب (BOS)'
  ),
  (
    'peak_sun_hours',
    '{"hours": 5.50, "derating_factor": 0.80, "inverter_efficiency": 0.90}'::jsonb,
    'متوسط ساعات الذروة الشمسية ومعامل الفقد الهندسي في السودان'
  )
ON CONFLICT (key) DO NOTHING;

-- Row Level Security (RLS)
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solar_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Public Read-Only Policies for Market Transparency Tables
DROP POLICY IF EXISTS "Public read exchange_rates" ON public.exchange_rates;
CREATE POLICY "Public read exchange_rates"
  ON public.exchange_rates FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read solar_equipment" ON public.solar_equipment;
CREATE POLICY "Public read solar_equipment"
  ON public.solar_equipment FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read price_observations" ON public.price_observations;
CREATE POLICY "Public read price_observations"
  ON public.price_observations FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read sync_logs" ON public.sync_logs;
CREATE POLICY "Public read sync_logs"
  ON public.sync_logs FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read app_config" ON public.app_config;
CREATE POLICY "Public read app_config"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Explicit Deny Policies on Sensitive Tables (service_role bypasses RLS)
DROP POLICY IF EXISTS "Deny public access quote_requests" ON public.quote_requests;
CREATE POLICY "Deny public access quote_requests"
  ON public.quote_requests FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny public access admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "Deny public access admin_audit_logs"
  ON public.admin_audit_logs FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
