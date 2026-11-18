import { ImageResponse } from "next/og";
import { fetchMarketSnapshot } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "مرصد الطاقة الشمسية وستارلينك في السودان";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS_TEXT: Record<string, string> = {
  live: "LIVE MARKET DATA (<24H)",
  stale: "STALE OBSERVATION (>24H)",
  demo: "CONFIGURABLE DEMO BASELINE",
};

export default async function OpenGraphImage() {
  const snapshot = await fetchMarketSnapshot();
  const fx = snapshot.exchangeRate;
  const starlinkV4 = snapshot.equipment.find(
    (e) => e.slug === "starlink-v4-standard"
  );
  const panel550 = snapshot.equipment.find((e) => e.slug === "panel-longi-550w");

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0B1120 0%, #111827 100%)",
          color: "#F8FAFC",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#F59E0B",
            }}
          >
            SUDAN SOLAR & STARLINK INDEX
          </div>
          <div
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              fontSize: 18,
              fontWeight: 700,
              backgroundColor:
                fx.data_status === "live"
                  ? "rgba(16, 185, 129, 0.2)"
                  : fx.data_status === "stale"
                  ? "rgba(245, 158, 11, 0.2)"
                  : "rgba(6, 182, 212, 0.2)",
              color:
                fx.data_status === "live"
                  ? "#34D399"
                  : fx.data_status === "stale"
                  ? "#FBBF24"
                  : "#22D3EE",
            }}
          >
            {STATUS_TEXT[fx.data_status] ?? fx.data_status}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.2 }}>
            Sudan Solar & Starlink Pricing & Sizing
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#94A3B8" }}>
            {`Parallel USD/SDG: ${fx.parallel_usd_sdg.toLocaleString("en-US")} SDG | Last Observed: ${fx.observed_at.slice(0, 16)}Z`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          <div
            style={{
              flex: 1,
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: 20,
              padding: 24,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ fontSize: 20, color: "#22D3EE" }}>
              Starlink Standard (Gen 3 / V4)
            </span>
            <span style={{ display: "flex", fontSize: 40, fontWeight: 800, marginTop: 8 }}>
              {`$${starlinkV4?.effective_usd ?? 520}`}
            </span>
          </div>
          <div
            style={{
              flex: 1,
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: 20,
              padding: 24,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ fontSize: 20, color: "#F59E0B" }}>
              550W Solar Panel
            </span>
            <span style={{ display: "flex", fontSize: 40, fontWeight: 800, marginTop: 8 }}>
              {`$${panel550?.effective_usd ?? 115}`}
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
