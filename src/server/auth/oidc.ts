import "server-only";
import * as client from "openid-client";
import { db } from "../db";
import { env, oidcEnabled } from "../env";
import { notConfigured } from "../http";
import { audit } from "../audit";
import { ensureFreeSubscription } from "../billing/subscriptions";

/**
 * RANEDDIE ID — OAuth 2.0 / OpenID Connect integration (authorization code + PKCE).
 * Active only when AUTH_MODE is "oidc" or "hybrid" and issuer/client credentials are set.
 */

export const OIDC_PROVIDER = "raneddie-id";
export const OIDC_COOKIE = "fizz_oidc";

let configPromise: Promise<client.Configuration> | null = null;

export function oidcConfig(): Promise<client.Configuration> {
  if (!oidcEnabled()) throw notConfigured("RANEDDIE ID single sign-on is not configured on this server.");
  if (!configPromise) {
    const e = env();
    configPromise = client
      .discovery(new URL(e.RANEDDIE_ID_ISSUER!), e.RANEDDIE_ID_CLIENT_ID!, e.RANEDDIE_ID_CLIENT_SECRET!)
      .catch((err) => {
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

export function redirectUri() {
  return new URL("/api/auth/oidc/callback", env().APP_URL).toString();
}

export async function buildAuthorizationRequest() {
  const config = await oidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: env().RANEDDIE_ID_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, codeVerifier, state, nonce };
}

export async function completeAuthorization(currentUrl: URL, checks: { codeVerifier: string; state: string; nonce: string }) {
  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("RANEDDIE ID did not return an ID token.");
  const issuer = config.serverMetadata().issuer;
  return {
    issuer,
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email.toLowerCase() : undefined,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}

/** Finds or provisions the local account linked to a RANEDDIE ID identity. */
export async function upsertOidcUser(identity: Awaited<ReturnType<typeof completeAuthorization>>) {
  const mapping = await db.identityMapping.findUnique({
    where: { provider_issuer_subject: { provider: OIDC_PROVIDER, issuer: identity.issuer, subject: identity.subject } },
    include: { user: true },
  });
  if (mapping) return mapping.user;

  if (!identity.email) throw new Error("RANEDDIE ID did not share an email address for this account.");

  // Only link to an existing local account when the provider asserts the email is verified.
  const existing = await db.user.findUnique({ where: { email: identity.email } });
  if (existing && !identity.emailVerified) {
    throw new Error("This email is already registered. Verify your email with RANEDDIE ID to link the accounts.");
  }
  const user =
    existing ??
    (await db.user.create({
      data: {
        email: identity.email,
        displayName: identity.name ?? identity.email.split("@")[0]!,
        avatarUrl: identity.picture,
        emailVerifiedAt: identity.emailVerified ? new Date() : null,
      },
    }));
  await db.identityMapping.create({
    data: { userId: user.id, provider: OIDC_PROVIDER, issuer: identity.issuer, subject: identity.subject, email: identity.email },
  });
  if (!user.emailVerifiedAt && identity.emailVerified) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  await ensureFreeSubscription(user.id);
  await audit({ userId: user.id, action: existing ? "auth.oidc_linked" : "auth.oidc_registered", metadata: { issuer: identity.issuer } });
  return user;
}

export async function endSessionUrl(): Promise<string | null> {
  if (!oidcEnabled()) return null;
  try {
    const config = await oidcConfig();
    if (!config.serverMetadata().end_session_endpoint) return null;
    return client
      .buildEndSessionUrl(config, { client_id: env().RANEDDIE_ID_CLIENT_ID!, post_logout_redirect_uri: new URL("/", env().APP_URL).toString() })
      .toString();
  } catch {
    return null;
  }
}
