import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/outfit/600.css";
import "./globals.css";
import "./ui-polish.css";
import "./navigation.css";
import "./fleet.css";
import "./contacts.css";
import "./notifications.css";
import "./figma-marketplace.css";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
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
        <SiteFooter />
      </body>
    </html>
  );
}
