"""Offline deterministic unit tests for Sudan Solar & Starlink ingestion pipeline."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURES_DIR = SCRIPT_DIR / "fixtures"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from solar_sync import (  # noqa: E402
    DEFAULT_BASELINE_PRICES,
    RawListing,
    compute_equipment_updates,
    evaluate_observations,
    format_telegram_rtl_summary,
    parse_listing_price,
    run_pipeline,
    score_confidence,
)
from usd_sdg_scraper import (  # noqa: E402
    FxResult,
    normalize_arabic_digits,
    parse_fx_from_html,
    validate_fx_rate,
)


class TestUsdSdgScraper(unittest.TestCase):
    def test_arabic_numeral_normalization_and_customs_exclusion(self) -> None:
        html = (FIXTURES_DIR / "fx_sample.html").read_text(encoding="utf-8")
        parallel, official = parse_fx_from_html(html)
        self.assertEqual(parallel, 12450.0)
        self.assertEqual(official, 9000.0)
        self.assertEqual(normalize_arabic_digits("١٢٬٤٥٠"), "12,450")

    def test_bounds_and_25pct_jump_protection_fallback(self) -> None:
        out_of_bounds = validate_fx_rate(
            candidate=99999.0,
            previous_rate=12000.0,
            previous_status="live",
            previous_observed_at="2026-11-17T10:00:00+00:00",
        )
        self.assertEqual(out_of_bounds.parallel_usd_sdg, 12000.0)
        self.assertEqual(out_of_bounds.data_status, "stale")
        self.assertIn("out_of_bounds", out_of_bounds.rejected_reason or "")

        big_jump = validate_fx_rate(
            candidate=16500.0,  # +37.5% > 25%
            previous_rate=12000.0,
            previous_status="demo",
        )
        self.assertEqual(big_jump.parallel_usd_sdg, 12000.0)
        self.assertEqual(big_jump.data_status, "demo")
        self.assertIn("jump_exceeds_25pct", big_jump.rejected_reason or "")

        valid = validate_fx_rate(candidate=12600.0, previous_rate=12000.0)
        self.assertEqual(valid.parallel_usd_sdg, 12600.0)
        self.assertEqual(valid.data_status, "live")
        self.assertIsNone(valid.rejected_reason)


class TestSolarSyncPipeline(unittest.TestCase):
    def test_price_parsing_sdg_million_and_usd(self) -> None:
        sdg, usd = parse_listing_price("2.9 مليون جنيه", 12450.0)
        self.assertEqual(sdg, 2_900_000.0)
        self.assertAlmostEqual(usd, 232.93, places=2)

        sdg2, usd2 = parse_listing_price("$510", 12450.0)
        self.assertEqual(usd2, 510.0)
        self.assertEqual(sdg2, 510.0 * 12450.0)

    def test_outlier_rejection_and_confidence_scoring(self) -> None:
        listings = [
            RawListing("test", "لوح شمسي لونجي 550 واط", "$115"),
            RawListing("test", "لوح شمسي لونجي 550 واط", "$120"),
            RawListing("test", "كابل لوح شمسي لونجي 550 واط", "$25"),  # -78% outlier
        ]
        obs = evaluate_observations(listings, DEFAULT_BASELINE_PRICES, 12000.0)
        accepted = [o for o in obs if o.accepted]
        rejected = [o for o in obs if not o.accepted]

        self.assertEqual(len(accepted), 2)
        self.assertEqual(len(rejected), 1)
        self.assertIn("outlier_exceeds_35pct_of_reference", rejected[0].rejection_reason or "")
        self.assertEqual(score_confidence(len(accepted)), "medium")

    def test_compute_updates_preserves_manual_override_and_marks_stale(self) -> None:
        catalog = {
            k: dict(v) for k, v in DEFAULT_BASELINE_PRICES.items()
        }
        # Manual override should keep effective_usd unchanged even with new observations
        catalog["starlink-v4-standard"]["price_basis"] = "manual"
        catalog["starlink-v4-standard"]["effective_usd"] = 540.0

        # Item observed >24h ago with no fresh observations becomes stale
        old_ts = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        catalog["panel-jinko-580w"]["last_observed_at"] = old_ts
        catalog["panel-jinko-580w"]["data_status"] = "live"

        obs = evaluate_observations(
            [RawListing("test", "ستارلينك الجيل الرابع V4", "$510")],
            catalog,
            12000.0,
        )
        fx = FxResult(12000.0, 9000.0, "live", "test", datetime.now(timezone.utc).isoformat())
        updates = compute_equipment_updates(catalog, obs, fx)
        by_slug = {u["slug"]: u for u in updates}

        self.assertEqual(by_slug["starlink-v4-standard"]["price_basis"], "manual")
        self.assertEqual(by_slug["starlink-v4-standard"]["effective_usd"], 540.0)
        self.assertEqual(by_slug["starlink-v4-standard"]["observed_usd"], 510.0)
        self.assertEqual(by_slug["panel-jinko-580w"]["data_status"], "stale")
        self.assertEqual(by_slug["panel-jinko-580w"]["last_observed_at"], old_ts)

    def test_dry_run_performs_zero_db_writes_and_zero_telegram_calls(self) -> None:
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = []
        mock_supabase.table.return_value.select.return_value.execute.return_value.data = []
        with patch("solar_sync.requests.post") as mock_post, patch(
            "solar_sync.requests.get"
        ) as mock_get:
            result = run_pipeline(
                dry_run=True,
                fixture_dir=FIXTURES_DIR,
                supabase_client=mock_supabase,
            )

        self.assertTrue(result["dry_run"])
        self.assertFalse(result["telegram_sent"])
        self.assertEqual(result["fx"]["parallel_usd_sdg"], 12450.0)
        self.assertEqual(result["observations_accepted"], 9)
        self.assertEqual(result["observations_rejected"], 1)
        by_slug = {u["slug"]: u for u in result["updates"]}
        self.assertEqual(by_slug["panel-longi-550w"]["sample_count"], 3)
        self.assertEqual(by_slug["panel-longi-550w"]["confidence"], "medium")
        self.assertEqual(by_slug["battery-gel-200ah-12v"]["sample_count"], 2)

        # Strictly zero Telegram or web network calls when running fixtures in dry-run
        mock_post.assert_not_called()
        mock_get.assert_not_called()
        # Strictly zero DB writes
        mock_supabase.table.return_value.insert.assert_not_called()
        mock_supabase.table.return_value.update.assert_not_called()
        mock_supabase.table.return_value.upsert.assert_not_called()

    def test_telegram_rtl_summary_states_provenance_and_timestamp(self) -> None:
        fx = FxResult(12450.0, 9000.0, "live", "fixture", "2026-11-18T00:00:00+00:00")
        updates = compute_equipment_updates(DEFAULT_BASELINE_PRICES, [], fx)
        msg = format_telegram_rtl_summary(
            fx, updates, DEFAULT_BASELINE_PRICES, accepted_count=0, rejected_count=0
        )
        self.assertIn("مرصد الطاقة الشمسية وستارلينك في السودان", msg)
        self.assertIn("أسعار مرجعية تقديرية (Demo)", msg)
        self.assertIn("2026-11-18T00:00:00+00:00", msg)


if __name__ == "__main__":
    unittest.main()
