import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent the app being embedded in an iframe (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer information on outbound links
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser features not needed by the app
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self)",
  },
  // CSP: allow self + the three AI provider APIs for connect-src
  // unsafe-inline / unsafe-eval are required by Next.js dev mode and RSC
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://api.openai.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdf-parse", "better-sqlite3"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
