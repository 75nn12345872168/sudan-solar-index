"""Parallel USD/SDG exchange rate extractor with validation and safe fallback."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

import requests
from bs4 import BeautifulSoup

MIN_RATE = 500.0
MAX_RATE = 50000.0
MAX_JUMP_RATIO = 0.25

ARABIC_TO_ASCII = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٬٫",
    "01234567890123456789,.",
)

CUSTOMS_EXCLUSION_KEYWORDS = (
    "جمرك",
    "جمارك",
    "الجمركي",
    "customs",
    "رسمي",
    "المركزي",
    "official",
)

PARALLEL_CONTEXT_KEYWORDS = (
    "موازي",
    "السوق الموازي",
    "السوق الأسود",
    "سوق موازي",
    "parallel",
    "دولار",
    "usd",
    "سعر الصرف",
    "جنيه",
)


@dataclass(frozen=True)
class FxResult:
    parallel_usd_sdg: float
    official_usd_sdg: float
    data_status: str  # 'live' | 'stale' | 'demo'
    source: str
    observed_at: str
    rejected_reason: Optional[str] = None


def normalize_arabic_digits(text: str) -> str:
    """Convert Arabic-Indic and Eastern Arabic numerals to ASCII digits."""
    return text.translate(ARABIC_TO_ASCII)


def extract_numbers(text: str) -> list[float]:
    """Extract numeric candidates from normalized text."""
    normalized = normalize_arabic_digits(text)
    matches = re.findall(r"\b\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d+(?:\.\d+)?", normalized)
    values: list[float] = []
    for raw in matches:
        cleaned = raw.replace(",", "")
        try:
            values.append(float(cleaned))
        except ValueError:
            continue
    return values


def parse_fx_from_html(html: str) -> tuple[Optional[float], Optional[float]]:
    """
    Parse parallel and official USD/SDG rates from HTML text.
    Excludes customs rate lines from parallel extraction.
    """
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n", strip=True)
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    parallel_candidates: list[float] = []
    official_candidates: list[float] = []

    for line in lines:
        lowered = line.lower()
        is_customs_or_official = any(kw in lowered for kw in CUSTOMS_EXCLUSION_KEYWORDS)
        has_parallel_ctx = any(kw in lowered for kw in PARALLEL_CONTEXT_KEYWORDS)

        nums = [n for n in extract_numbers(line) if MIN_RATE <= n <= MAX_RATE]
        if not nums:
            continue

        if is_customs_or_official:
            if "رسمي" in lowered or "المركزي" in lowered or "official" in lowered:
                official_candidates.append(nums[0])
            continue

        if has_parallel_ctx:
            parallel_candidates.append(nums[0])

    parallel_rate = parallel_candidates[0] if parallel_candidates else None
    official_rate = official_candidates[0] if official_candidates else None
    return parallel_rate, official_rate


def validate_fx_rate(
    candidate: Optional[float],
    previous_rate: Optional[float],
    previous_status: str = "demo",
    previous_observed_at: Optional[str] = None,
    previous_official: float = 9000.0,
    candidate_official: Optional[float] = None,
    source_name: str = "fx_scraper",
) -> FxResult:
    """
    Validate extracted FX rate against [500, 50000] bounds and +/-25% jump protection.
    Falls back safely to previous rate with 'stale' or 'demo' status.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    fallback_rate = previous_rate if previous_rate and MIN_RATE <= previous_rate <= MAX_RATE else 12000.0
    fallback_status = "stale" if previous_status in ("live", "stale") else "demo"
    fallback_observed = previous_observed_at or now_iso
    resolved_official = (
        candidate_official
        if candidate_official and MIN_RATE <= candidate_official <= MAX_RATE
        else previous_official
    )

    if candidate is None:
        return FxResult(
            parallel_usd_sdg=round(fallback_rate, 2),
            official_usd_sdg=round(resolved_official, 2),
            data_status=fallback_status,
            source=f"fallback:{source_name}",
            observed_at=fallback_observed,
            rejected_reason="no_valid_parallel_rate_found",
        )

    if candidate < MIN_RATE or candidate > MAX_RATE:
        return FxResult(
            parallel_usd_sdg=round(fallback_rate, 2),
            official_usd_sdg=round(resolved_official, 2),
            data_status=fallback_status,
            source=f"fallback:{source_name}",
            observed_at=fallback_observed,
            rejected_reason=f"rate_out_of_bounds:{candidate}",
        )

    if previous_rate and previous_rate > 0:
        jump_ratio = abs(candidate - previous_rate) / previous_rate
        if jump_ratio > MAX_JUMP_RATIO:
            return FxResult(
                parallel_usd_sdg=round(fallback_rate, 2),
                official_usd_sdg=round(resolved_official, 2),
                data_status=fallback_status,
                source=f"fallback:{source_name}",
                observed_at=fallback_observed,
                rejected_reason=f"jump_exceeds_25pct:{jump_ratio:.2%}",
            )

    return FxResult(
        parallel_usd_sdg=round(candidate, 2),
        official_usd_sdg=round(resolved_official, 2),
        data_status="live",
        source=source_name,
        observed_at=now_iso,
        rejected_reason=None,
    )


def fetch_fx_rate(
    previous_rate: Optional[float] = None,
    previous_status: str = "demo",
    previous_observed_at: Optional[str] = None,
    previous_official: float = 9000.0,
    fx_source_url: Optional[str] = None,
    fetcher: Optional[Callable[[str], str]] = None,
) -> FxResult:
    """Fetch and validate parallel USD/SDG exchange rate from configured source."""
    target_url = fx_source_url or os.getenv("FX_SOURCE_URL", "").strip()
    if not target_url:
        return validate_fx_rate(
            candidate=None,
            previous_rate=previous_rate,
            previous_status=previous_status,
            previous_observed_at=previous_observed_at,
            previous_official=previous_official,
            source_name="unconfigured_fx_source",
        )

    try:
        if fetcher is not None:
            html = fetcher(target_url)
        else:
            resp = requests.get(
                target_url,
                timeout=12,
                headers={"User-Agent": "SudanSolarIndexBot/1.0"},
            )
            resp.raise_for_status()
            html = resp.text

        parallel, official = parse_fx_from_html(html)
        return validate_fx_rate(
            candidate=parallel,
            previous_rate=previous_rate,
            previous_status=previous_status,
            previous_observed_at=previous_observed_at,
            previous_official=previous_official,
            candidate_official=official,
            source_name=target_url,
        )
    except Exception as exc:
        result = validate_fx_rate(
            candidate=None,
            previous_rate=previous_rate,
            previous_status=previous_status,
            previous_observed_at=previous_observed_at,
            previous_official=previous_official,
            source_name=target_url,
        )
        return FxResult(
            parallel_usd_sdg=result.parallel_usd_sdg,
            official_usd_sdg=result.official_usd_sdg,
            data_status=result.data_status,
            source=result.source,
            observed_at=result.observed_at,
            rejected_reason=f"fetch_error:{type(exc).__name__}",
        )
