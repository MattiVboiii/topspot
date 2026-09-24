import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/lib/i18n/provider";
import { DM_Sans, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TopSpot — Party Jukebox",
    template: "%s · TopSpot",
  },
  description: "Democratic Spotify party queue. Guests vote, the host plays.",
  applicationName: "TopSpot",
  keywords: ["Spotify", "party", "jukebox", "queue", "voting"],
  authors: [{ name: "TopSpot" }],
  openGraph: {
    title: "TopSpot — Party Jukebox",
    description: "Democratic Spotify party queue. Guests vote, the host plays.",
    type: "website",
    siteName: "TopSpot",
  },
  twitter: {
    card: "summary",
    title: "TopSpot — Party Jukebox",
    description: "Democratic Spotify party queue. Guests vote, the host plays.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="party-shell min-h-full flex flex-col font-[family-name:var(--font-body)]">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
