export type HeaderEntry = { key: string; value: string };

const PLAID_LINK_SCRIPT = "https://cdn.plaid.com";
const PLAID_API_ORIGINS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
} as const;

function plaidApiOrigin(value = process.env.PLAID_ENV ?? "sandbox") {
  if (value in PLAID_API_ORIGINS) {
    return PLAID_API_ORIGINS[value as keyof typeof PLAID_API_ORIGINS];
  }
  throw new Error("PLAID_ENV must be sandbox, development, or production.");
}

export function contentSecurityPolicy(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  plaidEnv: string | undefined = process.env.PLAID_ENV
) {
  const development = nodeEnv !== "production";
  // Next.js static CSP and Plaid Link both need inline scripts/styles.
  // unsafe-eval stays in development, where React uses it for debugging.
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    PLAID_LINK_SCRIPT,
    development ? "'unsafe-eval'" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `frame-src ${PLAID_LINK_SCRIPT}`,
    `connect-src 'self' ${plaidApiOrigin(plaidEnv)}`,
    "upgrade-insecure-requests"
  ].join("; ");
}

export function securityHeaderList(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  plaidEnv: string | undefined = process.env.PLAID_ENV
): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()"
    },
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy(nodeEnv, plaidEnv)
    }
  ];

  if (nodeEnv === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload"
    });
  }

  return headers;
}

export function sanitizeRequestPath(path: string) {
  const cut = path.indexOf("?");
  return cut === -1 ? path : path.slice(0, cut);
}
