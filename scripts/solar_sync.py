"""
Sudan Solar & Starlink Index - Market Ingestion & Telegram Broadcasting Pipeline.
Supports --dry-run (strictly zero DB writes and zero Telegram network calls).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from usd_sdg_scraper import (  # noqa: E402
    FxResult,
    extract_numbers,
    fetch_fx_rate,
    normalize_arabic_digits,
)

OUTLIER_THRESHOLD = 0.35  # +/- 35% of reference_usd
STALE_AFTER_HOURS = 24

OPENSOOQ_URLS = [
    "https://sd.opensooq.com/ar/find?term=%D8%B7%D8%A7%D9%82%D8%A9+%D8%B4%D9%85%D8%B3%D9%8A%D8%A9",
    "https://sd.opensooq.com/ar/find?term=%D8%B3%D8%AA%D8%A7%D8%B1%D9%84%D9%8A%D9%86%D9%83",
    "https://sd.opensooq.com/ar/find?term=%D8%A8%D8%B7%D8%A7%D8%B1%D9%8A%D8%A9+%D8%AC%D9%84",
    "https://sd.opensooq.com/ar/find?term=%D8%A7%D9%86%D9%81%D8%B1%D8%AA%D8%B1",
    "https://sd.opensooq.com/ar/find?term=%D9%85%D9%88%D9%84%D8%AF+%D9%83%D9%87%D8%B1%D8%A8%D8%A7%D8%A1",
]

# Deterministic catalog matching rules (slug, required keywords, optional disqualifiers)
CATALOG_MATCH_RULES: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    ("starlink-mini", ("starlink mini", "ستارلينك ميني", "ميني"), ("اشتراك", "شهري", "roam")),
    ("starlink-roam-monthly", ("roam", "اشتراك ستارلينك", "باقة ستارلينك"), ()),
    ("starlink-v4-standard", ("starlink", "ستارلينك"), ("mini", "ميني", "اشتراك", "شهري", "roam")),
    ("panel-jinko-580w", ("580", "جينكو", "jinko"), ()),
    ("panel-longi-550w", ("550", "لونجي", "longi", "لوح شمسي"), ("580",)),
    ("battery-lifepo4-100ah-48v", ("48v", "48 فولت", "5.12"), ("12v", "24v", "إنفرتر", "انفرتر")),
    ("battery-lifepo4-100ah-24v", ("lifepo4", "ليثيوم", "2.56"), ("48v", "48 فولت")),
    ("battery-tubular-220ah-12v", ("220", "انبوبية", "أنبوبية", "tubular"), ()),
    ("battery-gel-200ah-12v", ("200", "جل", "gel"), ("220", "tubular", "ليثيوم", "lifepo4")),
    ("inverter-8000va-48v", ("8000", "8kva", "8 كيلو"), ()),
    ("inverter-5500va-48v", ("5500", "5.5", "5 كيلو", "5000w"), ()),
    ("inverter-3500va-24v", ("3500", "3.5", "3 كيلو", "3000w"), ()),
    ("inverter-1500va-12v", ("1500", "1.5", "1200w"), ()),
    ("generator-diesel-5kva", ("مولد", "generator", "ديزل"), ()),
]

DEFAULT_BASELINE_PRICES: dict[str, dict[str, Any]] = {
    "starlink-v4-standard": {"reference_usd": 520.0, "price_basis": "reference", "effective_usd": 520.0, "data_status": "demo", "last_observed_at": None, "name_ar": "جهاز ستارلينك القياسي (Gen 3 / V4)"},
    "starlink-mini": {"reference_usd": 380.0, "price_basis": "reference", "effective_usd": 380.0, "data_status": "demo", "last_observed_at": None, "name_ar": "جهاز ستارلينك ميني المحمول (Starlink Mini)"},
    "starlink-roam-monthly": {"reference_usd": 120.0, "price_basis": "reference", "effective_usd": 120.0, "data_status": "demo", "last_observed_at": None, "name_ar": "اشتراك ستارلينك الشهري (Roam Unlimited)"},
    "panel-longi-550w": {"reference_usd": 115.0, "price_basis": "reference", "effective_usd": 115.0, "data_status": "demo", "last_observed_at": None, "name_ar": "لوح شمسي لونجي 550 واط (LONGi Mono PERC)"},
    "panel-jinko-580w": {"reference_usd": 128.0, "price_basis": "reference", "effective_usd": 128.0, "data_status": "demo", "last_observed_at": None, "name_ar": "لوح شمسي جينكو 580 واط (Jinko N-Type Bifacial)"},
    "battery-gel-200ah-12v": {"reference_usd": 240.0, "price_basis": "reference", "effective_usd": 240.0, "data_status": "demo", "last_observed_at": None, "name_ar": "بطارية جل ديب سايكل 200 أمبير / 12 فولت"},
    "battery-tubular-220ah-12v": {"reference_usd": 265.0, "price_basis": "reference", "effective_usd": 265.0, "data_status": "demo", "last_observed_at": None, "name_ar": "بطارية أنبوبية 220 أمبير / 12 فولت (Tall Tubular)"},
    "battery-lifepo4-100ah-24v": {"reference_usd": 520.0, "price_basis": "reference", "effective_usd": 520.0, "data_status": "demo", "last_observed_at": None, "name_ar": "بطارية ليثيوم فوسفات 100 أمبير / 24 فولت (2.56kWh)"},
    "battery-lifepo4-100ah-48v": {"reference_usd": 980.0, "price_basis": "reference", "effective_usd": 980.0, "data_status": "demo", "last_observed_at": None, "name_ar": "بطارية ليثيوم جدارية 100 أمبير / 48 فولت (5.12kWh)"},
    "inverter-1500va-12v": {"reference_usd": 210.0, "price_basis": "reference", "effective_usd": 210.0, "data_status": "demo", "last_observed_at": None, "name_ar": "إنفرتر هايبرد موجة نقية 1.5kVA / 12V"},
    "inverter-3500va-24v": {"reference_usd": 390.0, "price_basis": "reference", "effective_usd": 390.0, "data_status": "demo", "last_observed_at": None, "name_ar": "إنفرتر هايبرد موجة نقية 3.5kVA / 24V"},
    "inverter-5500va-48v": {"reference_usd": 580.0, "price_basis": "reference", "effective_usd": 580.0, "data_status": "demo", "last_observed_at": None, "name_ar": "إنفرتر هايبرد موجة نقية 5.5kVA / 48V"},
    "inverter-8000va-48v": {"reference_usd": 920.0, "price_basis": "reference", "effective_usd": 920.0, "data_status": "demo", "last_observed_at": None, "name_ar": "إنفرتر هايبرد صناعي 8.0kVA / 48V"},
    "generator-diesel-5kva": {"reference_usd": 850.0, "price_basis": "reference", "effective_usd": 850.0, "data_status": "demo", "last_observed_at": None, "name_ar": "مولد كهرباء ديزل كاتم صوت 5kVA (احتياطي)"},
}


@dataclass(frozen=True)
class RawListing:
    source_name: str
    title: str
    raw_price_text: str


@dataclass(frozen=True)
class ProcessedObservation:
    equipment_slug: str
    source_name: str
    raw_title: str
    raw_price_sdg: float
    normalized_usd: float
    accepted: bool
    rejection_reason: Optional[str]
    observed_at: str


def match_equipment_slug(title: str) -> Optional[str]:
    """Match a listing title to one of the 14 catalog slugs."""
    lowered = normalize_arabic_digits(title).lower()
    for slug, keywords, disqualifiers in CATALOG_MATCH_RULES:
        if any(dq in lowered for dq in disqualifiers):
            continue
        if any(kw in lowered for kw in keywords):
            return slug
    return None


def parse_listing_price(raw_price_text: str, parallel_usd_sdg: float) -> tuple[float, float]:
    """
    Parse a price string in SDG or USD and normalize to (raw_price_sdg, normalized_usd).
    Handles Arabic numerals, 'مليون' shorthand (e.g. '6.2 مليون'), '$' / 'USD' vs 'جنيه' / 'SDG'.
    """
    normalized = normalize_arabic_digits(raw_price_text).lower()
    nums = extract_numbers(normalized)
    if not nums:
        return 0.0, 0.0

    amount = nums[0]
    if "مليون" in normalized or "million" in normalized:
        amount *= 1_000_000.0
    elif "ألف" in normalized or "الف" in normalized:
        if amount < 10000:
            amount *= 1_000.0

    is_usd = any(tok in normalized for tok in ("$", "usd", "دولار"))
    is_sdg = any(tok in normalized for tok in ("جنيه", "ج.س", "sdg", "سوداني"))

    if is_usd and not is_sdg:
        usd = round(amount, 2)
        sdg = round(amount * parallel_usd_sdg, 2)
        return sdg, usd

    # If explicitly SDG or numeric magnitude >= 20,000 (far above unit USD price)
    if is_sdg or amount >= 20000.0:
        sdg = round(amount, 2)
        usd = round(amount / max(1.0, parallel_usd_sdg), 2)
        return sdg, usd

    # Fallback: treat small untagged numbers (< 5000) as USD
    usd = round(amount, 2)
    sdg = round(amount * parallel_usd_sdg, 2)
    return sdg, usd


def parse_opensooq_html(html: str, source_name: str = "opensooq_sd") -> list[RawListing]:
    """Extract listing title + price pairs from OpenSooq Sudan HTML."""
    soup = BeautifulSoup(html, "html.parser")
    listings: list[RawListing] = []

    cards = soup.select("[data-listing-card], .postListItem, article, .listing-card")
    for card in cards:
        title_el = card.select_one("h2, h3, .postTitle, [data-title]")
        price_el = card.select_one(".price, .postPrice, [data-price]")
        if title_el and price_el:
            listings.append(
                RawListing(
                    source_name=source_name,
                    title=title_el.get_text(" ", strip=True),
                    raw_price_text=price_el.get_text(" ", strip=True),
                )
            )
    return listings


def parse_telegram_preview_html(html: str, source_name: str = "telegram_preview") -> list[RawListing]:
    """Extract equipment price lines from a public Telegram web preview (`t.me/s/...`)."""
    soup = BeautifulSoup(html, "html.parser")
    listings: list[RawListing] = []
    messages = soup.select(".tgme_widget_message_text, .message-text")
    for msg in messages:
        for line in msg.get_text("\n", strip=True).splitlines():
            clean = line.strip()
            if not clean:
                continue
            parts = re.split(r"(?:\s*[-:]\s*|\s+(?:بسعر|السعر)\s+)", clean, maxsplit=1)
            if len(parts) == 2 and parts[0].strip() and parts[1].strip():
                listings.append(
                    RawListing(
                        source_name=source_name,
                        title=parts[0].strip(),
                        raw_price_text=parts[1].strip(),
                    )
                )
    return listings


def evaluate_observations(
    raw_listings: list[RawListing],
    catalog: dict[str, dict[str, Any]],
    parallel_usd_sdg: float,
    observed_at: Optional[str] = None,
) -> list[ProcessedObservation]:
    """Normalize prices and apply +/-35% statistical outlier rejection against reference_usd."""
    ts = observed_at or datetime.now(timezone.utc).isoformat()
    results: list[ProcessedObservation] = []

    for listing in raw_listings:
        slug = match_equipment_slug(listing.title)
        if not slug or slug not in catalog:
            continue

        raw_sdg, normalized_usd = parse_listing_price(
            listing.raw_price_text, parallel_usd_sdg
        )
        if normalized_usd <= 0:
            results.append(
                ProcessedObservation(
                    equipment_slug=slug,
                    source_name=listing.source_name,
                    raw_title=listing.title[:240],
                    raw_price_sdg=raw_sdg,
                    normalized_usd=normalized_usd,
                    accepted=False,
                    rejection_reason="unparseable_price",
                    observed_at=ts,
                )
            )
            continue

        ref_usd = float(catalog[slug]["reference_usd"])
        deviation = abs(normalized_usd - ref_usd) / ref_usd
        if deviation > OUTLIER_THRESHOLD:
            results.append(
                ProcessedObservation(
                    equipment_slug=slug,
                    source_name=listing.source_name,
                    raw_title=listing.title[:240],
                    raw_price_sdg=raw_sdg,
                    normalized_usd=normalized_usd,
                    accepted=False,
                    rejection_reason=f"outlier_exceeds_35pct_of_reference:{deviation:.1%}",
                    observed_at=ts,
                )
            )
            continue

        results.append(
            ProcessedObservation(
                equipment_slug=slug,
                source_name=listing.source_name,
                raw_title=listing.title[:240],
                raw_price_sdg=raw_sdg,
                normalized_usd=normalized_usd,
                accepted=True,
                rejection_reason=None,
                observed_at=ts,
            )
        )

    return results


def score_confidence(sample_count: int) -> str:
    if sample_count >= 5:
        return "high"
    if sample_count >= 2:
        return "medium"
    if sample_count == 1:
        return "low"
    return "none"


def is_stale(iso_timestamp: Optional[str], now: Optional[datetime] = None) -> bool:
    if not iso_timestamp:
        return False
    ref_now = now or datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return (ref_now - parsed) > timedelta(hours=STALE_AFTER_HOURS)
    except ValueError:
        return True


def compute_equipment_updates(
    catalog: dict[str, dict[str, Any]],
    observations: list[ProcessedObservation],
    fx: FxResult,
    now: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    """Compute three-tier pricing updates for each catalog item."""
    ref_now = now or datetime.now(timezone.utc)
    now_iso = ref_now.isoformat()
    grouped: dict[str, list[float]] = {}

    for obs in observations:
        if obs.accepted:
            grouped.setdefault(obs.equipment_slug, []).append(obs.normalized_usd)

    updates: list[dict[str, Any]] = []
    for slug, row in catalog.items():
        accepted_prices = grouped.get(slug, [])
        ref_usd = float(row["reference_usd"])
        current_basis = row.get("price_basis", "reference")
        prev_observed_at = row.get("last_observed_at")

        if accepted_prices:
            median_usd = round(float(statistics.median(accepted_prices)), 2)
            min_usd = round(min(accepted_prices), 2)
            max_usd = round(max(accepted_prices), 2)
            sample_count = len(accepted_prices)
            confidence = score_confidence(sample_count)
            new_basis = "manual" if current_basis == "manual" else "observed"
            effective_usd = (
                round(float(row["effective_usd"]), 2)
                if current_basis == "manual"
                else median_usd
            )
            effective_sdg = round(effective_usd * fx.parallel_usd_sdg, 2)
            updates.append(
                {
                    "slug": slug,
                    "observed_usd": median_usd,
                    "market_min_usd": min_usd,
                    "market_max_usd": max_usd,
                    "effective_usd": effective_usd,
                    "effective_sdg": effective_sdg,
                    "price_basis": new_basis,
                    "data_status": "live",
                    "sample_count": sample_count,
                    "confidence": confidence,
                    "last_observed_at": now_iso,
                    "updated_at": now_iso,
                }
            )
        else:
            # Preserve existing last_observed_at; mark stale if >24h old, otherwise keep demo
            if prev_observed_at:
                status = "stale" if is_stale(prev_observed_at, ref_now) else row.get("data_status", "live")
            else:
                status = "demo"

            effective_usd = (
                round(float(row["effective_usd"]), 2)
                if current_basis == "manual"
                else round(float(row.get("observed_usd") or ref_usd), 2)
                if current_basis == "observed"
                else round(ref_usd, 2)
            )
            effective_sdg = round(effective_usd * fx.parallel_usd_sdg, 2)
            updates.append(
                {
                    "slug": slug,
                    "effective_usd": effective_usd,
                    "effective_sdg": effective_sdg,
                    "data_status": status,
                    "last_observed_at": prev_observed_at,
                    "updated_at": now_iso,
                }
            )

    return updates


def format_telegram_rtl_summary(
    fx: FxResult,
    updates: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    accepted_count: int,
    rejected_count: int,
) -> str:
    """Format clean Arabic RTL Telegram summary explicitly stating provenance & last_observed_at."""
    status_label = {
        "live": "بيانات حية (Live)",
        "stale": "آخر رصد قديم (>24 ساعة)",
        "demo": "أسعار مرجعية تقديرية (Demo)",
    }

    live_items = [u for u in updates if u.get("data_status") == "live"]
    overall_status = "live" if live_items else fx.data_status

    key_slugs = [
        "starlink-v4-standard",
        "panel-longi-550w",
        "battery-gel-200ah-12v",
        "inverter-5500va-48v",
    ]
    update_map = {u["slug"]: u for u in updates}

    lines = [
        "📊 *مرصد الطاقة الشمسية وستارلينك في السودان*",
        f"• حالة البيانات: *{status_label.get(overall_status, overall_status)}*",
        f"• دولار السوق الموازي: *{fx.parallel_usd_sdg:,.0f} ج.س* ({status_label.get(fx.data_status, fx.data_status)})",
        f"• تاريخ الرصد (FX): `{fx.observed_at}`",
        "",
        "⚡ *ملخص المؤشر:*",
    ]

    for slug in key_slugs:
        upd = update_map.get(slug)
        if not upd:
            continue
        name = catalog[slug]["name_ar"]
        obs_ts = upd.get("last_observed_at") or "لم يُرصد ميدانياً بعد (مرجعي)"
        badge = status_label.get(upd["data_status"], upd["data_status"])
        lines.append(
            f"- {name}: *${upd['effective_usd']:,.0f}* ({upd['effective_sdg']:,.0f} ج.س) | {badge} | آخر رصد: `{obs_ts}`"
        )

    lines.extend(
        [
            "",
            f"🔎 العينات المقبولة: {accepted_count} | المرفوضة: {rejected_count}",
        ]
    )
    return "\n".join(lines)


def send_telegram_message(message: str, bot_token: str, channel_id: str) -> bool:
    """Send Telegram broadcast safely wrapped in try/except."""
    if not bot_token or not channel_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": channel_id,
                "text": message,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            },
            timeout=12,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        print(f"[telegram] broadcast failed safely: {exc}", file=sys.stderr)
        return False


def fetch_html(url: str) -> str:
    resp = requests.get(
        url,
        timeout=12,
        headers={"User-Agent": "SudanSolarIndexBot/1.0"},
    )
    resp.raise_for_status()
    return resp.text


def run_pipeline(
    dry_run: bool = False,
    fixture_dir: Optional[Path] = None,
    html_fetcher: Optional[Callable[[str], str]] = None,
    supabase_client: Any = None,
) -> dict[str, Any]:
    """
    Execute the solar & Starlink sync pipeline.
    When dry_run=True, performs ZERO database writes and ZERO Telegram broadcasts.
    """
    load_dotenv()

    client = supabase_client
    if client is None and not dry_run:
        sb_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if sb_url and sb_key:
            from supabase import create_client

            client = create_client(sb_url, sb_key)

    # Load current catalog & previous FX rate (read-only if client exists, else baseline)
    catalog = {k: dict(v) for k, v in DEFAULT_BASELINE_PRICES.items()}
    prev_fx_rate = 12000.0
    prev_fx_status = "demo"
    prev_fx_observed: Optional[str] = None
    prev_official = 9000.0

    if client is not None:
        try:
            fx_resp = (
                client.table("exchange_rates")
                .select("*")
                .order("observed_at", desc=True)
                .limit(1)
                .execute()
            )
            if isinstance(fx_resp.data, list) and fx_resp.data:
                latest_fx = fx_resp.data[0]
                prev_fx_rate = float(latest_fx["parallel_usd_sdg"])
                prev_fx_status = str(latest_fx["data_status"])
                prev_fx_observed = str(latest_fx["observed_at"])
                prev_official = float(latest_fx["official_usd_sdg"])

            eq_resp = client.table("solar_equipment").select("*").execute()
            if isinstance(eq_resp.data, list):
                for row in eq_resp.data:
                    catalog[row["slug"]] = row
        except Exception as exc:
            print(f"[supabase-read] warning: {exc}", file=sys.stderr)

    # 1. Fetch & validate FX rate
    if fixture_dir is not None:
        fx_file = fixture_dir / "fx_sample.html"
        fx_res = fetch_fx_rate(
            previous_rate=prev_fx_rate,
            previous_status=prev_fx_status,
            previous_observed_at=prev_fx_observed,
            previous_official=prev_official,
            fx_source_url="fixture://fx_sample.html",
            fetcher=lambda _url: fx_file.read_text(encoding="utf-8"),
        )
    else:
        fx_res = fetch_fx_rate(
            previous_rate=prev_fx_rate,
            previous_status=prev_fx_status,
            previous_observed_at=prev_fx_observed,
            previous_official=prev_official,
            fetcher=html_fetcher,
        )

    # 2. Scrape listings from fixtures or live web sources
    raw_listings: list[RawListing] = []
    errors: list[str] = []

    if fixture_dir is not None:
        opensooq_file = fixture_dir / "opensooq_solar.html"
        if opensooq_file.exists():
            raw_listings.extend(
                parse_opensooq_html(
                    opensooq_file.read_text(encoding="utf-8"), "fixture_opensooq"
                )
            )
        tg_file = fixture_dir / "telegram_channel.html"
        if tg_file.exists():
            raw_listings.extend(
                parse_telegram_preview_html(
                    tg_file.read_text(encoding="utf-8"), "fixture_telegram"
                )
            )
    else:
        fetcher_fn = html_fetcher or fetch_html
        for url in OPENSOOQ_URLS:
            try:
                html = fetcher_fn(url)
                raw_listings.extend(parse_opensooq_html(html, "opensooq_sd"))
            except Exception as exc:
                errors.append(f"opensooq:{type(exc).__name__}")

        tg_source = os.getenv("SOLAR_SOURCE_URL", "").strip()
        if tg_source:
            try:
                html = fetcher_fn(tg_source)
                raw_listings.extend(parse_telegram_preview_html(html, tg_source))
            except Exception as exc:
                errors.append(f"telegram_source:{type(exc).__name__}")

    # 3. Normalize & filter outliers
    observations = evaluate_observations(raw_listings, catalog, fx_res.parallel_usd_sdg)
    accepted_count = sum(1 for o in observations if o.accepted)
    rejected_count = sum(1 for o in observations if not o.accepted)

    # 4. Compute three-tier equipment updates
    updates = compute_equipment_updates(catalog, observations, fx_res)
    items_updated_live = sum(1 for u in updates if u.get("data_status") == "live")

    # 5. Format Telegram summary
    telegram_text = format_telegram_rtl_summary(
        fx_res, updates, catalog, accepted_count, rejected_count
    )

    sync_status = "success"
    if errors and accepted_count == 0:
        sync_status = "partial" if fx_res.data_status == "live" else "failed"
    elif errors:
        sync_status = "partial"

    telegram_sent = False

    # 6. Persist & broadcast ONLY when NOT dry_run
    if not dry_run:
        if client is not None:
            if fx_res.data_status == "live":
                client.table("exchange_rates").insert(
                    {
                        "parallel_usd_sdg": fx_res.parallel_usd_sdg,
                        "official_usd_sdg": fx_res.official_usd_sdg,
                        "data_status": fx_res.data_status,
                        "source": fx_res.source,
                        "observed_at": fx_res.observed_at,
                    }
                ).execute()

            if observations:
                client.table("price_observations").insert(
                    [asdict(o) for o in observations]
                ).execute()

            for upd in updates:
                slug = upd["slug"]
                payload = {k: v for k, v in upd.items() if k != "slug"}
                client.table("solar_equipment").update(payload).eq("slug", slug).execute()

            client.table("sync_logs").insert(
                {
                    "run_mode": "live",
                    "status": sync_status,
                    "fx_rate_used": fx_res.parallel_usd_sdg,
                    "fx_status": fx_res.data_status,
                    "items_updated": items_updated_live,
                    "observations_accepted": accepted_count,
                    "observations_rejected": rejected_count,
                    "error_summary": "; ".join(errors) if errors else None,
                }
            ).execute()

        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        channel_id = os.getenv("TELEGRAM_CHANNEL_ID", "").strip()
        telegram_sent = send_telegram_message(telegram_text, bot_token, channel_id)

    return {
        "dry_run": dry_run,
        "status": sync_status,
        "fx": asdict(fx_res),
        "raw_listings_count": len(raw_listings),
        "observations_accepted": accepted_count,
        "observations_rejected": rejected_count,
        "items_updated_live": items_updated_live,
        "updates": updates,
        "observations": [asdict(o) for o in observations],
        "telegram_sent": telegram_sent,
        "telegram_preview": telegram_text,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sudan Solar & Starlink sync pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pipeline without any DB writes or Telegram network calls",
    )
    parser.add_argument(
        "--fixtures",
        type=str,
        default=None,
        help="Optional path to offline HTML fixtures directory",
    )
    args = parser.parse_args()

    fixture_path = Path(args.fixtures) if args.fixtures else None
    result = run_pipeline(dry_run=args.dry_run, fixture_dir=fixture_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
