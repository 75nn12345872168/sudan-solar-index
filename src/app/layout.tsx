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
      "Ù…Ø±ØµØ¯ Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙˆØ³ØªØ§Ø±Ù„ÙŠÙ†Ùƒ ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù† | Sudan Solar & Starlink Index",
    template: "%s | Ù…Ø±ØµØ¯ Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
  },
  description:
    "Ù…Ù†ØµØ© Ù‡Ù†Ø¯Ø³ÙŠØ© ÙˆØ³ÙˆÙ‚ÙŠØ© Ù„Ø­Ø³Ø§Ø¨ Ù…Ù†Ø¸ÙˆÙ…Ø§Øª Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙˆØ£Ø³Ø¹Ø§Ø± Ø³ØªØ§Ø±Ù„ÙŠÙ†Ùƒ ÙˆØ§Ù„Ø¨Ø·Ø§Ø±ÙŠØ§Øª ÙˆØ§Ù„Ø¥Ù†ÙØ±ØªØ±Ø§Øª ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù† Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†ÙŠ ÙˆØ§Ù„Ø¯ÙˆÙ„Ø§Ø± Ø§Ù„Ù…ÙˆØ§Ø²ÙŠ Ù…Ø¹ Ø´ÙØ§ÙÙŠØ© Ù…ØµØ§Ø¯Ø± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.",
  keywords: [
    "Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
    "Ø£Ø³Ø¹Ø§Ø± Ø³ØªØ§Ø±Ù„ÙŠÙ†Ùƒ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
    "Ø­Ø§Ø³Ø¨Ø© Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ©",
    "Ø¨Ø·Ø§Ø±ÙŠØ§Øª Ø§Ù„Ù„ÙŠØ«ÙŠÙˆÙ… ÙˆØ§Ù„Ø¬Ù„",
    "Ø¥Ù†ÙØ±ØªØ± Ù‡Ø§ÙŠØ¨Ø±Ø¯ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
    "Ø³Ø¹Ø± Ø§Ù„Ø¯ÙˆÙ„Ø§Ø± Ø§Ù„Ù…ÙˆØ§Ø²ÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
  ],
  openGraph: {
    title: "Ù…Ø±ØµØ¯ Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙˆØ³ØªØ§Ø±Ù„ÙŠÙ†Ùƒ ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù†",
    description:
      "Ø­Ø§Ø³Ø¨Ø© Ù‡Ù†Ø¯Ø³ÙŠØ© Ø¯Ù‚ÙŠÙ‚Ø© ÙˆÙ…Ø¤Ø´Ø± Ø£Ø³Ø¹Ø§Ø± Ù…Ø¹Ø¯Ø§Øª Ø§Ù„Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ù…Ø³ÙŠØ© ÙˆØ³ØªØ§Ø±Ù„ÙŠÙ†Ùƒ ÙÙŠ Ø§Ù„Ø³ÙˆØ¯Ø§Ù† Ù…Ø¹ ØªÙˆØ«ÙŠÙ‚ Ø­Ø§Ù„Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Ø­ÙŠØ© / Ù‚Ø¯ÙŠÙ…Ø© / Ù…Ø±Ø¬Ø¹ÙŠØ©).",
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
      <head>
        <meta name="google-site-verification" content="RuIOvIJ1RRQcVh1oztObRVEb7X4RUnA3oTS2-3DHvnA" />
      </head>
      <body className="min-h-screen antialiased selection:bg-amber-500/30">
        {children}
      </body>
    </html>
  );
}

