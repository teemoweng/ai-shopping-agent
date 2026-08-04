import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Shopping Guide Concept",
  description: "Synthetic US K-Beauty sunscreen decision prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
