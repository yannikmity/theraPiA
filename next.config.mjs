// Statische Security-Header. Die Content-Security-Policy setzt src/proxy.ts zur Laufzeit (src/lib/csp.ts),
// weil sie je nach Betreiber:in eine Umami-Herkunft enthalten kann – hier darf keine zweite CSP stehen.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Mit einem Proxy puffert Next jeden Request-Body und KÜRZT ihn über dieser Grenze stillschweigend (Standard 10 MB).
    // POST /api/feedback trägt bis zu 8 MB PNG als Base64 (~10,7 MB) plus Text – deshalb 12 MB.
    proxyClientMaxBodySize: "12mb",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
