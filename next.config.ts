import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Extra origins allowed to be framed (e.g. sandbox dev-server previews such as https://*.e2b.app).
const frameOrigins = (process.env.PREVIEW_FRAME_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; Monaco needs blob: workers.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  `frame-src 'self' ${frameOrigins.join(" ")}`.trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["playwright-core", "e2b", "nodemailer", "tar-stream", "@aws-sdk/client-s3"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        // Live previews set their own sandboxing CSP; everything else gets the app policy.
        source: "/((?!preview/).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
