import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { auditLog } from "@/server/auth/schema";
import type { SessionPayload } from "@/server/auth/session";

type AuditInput = {
  session?: SessionPayload | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: unknown;
};

export function writeAuditLog(input: AuditInput) {
  db.insert(auditLog)
    .values({
      id: randomUUID(),
      tenantId: input.session?.tenantId ?? "anonymous",
      orgId: input.session?.orgId,
      userId: input.session?.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      detail: JSON.stringify(input.detail ?? {}),
      createdAt: new Date().toISOString(),
    })
    .run();
}

export async function withAuditLog<T>(
  input: AuditInput,
  action: () => Promise<T> | T,
) {
  const result = await action();
  writeAuditLog(input);
  return result;
}
