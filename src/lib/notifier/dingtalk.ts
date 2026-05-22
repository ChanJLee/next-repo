import crypto from "node:crypto";

export interface DingTalkConfig {
  webhook: string;
  secret?: string;
}

function sign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(stringToSign);
  return encodeURIComponent(hmac.digest("base64"));
}

export async function sendDingTalkMarkdown(
  cfg: DingTalkConfig,
  title: string,
  markdown: string,
): Promise<void> {
  let url = cfg.webhook;
  if (cfg.secret) {
    const ts = Date.now();
    const s = sign(cfg.secret, ts);
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}timestamp=${ts}&sign=${s}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title, text: markdown },
    }),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!res.ok || (typeof body === "object" && body && (body as { errcode?: number }).errcode !== 0)) {
    throw new Error(`DingTalk push failed: ${res.status} ${text}`);
  }
}
