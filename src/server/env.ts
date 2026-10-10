import "server-only";
import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number.parseInt(v, 10) : Number.NaN;
      return Number.isFinite(n) ? n : fallback;
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: optional,
  SESSION_SECRET: optional,
  ENCRYPTION_KEY: optional,

  // RANEDDIE ID
  AUTH_MODE: z.enum(["local", "oidc", "hybrid"]).default("local"),
  RANEDDIE_ID_ISSUER: optional,
  RANEDDIE_ID_CLIENT_ID: optional,
  RANEDDIE_ID_CLIENT_SECRET: optional,
  RANEDDIE_ID_SCOPES: z.string().default("openid email profile"),
  RANEDDIE_ID_ACCOUNT_URL: optional,
  REQUIRE_EMAIL_VERIFICATION: bool(true),
  SESSION_IDLE_DAYS: int(7),
  SESSION_ABSOLUTE_DAYS: int(30),

  // Email
  EMAIL_PROVIDER: z.enum(["none", "resend", "smtp"]).default("none"),
  EMAIL_FROM: z.string().default("FIZZ <no-reply@localhost>"),
  RESEND_API_KEY: optional,
  SMTP_URL: optional,

  // AI providers
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_BASE_URL_OVERRIDE: optional,
  ANTHROPIC_REFUSAL_FALLBACK: bool(true),
  ANTHROPIC_WEB_SEARCH_ENABLED: bool(false),
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: optional,
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  TITLE_MODEL: optional,
  AI_REQUEST_TIMEOUT_MS: int(600_000),

  // Storage
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
  S3_BUCKET: optional,
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: bool(false),

  // Sandbox
  SANDBOX_PROVIDER: z.enum(["none", "docker", "e2b"]).default("none"),
  SANDBOX_NETWORK: z.enum(["none", "egress"]).default("none"),
  SANDBOX_CPUS: z.string().default("1"),
  SANDBOX_MEMORY_MB: int(1024),
  SANDBOX_PIDS_LIMIT: int(256),
  SANDBOX_COMMAND_TIMEOUT_SEC: int(120),
  SANDBOX_IDLE_TIMEOUT_MIN: int(30),
  DOCKER_SANDBOX_IMAGE: z.string().default("node:22-bookworm-slim"),
  DOCKER_SANDBOX_RUNTIME: optional,
  E2B_API_KEY: optional,
  E2B_TEMPLATE: z.string().default("base"),

  // Browser automation
  BROWSER_PROVIDER: z.enum(["none", "remote"]).default("none"),
  BROWSER_WS_ENDPOINT: optional,
  BROWSER_CONNECT_MODE: z.enum(["playwright", "cdp"]).default("cdp"),

  // Payments
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  WALLET_LIVE_MODE_ENABLED: bool(false),
  PURCHASING_LIVE_ENABLED: bool(false),
  PORKBUN_API_KEY: optional,
  PORKBUN_SECRET_API_KEY: optional,

  // Misc
  PREVIEW_ORIGIN: optional,
  TRUST_PROXY: bool(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === "production") {
    if (!value.SESSION_SECRET || value.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
    }
    if (!value.ENCRYPTION_KEY) {
      throw new Error("ENCRYPTION_KEY must be set in production.");
    }
  }
  cached = value;
  return value;
}

export const isProduction = () => env().NODE_ENV === "production";

export function appUrl(path = "") {
  return new URL(path, env().APP_URL).toString();
}

export function oidcEnabled() {
  return env().AUTH_MODE !== "local" && oidcConfigured();
}

export function oidcConfigured() {
  const e = env();
  return Boolean(e.RANEDDIE_ID_ISSUER && e.RANEDDIE_ID_CLIENT_ID && e.RANEDDIE_ID_CLIENT_SECRET);
}

/** Local email/password sign-in is the development RANEDDIE ID implementation. */
export function localAuthEnabled() {
  const mode = env().AUTH_MODE;
  return mode === "local" || mode === "hybrid";
}
