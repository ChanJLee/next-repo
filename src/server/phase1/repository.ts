import { sqlite } from "@/db";
import type { SessionPayload } from "@/server/auth/session";

export type Row = Record<string, unknown>;

export function all<T extends Row>(sql: string, params: unknown[] = []) {
  return sqlite.prepare(sql).all(...params) as T[];
}

export function get<T extends Row>(sql: string, params: unknown[] = []) {
  return sqlite.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  return sqlite.prepare(sql).run(...params);
}

export function nextCode(prefix: string) {
  const stamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function scope(session: SessionPayload) {
  return [session.tenantId, session.orgId];
}
