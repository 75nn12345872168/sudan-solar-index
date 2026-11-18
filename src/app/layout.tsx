import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://sudan-solar-index.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "مرصد الطاقة الشمسية وستارلينك في السودان | Sudan Solar & Starlink Index",
    template: "%s | مرصد الطاقة الشمسية في السودان",
  },
  description:
    "منصة هندسية وسوقية لحساب منظومات الطاقة الشمسية وأسعار ستارلينك والبطاريات والإنفرترات في السودان بالجنيه السوداني والدولار الموازي مع شفافية مصادر البيانات.",
  keywords: [
    "الطاقة الشمسية في السودان",
    "أسعار ستارلينك السودان",
    "حاسبة الطاقة الشمسية",
    "بطاريات الليثيوم والجل",
    "إنفرتر هايبرد السودان",
    "سعر الدولار الموازي السودان",
  ],
  openGraph: {
    title: "مرصد الطاقة الشمسية وستارلينك في السودان",
    description:
      "حاسبة هندسية دقيقة ومؤشر أسعار معدات الطاقة الشمسية وستارلينك في السودان مع توثيق حالة البيانات (حية / قديمة / مرجعية).",
    locale: "ar_SD",
    type: "website",
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme="dark"
      className={ibmPlexArabic.variable}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased selection:bg-amber-500/30">
        {children}
      </body>
    </html>
  );
}
