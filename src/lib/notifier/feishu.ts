import crypto from "node:crypto";

export interface FeishuConfig {
  webhook: string;
  secret?: string;
}

/**
 * 飞书自定义机器人加签算法：
 *   stringToSign = `${timestamp}\n${secret}`
 *   sign = base64(HMAC-SHA256(key=stringToSign, data=""))
 * 与钉钉不同：HMAC 的 key 是 timestamp+secret，data 是空串。
 * 注意：timestamp 单位为秒。
 */
function sign(secret: string, timestampSec: number): string {
  const stringToSign = `${timestampSec}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

export type FeishuCardHeaderColor =
  | "blue"
  | "wathet"
  | "turquoise"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "carmine"
  | "violet"
  | "purple"
  | "indigo"
  | "grey";

export interface FeishuCardPayload {
  title: string;
  headerColor: FeishuCardHeaderColor;
  // 多段 markdown 内容（用 lark_md 渲染，支持 **bold**、`code` 等）
  sections: string[];
  // 底部辅助文字（小灰字）
  footer?: string;
}

interface FeishuCardElement {
  tag: string;
  text?: { tag: string; content: string };
  elements?: { tag: string; content: string }[];
}

function buildCard(payload: FeishuCardPayload) {
  const elements: FeishuCardElement[] = [];
  for (const md of payload.sections) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: md } });
  }
  if (payload.footer) {
    elements.push({
      tag: "note",
      elements: [{ tag: "plain_text", content: payload.footer }],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: payload.headerColor,
      title: { tag: "plain_text", content: payload.title },
    },
    elements,
  };
}

export async function sendFeishuCard(cfg: FeishuConfig, payload: FeishuCardPayload): Promise<void> {
  const body: Record<string, unknown> = {
    msg_type: "interactive",
    card: buildCard(payload),
  };

  if (cfg.secret) {
    const ts = Math.floor(Date.now() / 1000);
    body.timestamp = String(ts);
    body.sign = sign(cfg.secret, ts);
  }

  const res = await fetch(cfg.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  // 飞书成功返回 {"StatusCode":0,...} 或 {"code":0,...}（视新旧版本）
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as { code?: number; StatusCode?: number; msg?: string };
  const ok = res.ok && (obj.code === 0 || obj.StatusCode === 0 || obj.code === undefined && obj.StatusCode === undefined);
  if (!ok) {
    throw new Error(`Feishu push failed: ${res.status} ${text}`);
  }
}
