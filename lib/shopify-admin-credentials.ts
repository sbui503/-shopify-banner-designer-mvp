import { list, put } from "@vercel/blob";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SHOPIFY_API_VERSION = "2026-07";
const SETTINGS_PREFIX = "team-banner-admin/settings/shopify-admin-token/";

export type ShopifyCredentialSource = "admin-storage" | "client-credentials" | "environment" | "missing";

export type ShopifyCredentialStatus = {
  configured: boolean;
  source: ShopifyCredentialSource;
  storeDomain: string;
  updatedAt: string | null;
  storageConfigured: boolean;
  requiresAdminKey: boolean;
  appCredentialsConfigured: boolean;
};

type SavedCredential = {
  token: string;
  storeDomain: string;
  updatedAt: string;
};

type EncryptedCredentialBlob = {
  version: 1;
  iv: string;
  tag: string;
  data: string;
  updatedAt: string;
  storeDomain: string;
};

let clientCredentialTokenCache: { token: string; storeDomain: string; expiresAt: number } | null = null;

export function normalizeStoreDomain(value: unknown) {
  const clean = String(value || "tsbanners.myshopify.com")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
  return clean || "tsbanners.myshopify.com";
}

export function validateAdminSettingsKey(value: unknown) {
  const configuredKey = process.env.ADMIN_SETTINGS_KEY || "";
  if (!configuredKey) return true;
  return String(value || "") === configuredKey;
}

export async function getShopifyCredentialStatus(): Promise<ShopifyCredentialStatus> {
  const storageConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const envConfigured = Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);
  const clientCredentialsConfigured = Boolean(shopifyClientId() && shopifyClientSecret());
  const envDomain = normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN);

  const saved = await readSavedShopifyCredential().catch(() => null);
  if (saved) {
    return {
      configured: true,
      source: "admin-storage",
      storeDomain: saved.storeDomain,
      updatedAt: saved.updatedAt,
      storageConfigured,
      requiresAdminKey: Boolean(process.env.ADMIN_SETTINGS_KEY),
      appCredentialsConfigured: clientCredentialsConfigured
    };
  }

  return {
    configured: envConfigured,
    source: envConfigured ? "environment" : "missing",
    storeDomain: envDomain,
    updatedAt: null,
    storageConfigured,
    requiresAdminKey: Boolean(process.env.ADMIN_SETTINGS_KEY),
    appCredentialsConfigured: clientCredentialsConfigured
  };
}

export async function getShopifyAdminCredential(): Promise<SavedCredential | null> {
  const saved = await readSavedShopifyCredential().catch(() => null);
  if (saved) return saved;

  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (token) {
    return {
      token,
      storeDomain: normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN),
      updatedAt: ""
    };
  }

  return getClientCredentialToken();
}

async function getClientCredentialToken(): Promise<SavedCredential | null> {
  const clientId = shopifyClientId();
  const clientSecret = shopifyClientSecret();
  if (!clientId || !clientSecret) return null;

  const storeDomain = normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN);
  if (clientCredentialTokenCache
    && clientCredentialTokenCache.storeDomain === storeDomain
    && clientCredentialTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return {
      token: clientCredentialTokenCache.token,
      storeDomain,
      updatedAt: ""
    };
  }

  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `Shopify app token request failed with HTTP ${response.status}.`);
  }

  const accessToken = normalizeAdminToken(result.access_token);
  const expiresIn = Math.max(300, Number(result.expires_in) || 86400);
  clientCredentialTokenCache = {
    token: accessToken,
    storeDomain,
    expiresAt: Date.now() + expiresIn * 1000
  };
  return { token: accessToken, storeDomain, updatedAt: "" };
}

function shopifyClientId() {
  return String(process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || "").trim();
}

function shopifyClientSecret() {
  return String(process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "").trim();
}

export async function saveShopifyAdminCredential(input: { token: string; storeDomain?: string }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required before admin credentials can be saved.");
  }

  const token = normalizeAdminToken(input.token);
  const storeDomain = normalizeStoreDomain(input.storeDomain || process.env.SHOPIFY_STORE_DOMAIN);
  const updatedAt = new Date().toISOString();
  const encrypted = encryptCredential({ token, storeDomain, updatedAt });

  await put(`${SETTINGS_PREFIX}${Date.now()}.json`, JSON.stringify(encrypted), {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    contentType: "application/json"
  });

  return { storeDomain, updatedAt };
}

export async function validateShopifyAdminCredential(input: { token: string; storeDomain?: string }) {
  const token = normalizeAdminToken(input.token);
  const storeDomain = normalizeStoreDomain(input.storeDomain || process.env.SHOPIFY_STORE_DOMAIN);
  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({
      query: `query TSBannerAdminCredentialCheck {
        shop {
          name
          myshopifyDomain
        }
        orders(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`
    })
  });

  const result = await response.json().catch(() => ({}));
  const errors = Array.isArray(result.errors) ? result.errors : [];
  if (!response.ok || errors.length > 0) {
    const message = errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ");
    throw new Error(message || `Shopify rejected the token with HTTP ${response.status}.`);
  }

  return {
    storeDomain,
    shopName: result.data?.shop?.name || "",
    myshopifyDomain: result.data?.shop?.myshopifyDomain || storeDomain,
    canReadOrders: true
  };
}

function normalizeAdminToken(value: unknown) {
  const token = String(value || "").trim();
  if (!token || token.length < 20 || /\s/.test(token)) {
    throw new Error("Enter a valid Shopify Admin API access token.");
  }
  return token;
}

async function readSavedShopifyCredential(): Promise<SavedCredential | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  const result = await list({ prefix: SETTINGS_PREFIX, limit: 100 });
  const latest = [...(result.blobs || [])].sort((a, b) => {
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  })[0];
  if (!latest) return null;

  const response = await fetch(latest.url, { cache: "no-store" });
  if (!response.ok) return null;
  const encrypted = (await response.json()) as EncryptedCredentialBlob;
  return decryptCredential(encrypted);
}

function settingsSecret() {
  const secret = process.env.ADMIN_SETTINGS_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!secret) throw new Error("ADMIN_SETTINGS_SECRET or BLOB_READ_WRITE_TOKEN is required.");
  return createHash("sha256").update(secret).digest();
}

function encryptCredential(credential: SavedCredential): EncryptedCredentialBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
    updatedAt: credential.updatedAt,
    storeDomain: credential.storeDomain
  };
}

function decryptCredential(encrypted: EncryptedCredentialBlob): SavedCredential {
  if (encrypted.version !== 1) throw new Error("Unsupported Shopify credential format.");
  const decipher = createDecipheriv("aes-256-gcm", settingsSecret(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, "base64")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(decrypted) as SavedCredential;
  return {
    token: normalizeAdminToken(parsed.token),
    storeDomain: normalizeStoreDomain(parsed.storeDomain),
    updatedAt: parsed.updatedAt || encrypted.updatedAt || ""
  };
}
