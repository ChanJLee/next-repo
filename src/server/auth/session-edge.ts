import type { SessionPayload } from "./session";

export const sessionCookieName = "sb_session";

function getSecret() {
  return process.env.AUTH_SECRET ?? "dev-secret-change-before-production";
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return atob(padded);
}

function encodeBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return encodeBase64Url(signature);
}

export async function verifySessionTokenEdge(token?: string) {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature || (await sign(body)) !== signature) {
    return null;
  }

  let payload: SessionPayload;

  try {
    payload = JSON.parse(decodeBase64Url(body)) as SessionPayload;
  } catch {
    return null;
  }

  if (payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

