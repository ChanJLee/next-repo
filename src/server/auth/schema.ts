import { relations } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { z } from "zod";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  dataScope: text("data_scope").notNull().default("ORG"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const dictionaries = sqliteTable("dictionaries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  type: text("type").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled").notNull().default(1),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  orgId: text("org_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: text("detail").notNull().default("{}"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  roles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
  permissions: many(rolePermissions),
}));

export const loginSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6).max(128),
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2).max(64),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
