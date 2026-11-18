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

def parse_price(price_text: str) -> tuple[float | None, float | None]:
    if not price_text:
        return None, None
    clean = price_text.replace(",", "").replace("،", "").strip()
    nums = re.findall(r"\d+(?:\.\d+)?", clean)
    if not nums:
        return None, None
    val = float(nums[0])
    if val <= 10:
        return None, None
    if "$" in clean or "دولار" in clean or "USD" in clean.upper() or val < 15000:
        return None, val
    return val, None

def extract_listing_details(ad_url: str) -> tuple[str | None, str | None]:
    try:
        resp = requests.get(ad_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None, None
        soup = BeautifulSoup(resp.text, "html.parser")
        phone = normalize_sd_phone(soup.get_text(" ", strip=True))
        img_tag = soup.select_one("meta[property='og:image']")
        img_url = img_tag["content"] if img_tag and img_tag.get("content") else None
        return phone, img_url
    except Exception:
        return None, None

def scrape_opensooq() -> list[dict]:
    collected = {}
    now_iso = datetime.now(timezone.utc).isoformat()
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
                price_el = a.select_one("[class*='price'], [class*='Price']")
                price_raw = price_el.get_text(" ", strip=True) if price_el else card_text
                price_sdg, price_usd = parse_price(price_raw)
                img_el = a.select_one("img")
                img_url = (img_el.get("data-src") or img_el.get("src")) if img_el else None
                phone, detail_img = extract_listing_details(full_url)
                if not img_url and detail_img:
                    img_url = detail_img
                collected[ext_id] = {
                    "external_id": ext_id,
                    "source_platform": "OpenSooq",
                    "category": target["category"],
                    "title": title[:140],
                    "price_sdg": price_sdg,
                    "price_usd": price_usd,
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
        res.raise_for_status()
        print(f"Upserted {len(records)} live listings.")
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
    deact = requests.patch(f"{rest_url}?is_direct_partner=eq.false&last_seen_at=lt.{cutoff}", headers=sb_headers, data=json.dumps({"is_active": False}), timeout=20)
    deact.raise_for_status()

if __name__ == "__main__":
    items = scrape_opensooq()
    print(f"Fetched {len(items)} listings.")
    sync_to_supabase(items)

