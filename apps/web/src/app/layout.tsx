import type { Metadata } from "next";
import "./globals.css";
import {ExplorerSession} from '@/features/explorer/ExplorerSession';

export const metadata: Metadata = {
  title: "Khonsu | Find what time reveals",
  description:
    "A public explorer for comparing real SPHEREx sky observations over time. Built by BYTEBOYZ for NASA Space Apps 2026.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/khonsu-mark.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><ExplorerSession>{children}</ExplorerSession></body>
    </html>
  );
}
