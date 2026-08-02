import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400","500","600","700"] });

const SITE = "https://analytics.ripar.io";
const TITLE = "Ripar Analytics — Algorand settlement, measured live";
const DESCRIPTION =
  "Live Algorand block cadence, real transaction fees and USDC movement, measured in your browser straight from public nodes. Every figure is checkable against a block explorer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: SITE, siteName: "Ripar Analytics", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", site: "@RiparOfficial", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
