import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirana · Your buying workspace",
  description: "Personal product research, review comparisons and daily price tracking.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
