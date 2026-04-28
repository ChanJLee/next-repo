import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookieName = "sb_session";

export type SessionPayload = {
  userId: string;
  tenantId: string;
  orgId: string;
  name: string;
  expiresAt: number;
};

const maxAgeSeconds = 60 * 60 * 24 * 7;

function getSecret() {
  return process.env.AUTH_SECRET ?? "dev-secret-change-before-production";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionToken(
  payload: Omit<SessionPayload, "expiresAt">,
) {
  const body = encodeBase64Url(
    JSON.stringify({
      ...payload,
      expiresAt: Date.now() + maxAgeSeconds * 1000,
    }),
  );

  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token?: string): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
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

export { maxAgeSeconds };
