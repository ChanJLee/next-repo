ALTER TABLE organizations ADD COLUMN parent_id TEXT REFERENCES organizations(id);
ALTER TABLE organizations ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN org_type TEXT NOT NULL DEFAULT 'DEALER';
ALTER TABLE organizations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_organizations_tree ON organizations (tenant_id, parent_id, level, sort_order);

CREATE TABLE IF NOT EXISTS role_field_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  field_code TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'MASKED',
  PRIMARY KEY (role_id, field_code)
) STRICT;

CREATE TABLE IF NOT EXISTS approval_flows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  condition_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS approval_flow_nodes (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  title TEXT NOT NULL,
  assignee_role_code TEXT NOT NULL DEFAULT '',
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (flow_id, node_key)
) STRICT;

CREATE TABLE IF NOT EXISTS approval_flow_edges (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  source_node_key TEXT NOT NULL,
  target_node_key TEXT NOT NULL,
  condition_label TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS document_number_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  document_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  date_pattern TEXT NOT NULL DEFAULT 'yyyyMMdd',
  sequence_length INTEGER NOT NULL DEFAULT 4,
  reset_cycle TEXT NOT NULL DEFAULT 'DAY',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, org_id, document_type)
) STRICT;

CREATE TABLE IF NOT EXISTS system_parameters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  param_key TEXT NOT NULL,
  param_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'TEXT',
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, org_id, param_key)
) STRICT;

CREATE TABLE IF NOT EXISTS custom_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  report_domain TEXT NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;
