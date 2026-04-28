import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { sqlite } from "@/db";
import { writeAuditLog } from "@/server/audit/service";
import type { SessionPayload } from "@/server/auth/session";
import { all, get, nextCode, run, scope } from "@/server/phase1/repository";
import { requirePermission } from "@/server/permissions";
import type {
  ApprovalFlowInput,
  DictionaryInput,
  NumberRuleInput,
  OrganizationInput,
  ParameterInput,
  RoleInput,
  UserInput,
} from "./schema";

type Row = Record<string, unknown>;
type OrganizationRow = Row & {
  id: string;
  parent_id: string | null;
  level: number;
  name: string;
};

function tx<T>(action: () => T) {
  return sqlite.transaction(action)();
}

function normalizeJson(value: string) {
  return JSON.stringify(JSON.parse(value || "{}"));
}

export function listOrganizations(session: SessionPayload) {
  return all<OrganizationRow>(
    `SELECT *
     FROM organizations
     WHERE tenant_id = ?
     ORDER BY level, sort_order, created_at`,
    [session.tenantId],
  );
}

export function createOrganization(session: SessionPayload, input: OrganizationInput) {
  requirePermission(session, "system:org:view");
  const id = randomUUID();
  const parent = input.parentId
    ? get<{ level: number }>(
        "SELECT level FROM organizations WHERE tenant_id = ? AND id = ?",
        [session.tenantId, input.parentId],
      )
    : undefined;
  const level = Math.min((parent?.level ?? 0) + 1, 4);

  tx(() => {
    run(
      `INSERT INTO organizations
        (id, tenant_id, parent_id, level, org_type, name, code, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        input.parentId || null,
        level,
        input.orgType,
        input.name,
        input.code,
        level * 10,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "organizations", entityId: id });
  return id;
}

export function listRoles(session: SessionPayload) {
  requirePermission(session, "system:role:view");
  return all(
    `SELECT r.*,
      COUNT(DISTINCT rp.permission_id) AS permissionCount,
      COUNT(DISTINCT rfp.field_code) AS fieldPermissionCount
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN role_field_permissions rfp ON rfp.role_id = r.id
     WHERE r.tenant_id = ?
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [session.tenantId],
  );
}

export function listPermissions() {
  return all("SELECT * FROM permissions ORDER BY code");
}

export function listRoleFieldPermissions(session: SessionPayload) {
  requirePermission(session, "system:role:view");
  return all(
    `SELECT rfp.*, r.name AS roleName
     FROM role_field_permissions rfp
     JOIN roles r ON r.id = rfp.role_id
     WHERE r.tenant_id = ?
     ORDER BY r.name, rfp.field_code`,
    [session.tenantId],
  );
}

export function createRole(session: SessionPayload, input: RoleInput) {
  requirePermission(session, "system:role:view");
  const roleId = randomUUID();
  tx(() => {
    run(
      `INSERT INTO roles (id, tenant_id, name, code, data_scope)
       VALUES (?, ?, ?, ?, ?)`,
      [roleId, session.tenantId, input.name, input.code, input.dataScope],
    );

    for (const permissionCode of input.permissionCodes) {
      const permission = get<{ id: string }>(
        "SELECT id FROM permissions WHERE code = ?",
        [permissionCode],
      );
      if (permission) {
        run(
          "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
          [roleId, permission.id],
        );
      }
    }

    for (const [fieldCode, accessLevel] of Object.entries(input.fieldPermissions)) {
      run(
        `INSERT OR REPLACE INTO role_field_permissions
          (role_id, field_code, access_level)
         VALUES (?, ?, ?)`,
        [roleId, fieldCode, accessLevel],
      );
    }
  });
  writeAuditLog({ session, action: "create", entity: "roles", entityId: roleId });
  return roleId;
}

export function listUsers(session: SessionPayload) {
  requirePermission(session, "config:write");
  return all(
    `SELECT u.*, o.name AS orgName,
      GROUP_CONCAT(r.name, '、') AS roleNames
     FROM users u
     JOIN organizations o ON o.id = u.org_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.tenant_id = ?
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [session.tenantId],
  );
}

export function createUser(session: SessionPayload, input: UserInput) {
  requirePermission(session, "config:write");
  const userId = randomUUID();
  const passwordHash = bcrypt.hashSync(input.password, 12);

  tx(() => {
    const org = get<{ id: string }>(
      "SELECT id FROM organizations WHERE tenant_id = ? AND id = ?",
      [session.tenantId, input.orgId],
    );
    if (!org) throw new Error("组织不存在");

    run(
      `INSERT INTO users
        (id, tenant_id, org_id, username, password_hash, name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        session.tenantId,
        input.orgId,
        input.username,
        passwordHash,
        input.name,
        input.status,
      ],
    );

    for (const roleId of input.roleIds) {
      const role = get<{ id: string }>(
        "SELECT id FROM roles WHERE tenant_id = ? AND id = ?",
        [session.tenantId, roleId],
      );
      if (role) {
        run(
          "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [userId, role.id],
        );
      }
    }
  });
  writeAuditLog({
    session,
    action: "create",
    entity: "users",
    entityId: userId,
    detail: { username: input.username, orgId: input.orgId },
  });
  return userId;
}

