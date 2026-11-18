import os
import re
import json
from datetime import datetime, timezone, timedelta
import requests
from bs4 import BeautifulSoup

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
}

SEARCH_TARGETS = [
    {"category": "starlink", "query": "ستارلينك", "url": "https://sd.opensooq.com/ar/find?term=%D8%B3%D8%AA%D8%A7%D8%B1%D9%84%D9%8A%D9%86%D9%83"},
    {"category": "solar_panels", "query": "الواح شمسية", "url": "https://sd.opensooq.com/ar/find?term=%D8%A7%D9%84%D9%88%D8%A7%D8%AD+%D8%B4%D9%85%D8%B3%D9%8A%D8%A9"},
    {"category": "batteries", "query": "بطارية طاقة شمسية", "url": "https://sd.opensooq.com/ar/find?term=%D8%A8%D8%B7%D8%A7%D8%B1%D9%8A%D8%A9+%D8%B7%D8%A7%D9%82%D8%A9+%D8%B4%D9%85%D8%B3%D9%8A%D8%A9"},
    {"category": "inverters", "query": "انفرتر", "url": "https://sd.opensooq.com/ar/find?term=%D8%A7%D9%86%D9%81%D8%B1%D8%AA%D8%B1"},
]

CITY_MAP = {
    "بورتسودان": "بورتسودان", "البحر الأحمر": "بورتسودان", "القضارف": "القضارف",
    "عطبرة": "عطبرة", "نهر النيل": "عطبرة", "أم درمان": "أم درمان",
    "ام درمان": "أم درمان", "الخرطوم": "الخرطوم", "بحري": "الخرطوم بحري",
    "مدني": "ود مدني", "الجزيرة": "ود مدني", "كسلا": "كسلا",
    "دنقلا": "دنقلا", "الشمالية": "دنقلا", "الأبيض": "الأبيض", "كوستي": "كوستي",
}


def get_live_parallel_rate() -> float:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0.0
    try:
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/exchange_rates?select=parallel_rate&order=updated_at.desc&limit=1",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            timeout=15,
        )
        if res.ok and res.json():
            return float(res.json()[0].get("parallel_rate") or 0)
    except Exception:
        pass
    return 0.0


def normalize_sd_phone(raw_text: str) -> str | None:
    if not raw_text:
        return None
    digits = re.sub(r"\D", "", raw_text)
    match = re.search(r"(?:249|0)?(9\d{8}|1\d{8})", digits)
    return f"249{match.group(1)}" if match else None


def detect_city(text: str) -> str:
    for key, canonical in CITY_MAP.items():
        if key in text:
            return canonical
    return "السودان"


def extract_listing_details(ad_url: str, parallel_rate: float) -> tuple[str | None, str | None, float | None]:
    try:
        resp = requests.get(ad_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None, None, None
        html = resp.text
        soup = BeautifulSoup(html, "html.parser")

        phone = normalize_sd_phone(soup.get_text(" ", strip=True))
        img_tag = soup.select_one("meta[property='og:image']")
        img_url = img_tag["content"] if img_tag and img_tag.get("content") else None

        price_sdg = None
        # 1. البحث عن السعر الرسمي داخل بيانات JSON في الصفحة
        price_match = re.search(r'"price"\s*:\s*"?(\d+(?:\.\d+)?)"?', html)
        curr_match = re.search(r'"priceCurrency"\s*:\s*"([A-Z]{3})"', html)
        if price_match:
            val = float(price_match.group(1))
            curr = curr_match.group(1) if curr_match else "SDG"
            if curr == "USD" and val >= 30 and parallel_rate > 0:
                price_sdg = round(val * parallel_rate, 0)
            elif val >= 5000:
                price_sdg = val

        # 2. إذا لم يوجد في JSON، ابحث في النص عن رقم مقترن بكلمة جنيه أو ج.س
        if price_sdg is None:
            sdg_text_match = re.search(r"(\d[\d,،]{3,})\s*(?:جنيه|ج\.س|SDG)", soup.get_text(" ", strip=True))
            if sdg_text_match:
                clean_num = float(sdg_text_match.group(1).replace(",", "").replace("،", ""))
                if clean_num >= 5000:
                    price_sdg = clean_num

        return phone, img_url, price_sdg
    except Exception:
        return None, None, None


def scrape_opensooq() -> list[dict]:
    collected = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    parallel_rate = get_live_parallel_rate()

    for target in SEARCH_TARGETS:
        try:
            resp = requests.get(target["url"], headers=HEADERS, timeout=20)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            links = soup.select("a[href*='/ar/search/']")
            for a in links[:18]:
                href = a.get("href", "")
                if not href:
                    continue
                full_url = href if href.startswith("http") else f"https://sd.opensooq.com{href}"
                id_match = re.search(r"/(\d{6,})", full_url)
                if not id_match:
                    continue
                ext_id = f"opensooq_{id_match.group(1)}"
                if ext_id in collected:
                    continue

                card_text = a.get_text(" ", strip=True)
                if len(card_text) < 8:
                    continue

                title_el = a.select_one("h2, h3, [class*='title']")
                title = title_el.get_text(" ", strip=True) if title_el else card_text[:90]

                img_el = a.select_one("img")
                img_url = (img_el.get("data-src") or img_el.get("src")) if img_el else None

                phone, detail_img, price_sdg = extract_listing_details(full_url, parallel_rate)
                if not img_url and detail_img:
                    img_url = detail_img

                collected[ext_id] = {
                    "external_id": ext_id,
                    "source_platform": "OpenSooq",
                    "category": target["category"],
                    "title": title[:140],
                    "price_sdg": price_sdg,
                    "price_usd": None,
                    "city": detect_city(card_text),
                    "image_url": img_url,
                    "seller_phone": phone,
                    "source_url": full_url,
                    "is_active": True,
                    "last_seen_at": now_iso,
                }
        except Exception as e:
            print(f"Error scraping {target['query']}: {e}")
    return list(collected.values())


def sync_to_supabase(records: list[dict]):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    rest_url = f"{SUPABASE_URL}/rest/v1/live_listings"
    sb_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    if records:
        res = requests.post(f"{rest_url}?on_conflict=external_id", headers=sb_headers, data=json.dumps(records), timeout=30)
        if not res.ok:
            raise RuntimeError(f"Insert failed ({res.status_code}): {res.text}")
        print(f"Upserted {len(records)} live listings in SDG.")

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=36)).strftime("%Y-%m-%dT%H:%M:%SZ")
    deact = requests.patch(
        rest_url,
        params={"source_platform": "eq.OpenSooq", "is_direct_partner": "eq.false", "last_seen_at": f"lt.{cutoff}"},
        headers=sb_headers,
        data=json.dumps({"is_active": False}),
        timeout=20,
    )
    if not deact.ok:
        raise RuntimeError(f"Deactivate failed ({deact.status_code}): {deact.text}")


if __name__ == "__main__":
    items = scrape_opensooq()
    print(f"Fetched {len(items)} listings.")
    sync_to_supabase(items)
