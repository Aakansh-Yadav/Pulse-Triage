import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});
const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PulseTriage — First-come care with staff cover",
  description:
    "AI triage that books doctor visits first-come, first-served. High-risk patients who wait get hospital staff assistance until their turn, and doctors are paid for every case they oversee.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
