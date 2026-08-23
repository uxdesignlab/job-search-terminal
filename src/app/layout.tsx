import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Job Search — UX Design Lab",
  description: "Local-first job search dashboard. Runs on your machine, keeps your data private.",
  icons: {
    icon: "/images/JST-logo.svg",
    shortcut: "/images/JST-logo.svg",
    apple: "/images/JST-logo.svg",
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
