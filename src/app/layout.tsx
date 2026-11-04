import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/poppins/600.css";
import "@fontsource/outfit/600.css";
import "./globals.css";
import { Header } from "@/components/header";
import Link from "next/link";
export const metadata: Metadata = {
  title: {
    default: "Rent2Go — Rentals, tours & agency partners",
    template: "%s | Rent2Go",
  },
  description: "A connected marketplace for approved rental and tour agencies.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        {children}
        <footer className="site-footer">
          <span className="wordmark">
            Rent2Go<span>.</span>
          </span>
          <p>Car rentals, tours, and agency partners.</p>
          <small>Local development demonstration · 2026</small>
          <p>
            <Link href="/photo-credits">Demo photo credits</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
