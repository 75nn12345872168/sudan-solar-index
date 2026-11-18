import { FAQ_ITEMS } from "@/lib/faq-data";
import { fetchMarketSnapshot } from "@/lib/market-data";
import { SolarPlatformClient } from "@/components/SolarPlatformClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await fetchMarketSnapshot();

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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SolarPlatformClient
        exchangeRate={snapshot.exchangeRate}
        equipment={snapshot.equipment}
        assumptions={snapshot.assumptions}
        syncLogs={snapshot.syncLogs}
        recentObservations={snapshot.recentObservations}
        isSupabaseConnected={snapshot.isSupabaseConnected}
      />
    </>
  );
}
