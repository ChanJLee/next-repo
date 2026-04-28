import { all, get } from "@/server/phase1/repository";
import type { SessionPayload } from "@/server/auth/session";

type PermissionRow = {
  code: string;
};

type FieldPermissionRow = {
  field_code: string;
  access_level: "VISIBLE" | "MASKED" | "HIDDEN";
};

export type FieldAccess = "VISIBLE" | "MASKED" | "HIDDEN";

const defaultFieldAccess: FieldAccess = "VISIBLE";

export function listSessionPermissionCodes(session: SessionPayload) {
  return all<PermissionRow>(
    `SELECT DISTINCT p.code
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = ? AND u.tenant_id = ?`,
    [session.userId, session.tenantId],
  ).map((row) => row.code);
}

export function hasPermission(session: SessionPayload, code: string) {
  const row = get<PermissionRow>(
    `SELECT p.code
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = ? AND u.tenant_id = ? AND p.code = ?
     LIMIT 1`,
    [session.userId, session.tenantId, code],
  );

  return Boolean(row);
}

export function requirePermission(session: SessionPayload, code: string) {
  if (!hasPermission(session, code)) {
    throw new Error("当前账号没有执行该操作的权限");
  }
}

export function getRoleDataScopes(session: SessionPayload) {
  return all<{ data_scope: string }>(
    `SELECT DISTINCT r.data_scope
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.id = ? AND u.tenant_id = ?`,
    [session.userId, session.tenantId],
  ).map((row) => row.data_scope);
}

export function getFieldAccessMap(session: SessionPayload) {
  const rows = all<FieldPermissionRow>(
    `SELECT rfp.field_code, rfp.access_level
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN role_field_permissions rfp ON rfp.role_id = ur.role_id
     WHERE u.id = ? AND u.tenant_id = ?`,
    [session.userId, session.tenantId],
  );

  const rank: Record<FieldAccess, number> = {
    HIDDEN: 0,
    MASKED: 1,
    VISIBLE: 2,
  };
  const accessMap = new Map<string, FieldAccess>();

  for (const row of rows) {
    const current = accessMap.get(row.field_code) ?? defaultFieldAccess;
    if (rank[row.access_level] < rank[current]) {
      accessMap.set(row.field_code, row.access_level);
    } else if (!accessMap.has(row.field_code)) {
      accessMap.set(row.field_code, row.access_level);
    }
  }

  return accessMap;
}

export function maskText(value: unknown) {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${text.slice(0, 2)}${"*".repeat(Math.min(text.length - 4, 8))}${text.slice(-2)}`;
}

export function applyFieldAccess<T extends Record<string, unknown>>(
  row: T,
  accessMap: Map<string, FieldAccess>,
  fieldCodes: string[],
) {
  const next = { ...row };

  for (const fieldCode of fieldCodes) {
    const access = accessMap.get(fieldCode) ?? defaultFieldAccess;
    if (access === "HIDDEN") {
      next[fieldCode as keyof T] = "" as T[keyof T];
    }
    if (access === "MASKED") {
      next[fieldCode as keyof T] = maskText(next[fieldCode]) as T[keyof T];
    }
  }

  return next;
}