export function listApprovalFlows(session: SessionPayload) {
  requirePermission(session, "workflow:write");
  return all(
    `SELECT af.*,
      COUNT(DISTINCT afn.id) AS nodeCount,
      COUNT(DISTINCT afe.id) AS edgeCount
     FROM approval_flows af
     LEFT JOIN approval_flow_nodes afn ON afn.flow_id = af.id
     LEFT JOIN approval_flow_edges afe ON afe.flow_id = af.id
     WHERE af.tenant_id = ? AND af.org_id = ?
     GROUP BY af.id
     ORDER BY af.updated_at DESC`,
    scope(session),
  );
}

export function getApprovalFlowCanvas(session: SessionPayload, id: string) {
  const flow = get(
    `SELECT * FROM approval_flows
     WHERE tenant_id = ? AND org_id = ? AND id = ?`,
    [...scope(session), id],
  );
  if (!flow) return null;

  return {
    flow,
    nodes: all(
      `SELECT * FROM approval_flow_nodes
       WHERE flow_id = ?
       ORDER BY sort_order`,
      [id],
    ),
    edges: all(
      `SELECT * FROM approval_flow_edges
       WHERE flow_id = ?
       ORDER BY sort_order`,
      [id],
    ),
  };
}

export function createApprovalFlow(session: SessionPayload, input: ApprovalFlowInput) {
  requirePermission(session, "workflow:write");
  const flowId = randomUUID();
  tx(() => {
    run(
      `INSERT INTO approval_flows
        (id, tenant_id, org_id, code, name, document_type, condition_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        flowId,
        session.tenantId,
        session.orgId,
        input.code,
        input.name,
        input.documentType,
        normalizeJson(input.conditionJson),
      ],
    );

    const nodes = [
      ["start", "START", "提交", "", 40, 120],
      ["review", "APPROVAL", "主管审批", "manager", 280, 120],
      ["end", "END", "通过", "", 520, 120],
    ] as const;

    nodes.forEach((node, index) => {
      run(
        `INSERT INTO approval_flow_nodes
          (id, flow_id, node_key, node_type, title, assignee_role_code, x, y, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), flowId, ...node, index + 1],
      );
    });

    const edges = [
      ["start", "review", "满足条件"],
      ["review", "end", "审批通过"],
    ] as const;

    edges.forEach((edge, index) => {
      run(
        `INSERT INTO approval_flow_edges
          (id, flow_id, source_node_key, target_node_key, condition_label, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), flowId, ...edge, index + 1],
      );
    });
  });
  writeAuditLog({ session, action: "create", entity: "approval_flows", entityId: flowId });
  return flowId;
}

export function getFixedReports(session: SessionPayload) {
  requirePermission(session, "report:view");
  const [tenantId, orgId] = scope(session);
  const domains = [
    {
      key: "sales",
      title: "销售报表",
      valueLabel: "销售额",
      sql: "SELECT status AS name, SUM(CAST(total_amount AS REAL)) AS value FROM sales_orders WHERE tenant_id = ? AND org_id = ? GROUP BY status",
    },
    {
      key: "inventory",
      title: "库存报表",
      valueLabel: "库存价值",
      sql: "SELECT w.name, SUM(CAST(i.qty_on_hand AS REAL) * CAST(i.avg_cost AS REAL)) AS value FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id WHERE i.tenant_id = ? AND i.org_id = ? GROUP BY w.id",
    },
    {
      key: "purchase",
      title: "采购报表",
      valueLabel: "采购额",
      sql: "SELECT status AS name, SUM(CAST(total_amount AS REAL)) AS value FROM purchase_orders WHERE tenant_id = ? AND org_id = ? GROUP BY status",
    },
    {
      key: "service",
      title: "售后报表",
      valueLabel: "工单数",
      sql: "SELECT status AS name, COUNT(*) AS value FROM service_orders WHERE tenant_id = ? AND org_id = ? GROUP BY status",
    },
    {
      key: "warranty",
      title: "三包报表",
      valueLabel: "索赔额",
      sql: "SELECT status AS name, SUM(CAST(claim_amount AS REAL)) AS value FROM warranty_claims WHERE tenant_id = ? AND org_id = ? GROUP BY status",
    },
    {
      key: "finance",
      title: "财务报表",
      valueLabel: "应收余额",
      sql: "SELECT status AS name, SUM(CAST(balance_amount AS REAL)) AS value FROM receivables WHERE tenant_id = ? AND org_id = ? GROUP BY status",
    },
  ];

  return domains.map((domain) => {
    const rows = all<{ name: string; value: number }>(domain.sql, [tenantId, orgId]);
    const total = rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);

    return {
      ...domain,
      rows,
      total: total.toFixed(domain.key === "service" ? 0 : 2),
    };
  });
}

export function listCustomReports(session: SessionPayload) {
  requirePermission(session, "report:view");
  return all(
    `SELECT * FROM custom_reports
     WHERE tenant_id = ? AND org_id = ?
     ORDER BY created_at DESC`,
    scope(session),
  );
}

export function listNumberRules(session: SessionPayload) {
  requirePermission(session, "config:write");
  return all(
    `SELECT * FROM document_number_rules
     WHERE tenant_id = ? AND org_id = ?
     ORDER BY document_type`,
    scope(session),
  );
}

export function createNumberRule(session: SessionPayload, input: NumberRuleInput) {
  requirePermission(session, "config:write");
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT OR REPLACE INTO document_number_rules
        (id, tenant_id, org_id, document_type, prefix, date_pattern, sequence_length, reset_cycle, enabled)
       VALUES (
        COALESCE((SELECT id FROM document_number_rules WHERE tenant_id = ? AND org_id = ? AND document_type = ?), ?),
        ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        session.tenantId,
        session.orgId,
        input.documentType,
        id,
        session.tenantId,
        session.orgId,
        input.documentType,
        input.prefix,
        input.datePattern,
        input.sequenceLength,
        input.resetCycle,
        input.enabled,
      ],
    );
  });
  writeAuditLog({ session, action: "upsert", entity: "document_number_rules", entityId: id });
}

export function listAuditLogs(session: SessionPayload, query = "") {
  requirePermission(session, "config:write");
  const keyword = `%${query.trim()}%`;
  if (query.trim()) {
    return all(
      `SELECT al.*, u.name AS userName
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.tenant_id = ?
         AND (al.entity LIKE ? OR al.action LIKE ? OR al.entity_id LIKE ?)
       ORDER BY al.created_at DESC
       LIMIT 100`,
      [session.tenantId, keyword, keyword, keyword],
    );
  }

  return all(
    `SELECT al.*, u.name AS userName
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.tenant_id = ?
     ORDER BY al.created_at DESC
     LIMIT 100`,
    [session.tenantId],
  );
}

export function listDictionaries(session: SessionPayload) {
  requirePermission(session, "config:write");
  return all(
    `SELECT * FROM dictionaries
     WHERE tenant_id = ?
     ORDER BY type, sort_order, code`,
    [session.tenantId],
  );
}

export function createDictionary(session: SessionPayload, input: DictionaryInput) {
  requirePermission(session, "config:write");
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT OR REPLACE INTO dictionaries
        (id, tenant_id, type, code, label, sort_order, enabled)
       VALUES (
        COALESCE((SELECT id FROM dictionaries WHERE tenant_id = ? AND type = ? AND code = ?), ?),
        ?, ?, ?, ?, ?, 1
       )`,
      [
        session.tenantId,
        input.type,
        input.code,
        id,
        session.tenantId,
        input.type,
        input.code,
        input.label,
        input.sortOrder,
      ],
    );
  });
  writeAuditLog({ session, action: "upsert", entity: "dictionaries", entityId: id });
}

export function listParameters(session: SessionPayload) {
  requirePermission(session, "config:write");
  return all(
    `SELECT * FROM system_parameters
     WHERE tenant_id = ? AND org_id = ?
     ORDER BY param_key`,
    scope(session),
  );
}

export function createParameter(session: SessionPayload, input: ParameterInput) {
  requirePermission(session, "config:write");
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT OR REPLACE INTO system_parameters
        (id, tenant_id, org_id, param_key, param_value, value_type, description)
       VALUES (
        COALESCE((SELECT id FROM system_parameters WHERE tenant_id = ? AND org_id = ? AND param_key = ?), ?),
        ?, ?, ?, ?, ?, ?
       )`,
      [
        session.tenantId,
        session.orgId,
        input.paramKey,
        id,
        session.tenantId,
        session.orgId,
        input.paramKey,
        input.paramValue,
        input.valueType,
        input.description,
      ],
    );
  });
  writeAuditLog({ session, action: "upsert", entity: "system_parameters", entityId: id });
}

export function previewNextDocumentCode(input: { prefix: string }) {
  return nextCode(input.prefix);
}
