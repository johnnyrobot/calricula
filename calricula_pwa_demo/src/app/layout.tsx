import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Calricula — Curriculum of Record",
    template: "%s · Calricula",
  },
  description:
    "A local-first curriculum management demonstration for authoring and reviewing California community-college curriculum.",
  applicationName: "Calricula",
  manifest: "/manifest.webmanifest",
  keywords: [
    "curriculum management",
    "Course Outline of Record",
    "California community colleges",
    "Title 5",
    "PCAH",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Calricula",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1F2A44",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
