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

  seedPhase1(sqlite);
  seedPhase2(sqlite);
  seedPhase3(sqlite);

  console.log("Seed data is ready. Demo account: admin / demo123456");
}

function seedPhase1(sqlite: Database.Database) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO suppliers
        (id, tenant_id, org_id, code, name, supplier_type, contact_name, phone, payment_term_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "supplier-lovol",
      tenantId,
      orgId,
      "SUP-001",
      "雷沃重工配件中心",
      "OEM_DIRECT",
      "李经理",
      "13800000001",
      30,
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO warehouses
        (id, tenant_id, org_id, code, name, type, address, manager_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "warehouse-main",
      tenantId,
      orgId,
      "WH-001",
      "总部配件仓",
      "SELF",
      "演示园区 1 号库",
      "王库管",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO warehouse_locations
        (id, tenant_id, org_id, warehouse_id, code, zone, aisle, rack, shelf, bin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "location-a0101",
      tenantId,
      orgId,
      "warehouse-main",
      "A-01-01",
      "A 区",
      "01",
      "01",
      "01",
      "01",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO machine_models
        (id, tenant_id, org_id, code, manufacturer, category, series, model, year_from, year_to, engine_model, power_hp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "machine-lovol-m904",
      tenantId,
      orgId,
      "M-LV-M904",
      "雷沃重工",
      "TRACTOR",
      "欧豹",
      "M904",
      2020,
      2026,
      "玉柴 YCD4J",
      "90",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO customers
        (id, tenant_id, org_id, code, name, customer_type, level, contact_name, phone, credit_limit, payment_term_days, city, county, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "customer-zhang",
      tenantId,
      orgId,
      "CUS-001",
      "张家农机合作社",
      "COOP",
      "GOLD",
      "张师傅",
      "13900000002",
      "50000",
      30,
      "临沂",
      "兰陵县",
      "示范镇农机合作社",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO customer_machines
        (id, tenant_id, org_id, code, customer_id, machine_model_id, factory_serial, engine_serial, purchase_date, whole_warranty_until, key_part_warranty_until, current_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date(?, '+24 months'), date(?, '+36 months'), ?)`,
    )
    .run(
      "customer-machine-001",
      tenantId,
      orgId,
      "CM-001",
      "customer-zhang",
      "machine-lovol-m904",
      "LV2024M9040001",
      "YC240001",
      "2024-03-12",
      "2024-03-12",
      "2024-03-12",
      "386",
    );

  const parts = [
    [
      "part-filter-oil",
      "P-1001",
      "机油滤芯",
      "LOVOL-OF-904",
      "发动机系/滤清器",
      "雷沃",
      "WEAR",
      "45",
      "68",
      20,
      80,
      '{"spring":1.5,"summer":1.2,"autumn":1.8}',
      0,
      0,
    ],
    [
      "part-pump-main",
      "P-2001",
      "液压主泵总成",
      "LOVOL-HP-904",
      "液压系/泵阀",
      "雷沃",
      "THREE_GUARANTEE",
      "2200",
      "3280",
      2,
      8,
      '{"spring":1.2,"summer":1.1,"autumn":1.5}',
      0,
      1,
    ],
  ];

  for (const part of parts) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO parts
          (id, tenant_id, org_id, code, name, oem_code, category, brand, warranty_type,
           ref_purchase_price, ref_sales_price, safety_stock, max_stock, seasonal_factor,
           has_batch, has_serial, default_warehouse_id, default_supplier_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        part[0],
        tenantId,
        orgId,
        part[1],
        part[2],
        part[3],
        part[4],
        part[5],
        part[6],
        part[7],
        part[8],
        part[9],
        part[10],
        part[11],
        part[12],
        part[13],
        "warehouse-main",
        "supplier-lovol",
      );

    sqlite
      .prepare(
        `INSERT OR IGNORE INTO part_machine_fitments
          (id, tenant_id, org_id, part_id, machine_model_id, year_from, year_to)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        tenantId,
        orgId,
        part[0],
        "machine-lovol-m904",
        2020,
        2026,
      );
  }

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO part_substitutes
        (id, tenant_id, org_id, part_id, substitute_part_id, direction, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "substitute-filter-pump-demo",
      tenantId,
      orgId,
      "part-filter-oil",
      "part-pump-main",
      "ONE_WAY",
      "演示替换关系",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO seasonal_calendar
        (id, tenant_id, org_id, region_code, season, start_date, end_date, factor_json, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "season-spring-demo",
      tenantId,
      orgId,
      "370000",
      "SPRING",
      "2026-03-01",
      "2026-04-20",
      '{"发动机系":1.5,"液压系":1.2}',
      "春耕备货窗口",
    );

  for (const [partId, qty, cost] of [
    ["part-filter-oil", "36", "45"],
    ["part-pump-main", "4", "2200"],
  ]) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO inventory
          (id, tenant_id, org_id, part_id, warehouse_id, location_id, qty_on_hand, qty_available, avg_cost, last_transaction_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(
        `inventory-${partId}`,
        tenantId,
        orgId,
        partId,
        "warehouse-main",
        "location-a0101",
        qty,
        qty,
        cost,
      );

    sqlite
      .prepare(
        `INSERT OR IGNORE INTO stock_transactions
          (id, tenant_id, org_id, part_id, warehouse_id, location_id, direction, transaction_type, qty, unit_cost, source_type, source_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'IN', 'OPENING', ?, ?, 'seed', ?, ?)`,
      )
      .run(
        `stock-opening-${partId}`,
        tenantId,
        orgId,
        partId,
        "warehouse-main",
        "location-a0101",
        qty,
        cost,
        partId,
        userId,
      );
  }
}

function seedPhase2(sqlite: Database.Database) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO service_orders
        (id, tenant_id, org_id, code, customer_id, customer_machine_id, source_channel,
         status, fault_description, fault_code, urgency, current_hours, current_acres,
         latitude, longitude, assigned_engineer_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "service-order-demo",
      tenantId,
      orgId,
      "SV-DEMO-001",
      "customer-zhang",
      "customer-machine-001",
      "PHONE",
      "DISPATCHED",
      "液压升降无力，疑似主泵压力不足",
      "HYD-LOW",
      "HIGH",
      "386",
      "0",
      "36.06",
      "118.34",
      "赵工程师",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO service_order_events
        (id, tenant_id, org_id, service_order_id, event_type, title, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "service-event-demo",
      tenantId,
      orgId,
      "service-order-demo",
      "DISPATCH",
      "已派单",
      "派给赵工程师",
      userId,
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO maintenance_templates
        (id, tenant_id, org_id, code, machine_model_id, name, threshold_hours,
         advance_ratio, part_package_json, labor_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "maintenance-template-500h",
      tenantId,
      orgId,
      "MT-500H",
      "machine-lovol-m904",
      "500h 小保养",
      500,
      "0.9",
      '[{"part":"机油滤芯","qty":1},{"part":"液压油滤芯","qty":1}]',
      "2",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO maintenance_preorders
        (id, tenant_id, org_id, code, maintenance_template_id, customer_id,
         customer_machine_id, status, trigger_hours, quote_amount, expected_service_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "maintenance-preorder-demo",
      tenantId,
      orgId,
      "MP-DEMO-001",
      "maintenance-template-500h",
      "customer-zhang",
      "customer-machine-001",
      "GENERATED",
      "386",
      "360",
      "2026-05-10",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO warranty_claims
        (id, tenant_id, org_id, code, service_order_id, customer_id, customer_machine_id,
         failed_part_id, failed_serial, fault_description, claim_amount, material_complete,
         failure_photo, nameplate_photo, repair_order_file, customer_signature_file, purchase_proof_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "warranty-claim-demo",
      tenantId,
      orgId,
      "WC-DEMO-001",
      "service-order-demo",
      "customer-zhang",
      "customer-machine-001",
      "part-pump-main",
      "HP904-SN-0001",
      "主泵压力不足，需返厂鉴定",
      "3280",
      1,
      "failure.jpg",
      "nameplate.jpg",
      "repair-order.pdf",
      "signature.png",
      "purchase-proof.pdf",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO warranty_claim_timeline
        (id, warranty_claim_id, node, status, description)
        VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "warranty-timeline-demo",
      "warranty-claim-demo",
      "AFTER_SALES_MANAGER",
      "PENDING",
      "售后主管待初审",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO stocking_suggestions
        (id, tenant_id, org_id, part_id, warehouse_id, season, current_qty,
         safety_stock, season_factor, suggested_qty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "stocking-suggestion-demo",
      tenantId,
      orgId,
      "part-pump-main",
      "warehouse-main",
      "SPRING",
      "4",
      2,
      "1.2",
      "0",
    );

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO subsidy_ledgers
        (id, tenant_id, org_id, code, customer_id, customer_machine_id, policy_type,
         subsidy_amount, subsidy_ratio, customer_id_no, machine_serial, bank_account,
         application_file, material_complete)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "subsidy-ledger-demo",
      tenantId,
      orgId,
      "SUB-DEMO-001",
      "customer-zhang",
      "customer-machine-001",
      "PURCHASE",
      "12000",
      "0.3",
      "370000199001010000",
      "LV2024M9040001",
      "6222000000000000",
      "subsidy-form.pdf",
      1,
    );
}

function seedPhase3(sqlite: Database.Database) {
  const childOrgs = [
    ["org-region-east", orgId, 2, "REGION", "华东大区", "EAST", 10],
    ["org-store-linyi", "org-region-east", 3, "STORE", "临沂直营店", "LY", 20],
    ["org-team-service", "org-store-linyi", 4, "TEAM", "售后服务组", "SV", 30],
  ];

  for (const org of childOrgs) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO organizations
          (id, tenant_id, parent_id, level, org_type, name, code, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(org[0], tenantId, org[1], org[2], org[3], org[4], org[5], org[6]);
  }

  const phase3Permissions = [
    ["perm-system-org-view", "system:org:view", "查看组织树", "允许查看四级组织树"],
    ["perm-system-role-view", "system:role:view", "查看角色矩阵", "允许查看菜单、按钮、字段和数据权限"],
    ["perm-workflow-write", "workflow:write", "维护审批流", "允许配置单据审批流程"],
    ["perm-report-view", "report:view", "查看固定报表", "允许访问经营报表中心"],
    ["perm-config-write", "config:write", "维护系统配置", "允许维护编号规则、字典和参数"],
  ];

  for (const permission of phase3Permissions) {
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES (?, ?, ?, ?)",
      )
      .run(...permission);
    sqlite
      .prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)")
      .run(adminRoleId, permission[0]);
  }

  const fieldPermissions = [
    ["cost_price", "VISIBLE"],
    ["credit_limit", "VISIBLE"],
    ["customer_id_no", "MASKED"],
    ["bank_account", "MASKED"],
  ];

  for (const [fieldCode, accessLevel] of fieldPermissions) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO role_field_permissions
          (role_id, field_code, access_level)
          VALUES (?, ?, ?)`,
      )
      .run(adminRoleId, fieldCode, accessLevel);
  }

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO approval_flows
        (id, tenant_id, org_id, code, name, document_type, condition_json, status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "approval-flow-sales",
      tenantId,
      orgId,
      "FLOW-SALES-OVER-CREDIT",
      "销售超信用审批",
      "SALES_ORDER",
      '{"totalAmountGte":"50000","creditExceeded":true}',
      "ACTIVE",
      1,
    );

  const nodes = [
    ["approval-node-start", "start", "START", "提交", "", 40, 120, 1],
    ["approval-node-manager", "manager", "APPROVAL", "销售主管审批", "sales_manager", 260, 120, 2],
    ["approval-node-finance", "finance", "APPROVAL", "财务复核", "finance", 480, 120, 3],
    ["approval-node-end", "end", "END", "通过", "", 700, 120, 4],
  ];

  for (const node of nodes) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO approval_flow_nodes
          (id, flow_id, node_key, node_type, title, assignee_role_code, x, y, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(node[0], "approval-flow-sales", node[1], node[2], node[3], node[4], node[5], node[6], node[7]);
  }

  const edges = [
    ["approval-edge-1", "start", "manager", "超信用额度", 1],
    ["approval-edge-2", "manager", "finance", "主管通过", 2],
    ["approval-edge-3", "finance", "end", "财务通过", 3],
  ];

  for (const edge of edges) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO approval_flow_edges
          (id, flow_id, source_node_key, target_node_key, condition_label, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(edge[0], "approval-flow-sales", edge[1], edge[2], edge[3], edge[4]);
  }

  const numberRules = [
    ["rule-sales-order", "SALES_ORDER", "SO"],
    ["rule-purchase-order", "PURCHASE_ORDER", "PO"],
    ["rule-service-order", "SERVICE_ORDER", "SV"],
    ["rule-warranty-claim", "WARRANTY_CLAIM", "WC"],
  ];

  for (const [id, documentType, prefix] of numberRules) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO document_number_rules
          (id, tenant_id, org_id, document_type, prefix, sequence_length, reset_cycle)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, tenantId, orgId, documentType, prefix, 4, "DAY");
  }

  const parameters = [
    ["param-credit-block", "sales.credit_block_enabled", "true", "BOOLEAN", "销售超信用额度时阻断审核"],
    ["param-warranty-days", "warranty.default_days", "365", "NUMBER", "默认三包周期天数"],
    ["param-maintenance-ratio", "maintenance.advance_ratio", "0.9", "NUMBER", "保养预订单提前触发比例"],
  ];

  for (const parameter of parameters) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO system_parameters
          (id, tenant_id, org_id, param_key, param_value, value_type, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(parameter[0], tenantId, orgId, parameter[1], parameter[2], parameter[3], parameter[4]);
  }

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO custom_reports
        (id, tenant_id, org_id, code, name, report_domain, layout_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "custom-report-service-cost",
      tenantId,
      orgId,
      "CR-SERVICE-COST",
      "售后费用分析",
      "SERVICE",
      '{"rows":["engineer"],"columns":["month"],"metrics":["laborAmount","partsAmount"]}',
    );
}

if (process.env.npm_lifecycle_event === "db:seed") {
  mkdirSync(dirname(databaseUrl), { recursive: true });

  const sqlite = new Database(databaseUrl);
  sqlite.pragma("foreign_keys = ON");
  seedDatabase(sqlite);
  sqlite.close();
}
