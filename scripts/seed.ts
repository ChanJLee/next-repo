import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";

const tenantId = "tenant-demo";
const orgId = "org-demo";
const adminRoleId = "role-admin";
const userId = "user-admin";

export function seedDatabase(sqlite: Database.Database) {
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO organizations (id, tenant_id, name, code) VALUES (?, ?, ?, ?)",
    )
    .run(orgId, tenantId, "扇贝农机演示经销商", "DEMO");

  sqlite
    .prepare(
      "INSERT OR IGNORE INTO roles (id, tenant_id, name, code, data_scope) VALUES (?, ?, ?, ?, ?)",
    )
    .run(adminRoleId, tenantId, "系统管理员", "admin", "TENANT");

  const permissions = [
    ["perm-dashboard-view", "dashboard:view", "查看驾驶舱", "允许访问经营驾驶舱"],
    ["perm-admin-write", "admin:write", "维护系统配置", "允许维护用户与基础配置"],
  ];

  for (const permission of permissions) {
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES (?, ?, ?, ?)",
      )
      .run(...permission);

    sqlite
      .prepare(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
      )
      .run(adminRoleId, permission[0]);
  }

  const passwordHash = bcrypt.hashSync("demo123456", 12);

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO users
        (id, tenant_id, org_id, username, password_hash, name)
        VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, tenantId, orgId, "admin", passwordHash, "演示管理员");

  sqlite
    .prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)")
    .run(userId, adminRoleId);

  const dictionaries = [
    ["season", "spring", "春耕"],
    ["season", "summer", "夏管"],
    ["season", "autumn", "秋收"],
    ["order_status", "draft", "草稿"],
    ["order_status", "approved", "已审核"],
  ];

  for (const [type, code, label] of dictionaries) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO dictionaries
          (id, tenant_id, type, code, label)
          VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), tenantId, type, code, label);
  }

  console.log("Seed data is ready. Demo account: admin / demo123456");
}

if (process.env.npm_lifecycle_event === "db:seed") {
  mkdirSync(dirname(databaseUrl), { recursive: true });

  const sqlite = new Database(databaseUrl);
  sqlite.pragma("foreign_keys = ON");
  seedDatabase(sqlite);
  sqlite.close();
}
