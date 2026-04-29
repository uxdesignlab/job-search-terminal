import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "JS Job Search Agent",
  description: "Local-first dashboard scaffold for the JS job-search command center."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
