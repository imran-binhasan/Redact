import type { NextConfig } from "next";

/**
 * The vault key lives in memory in the browser, so injected script is the
 * realistic threat rather than anything server-side. These headers narrow what
 * a successful injection could do and where it could send anything it read.
 *
 * `script-src` still needs 'unsafe-inline' for Next's hydration bootstrap; the
 * value of the policy here is that no *external* origin can load script and
 * `connect-src` stops exfiltration to anywhere but Supabase.
 */
const extraSupabaseOrigin = (() => {
  const urlStr = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!urlStr) return "";
  try {
    const parsed = new URL(urlStr);
    const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${parsed.origin} ${wsProto}//${parsed.host}`;
  } catch {
    return "";
  }
})();

const connectSrc = ["'self'", "https://*.supabase.co", "wss://*.supabase.co", extraSupabaseOrigin]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Nothing here needs a camera, a microphone or a location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
