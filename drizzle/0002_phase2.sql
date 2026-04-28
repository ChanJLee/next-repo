CREATE TABLE IF NOT EXISTS service_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_machine_id TEXT REFERENCES customer_machines(id),
  source_channel TEXT NOT NULL DEFAULT 'PHONE',
  status TEXT NOT NULL DEFAULT 'REPORTED',
  fault_description TEXT NOT NULL,
  fault_code TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'NORMAL',
  expected_at TEXT,
  current_hours TEXT NOT NULL DEFAULT '0',
  current_acres TEXT NOT NULL DEFAULT '0',
  latitude TEXT NOT NULL DEFAULT '',
  longitude TEXT NOT NULL DEFAULT '',
  assigned_engineer_name TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  customer_signature TEXT NOT NULL DEFAULT '',
  resolution_note TEXT NOT NULL DEFAULT '',
  labor_amount TEXT NOT NULL DEFAULT '0',
  parts_amount TEXT NOT NULL DEFAULT '0',
  total_amount TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TEXT,
  accepted_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  closed_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS service_order_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  service_order_id TEXT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS maintenance_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  machine_model_id TEXT NOT NULL REFERENCES machine_models(id),
  name TEXT NOT NULL,
  threshold_hours INTEGER NOT NULL,
  advance_ratio TEXT NOT NULL DEFAULT '0.9',
  part_package_json TEXT NOT NULL DEFAULT '[]',
  labor_hours TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS maintenance_preorders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  maintenance_template_id TEXT NOT NULL REFERENCES maintenance_templates(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_machine_id TEXT NOT NULL REFERENCES customer_machines(id),
  status TEXT NOT NULL DEFAULT 'GENERATED',
  trigger_hours TEXT NOT NULL DEFAULT '0',
  quote_amount TEXT NOT NULL DEFAULT '0',
  expected_service_date TEXT,
  service_order_id TEXT REFERENCES service_orders(id),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  converted_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS warranty_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  service_order_id TEXT NOT NULL REFERENCES service_orders(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_machine_id TEXT NOT NULL REFERENCES customer_machines(id),
  failed_part_id TEXT NOT NULL REFERENCES parts(id),
  failed_serial TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  fault_description TEXT NOT NULL,
  claim_amount TEXT NOT NULL DEFAULT '0',
  material_complete INTEGER NOT NULL DEFAULT 0,
  failure_photo TEXT NOT NULL DEFAULT '',
  nameplate_photo TEXT NOT NULL DEFAULT '',
  repair_order_file TEXT NOT NULL DEFAULT '',
  customer_signature_file TEXT NOT NULL DEFAULT '',
  purchase_proof_file TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  approved_at TEXT,
  settled_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS warranty_claim_timeline (
  id TEXT PRIMARY KEY,
  warranty_claim_id TEXT NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  node TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS warranty_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  warranty_claim_id TEXT NOT NULL REFERENCES warranty_claims(id),
  logistics_company TEXT NOT NULL DEFAULT '',
  tracking_no TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  shipped_at TEXT,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS stocking_suggestions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  season TEXT NOT NULL,
  current_qty TEXT NOT NULL DEFAULT '0',
  safety_stock INTEGER NOT NULL DEFAULT 0,
  season_factor TEXT NOT NULL DEFAULT '1',
  suggested_qty TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'OPEN',
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, part_id, warehouse_id, season)
) STRICT;

CREATE TABLE IF NOT EXISTS subsidy_ledgers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  sales_order_id TEXT REFERENCES sales_orders(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_machine_id TEXT REFERENCES customer_machines(id),
  policy_type TEXT NOT NULL DEFAULT 'PURCHASE',
  subsidy_amount TEXT NOT NULL DEFAULT '0',
  subsidy_ratio TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  customer_id_no TEXT NOT NULL DEFAULT '',
  machine_serial TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  application_file TEXT NOT NULL DEFAULT '',
  material_complete INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  approved_at TEXT,
  paid_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;
