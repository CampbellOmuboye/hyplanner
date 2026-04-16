import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HyPlanner 1.0",
    template: "%s · HyPlanner",
  },
  description:
    "Seven-step hydrogen valley workflow: structured planning from location signals to stakeholder mapping, demand, assessment, training, expert review, and feedback.",
  applicationName: "HyPlanner",
  keywords: ["hydrogen", "hydrogen valley", "project planning", "H2", "workflow"],
  authors: [{ name: "HyPlanner" }],
  openGraph: {
    type: "website",
    locale: "en",
    url: "/",
    siteName: "HyPlanner",
    title: "HyPlanner 1.0",
    description:
      "Structured seven-step planning for hydrogen valley programmes—from location signals to roadmap feedback.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HyPlanner 1.0",
    description:
      "Structured seven-step planning for hydrogen valley programmes—from location signals to roadmap feedback.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 font-sans text-zinc-900">{children}</body>
    </html>
  );
}
