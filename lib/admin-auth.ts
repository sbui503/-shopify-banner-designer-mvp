import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "tsb_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

type AdminSession = {
  username: string;
  expiresAt: number;
};

function configuredUsername() {
  return process.env.ADMIN_LOGIN_USERNAME || "";
}

function configuredPassword() {
  return process.env.ADMIN_LOGIN_PASSWORD || "";
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function isAdminAuthConfigured() {
  return Boolean(configuredUsername() && configuredPassword() && sessionSecret());
}

export function validateAdminCredentials(username: unknown, password: unknown) {
  if (!isAdminAuthConfigured()) return false;
  return safeEqual(String(username || ""), configuredUsername())
    && safeEqual(String(password || ""), configuredPassword());
}

export function createAdminSession(username: string) {
  if (!isAdminAuthConfigured()) throw new Error("Admin authentication is not configured.");
  const session: AdminSession = {
    username,
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSession(value: string | undefined) {
  if (!isAdminAuthConfigured() || !value) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    return safeEqual(session.username || "", configuredUsername())
      && Number.isFinite(session.expiresAt)
      && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}
