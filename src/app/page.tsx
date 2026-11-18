import { FAQ_ITEMS } from "@/lib/faq-data";
import { fetchMarketSnapshot } from "@/lib/market-data";
import { SolarPlatformClient } from "@/components/SolarPlatformClient";
import LiveListingsSection, { LiveListing } from "@/components/LiveListingsSection";

export const dynamic = "force-dynamic";

async function fetchLiveListings(): Promise<LiveListing[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return [];

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/live_listings?select=*&is_active=eq.true&order=last_seen_at.desc&limit=40`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    return (await res.json()) as LiveListing[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [snapshot, liveListings] = await Promise.all([
    fetchMarketSnapshot(),
    fetchLiveListings(),
  ]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <LiveListingsSection listings={liveListings} />
      </div>
      <SolarPlatformClient
        exchangeRate={snapshot.exchangeRate}
        equipment={snapshot.equipment}
        assumptions={snapshot.assumptions}
        syncLogs={snapshot.syncLogs}
        recentObservations={snapshot.recentObservations}
        isSupabaseConnected={snapshot.isSupabaseConnected}
      />
    </div>
  );
}
