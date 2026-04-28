import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { sqlite } from "@/db";
import { writeAuditLog } from "@/server/audit/service";
import { createSessionToken, type SessionPayload } from "./session";
import { createUser, findUserById, findUserByUsername } from "./repository";

const defaultTenantId = "tenant-demo";
const defaultOrgId = "org-demo";
const defaultRoleId = "role-admin";

export async function registerUser(input: {
  username: string;
  password: string;
  name: string;
}) {
  const existing = findUserByUsername(input.username);

  if (existing) {
    throw new Error("用户名已存在");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const userId = randomUUID();

  const user = sqlite.transaction(() => {
    const created = createUser({
      id: userId,
      tenantId: defaultTenantId,
      orgId: defaultOrgId,
      username: input.username,
      passwordHash,
      name: input.name,
      status: "ACTIVE",
    });

    sqlite
      .prepare(
        "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
      )
      .run(created.id, defaultRoleId);

    return created;
  })();

  writeAuditLog({
    action: "register",
    entity: "users",
    entityId: user.id,
    detail: { username: user.username },
  });

  return user;
}

export async function loginUser(input: {
  username: string;
  password: string;
}) {
  const user = findUserByUsername(input.username);

  if (!user || user.status !== "ACTIVE") {
    throw new Error("用户名或密码不正确");
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash);

  if (!validPassword) {
    throw new Error("用户名或密码不正确");
  }

  return {
    user,
    token: createSessionToken({
      userId: user.id,
      tenantId: user.tenantId,
      orgId: user.orgId,
      name: user.name,
    }),
  };
}

export function getSessionUser(session: SessionPayload) {
  return findUserById(session.userId);
}
