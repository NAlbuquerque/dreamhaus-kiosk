import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DreamHaus — IRIS Style Concierge",
  description: "Your personalized DreamHaus styling experience.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
