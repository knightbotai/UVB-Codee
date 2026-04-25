import type { Metadata } from "next";
import { Orbitron, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UVB | Ultimate Voice Bridge — KnightBot AI Assistant",
  description:
    "The Ultimate Voice Bridge: an AI-Human interface suite featuring KnightBot AI Assistant with multi-modal capabilities, voice analysis, podcast creation, and persistent memory.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${orbitron.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased bg-uvb-matte-black text-uvb-text-primary`}
      >
        {children}
      </body>
    </html>
  );
}
