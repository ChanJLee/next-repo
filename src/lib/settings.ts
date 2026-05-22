import { prisma } from "@/lib/db";

const KEYS = {
  webhook: "dingtalk_webhook",
  secret: "dingtalk_secret",
} as const;

export async function getDingTalkConfig(): Promise<{ webhook: string; secret?: string } | null> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [KEYS.webhook, KEYS.secret] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const webhook = map[KEYS.webhook];
  if (!webhook) return null;
  return { webhook, secret: map[KEYS.secret] || undefined };
}

export async function setDingTalkConfig(webhook: string, secret: string): Promise<void> {
  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: KEYS.webhook }, update: { value: webhook }, create: { key: KEYS.webhook, value: webhook } }),
    prisma.setting.upsert({ where: { key: KEYS.secret }, update: { value: secret }, create: { key: KEYS.secret, value: secret } }),
  ]);
}

export const SettingKeys = KEYS;
