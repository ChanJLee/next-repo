CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  supplier_type TEXT NOT NULL DEFAULT 'TRADER',
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  payment_term_days INTEGER NOT NULL DEFAULT 0,
  score_quality TEXT NOT NULL DEFAULT '5.0',
  score_price TEXT NOT NULL DEFAULT '5.0',
  score_delivery TEXT NOT NULL DEFAULT '5.0',
  score_service TEXT NOT NULL DEFAULT '5.0',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SELF',
  address TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  code TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT '',
  aisle TEXT NOT NULL DEFAULT '',
  rack TEXT NOT NULL DEFAULT '',
  shelf TEXT NOT NULL DEFAULT '',
  bin TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (warehouse_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS machine_models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER',
  series TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  engine_model TEXT NOT NULL DEFAULT '',
  power_hp TEXT NOT NULL DEFAULT '0',
  working_width TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'FARMER',
  level TEXT NOT NULL DEFAULT 'NORMAL',
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  credit_limit TEXT NOT NULL DEFAULT '0',
  credit_used TEXT NOT NULL DEFAULT '0',
  payment_term_days INTEGER NOT NULL DEFAULT 0,
  province TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  county TEXT NOT NULL DEFAULT '',
  town TEXT NOT NULL DEFAULT '',
  village TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS customer_machines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  machine_model_id TEXT NOT NULL REFERENCES machine_models(id),
  factory_serial TEXT NOT NULL,
  engine_serial TEXT NOT NULL DEFAULT '',
  manufacture_date TEXT,
  purchase_date TEXT NOT NULL,
  purchase_source TEXT NOT NULL DEFAULT 'LOCAL',
  whole_warranty_until TEXT NOT NULL,
  key_part_warranty_until TEXT NOT NULL,
  current_hours TEXT NOT NULL DEFAULT '0',
  current_acres TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'IN_USE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, factory_serial)
) STRICT;

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  oem_code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  part_type TEXT NOT NULL DEFAULT 'OEM',
  warranty_type TEXT NOT NULL DEFAULT 'NORMAL',
  warranty_months INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '个',
  default_warehouse_id TEXT REFERENCES warehouses(id),
  default_supplier_id TEXT REFERENCES suppliers(id),
  ref_purchase_price TEXT NOT NULL DEFAULT '0',
  ref_sales_price TEXT NOT NULL DEFAULT '0',
  safety_stock INTEGER NOT NULL DEFAULT 0,
  max_stock INTEGER NOT NULL DEFAULT 0,
  seasonal_factor TEXT NOT NULL DEFAULT '{}',
  has_batch INTEGER NOT NULL DEFAULT 0,
  has_serial INTEGER NOT NULL DEFAULT 0,
  shelf_life_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_parts_tenant_name ON parts (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_parts_tenant_oem ON parts (tenant_id, oem_code);

CREATE TABLE IF NOT EXISTS part_substitutes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  substitute_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'BOTH',
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (part_id, substitute_part_id)
) STRICT;

CREATE TABLE IF NOT EXISTS part_machine_fitments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  machine_model_id TEXT NOT NULL REFERENCES machine_models(id) ON DELETE CASCADE,
  year_from INTEGER,
  year_to INTEGER,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (part_id, machine_model_id)
) STRICT;

CREATE TABLE IF NOT EXISTS seasonal_calendar (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  region_code TEXT NOT NULL,
  season TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  factor_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (tenant_id, region_code, season, start_date)
) STRICT;

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  location_id TEXT REFERENCES warehouse_locations(id),
  qty_on_hand TEXT NOT NULL DEFAULT '0',
  qty_allocated TEXT NOT NULL DEFAULT '0',
  qty_available TEXT NOT NULL DEFAULT '0',
  avg_cost TEXT NOT NULL DEFAULT '0',
  last_transaction_at TEXT,
  UNIQUE (tenant_id, part_id, warehouse_id, location_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_part ON inventory (tenant_id, part_id);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  location_id TEXT REFERENCES warehouse_locations(id),
  direction TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  qty TEXT NOT NULL,
  unit_cost TEXT NOT NULL DEFAULT '0',
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_time ON stock_transactions (tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id TEXT PRIMARY KEY,
  stock_count_id TEXT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL REFERENCES parts(id),
  book_qty TEXT NOT NULL DEFAULT '0',
  counted_qty TEXT NOT NULL DEFAULT '0',
  difference_qty TEXT NOT NULL DEFAULT '0',
  UNIQUE (stock_count_id, part_id)
) STRICT;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_amount TEXT NOT NULL DEFAULT '0',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  received_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL REFERENCES parts(id),
  qty TEXT NOT NULL,
  received_qty TEXT NOT NULL DEFAULT '0',
  unit_price TEXT NOT NULL,
  amount TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'POSTED',
  total_qty TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id TEXT PRIMARY KEY,
  goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  qty TEXT NOT NULL,
  unit_cost TEXT NOT NULL DEFAULT '0',
  serial_numbers TEXT NOT NULL DEFAULT '[]'
) STRICT;

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_amount TEXT NOT NULL DEFAULT '0',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_machine_id TEXT REFERENCES customer_machines(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_amount TEXT NOT NULL DEFAULT '0',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  shipped_at TEXT,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL REFERENCES parts(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  qty TEXT NOT NULL,
  allocated_qty TEXT NOT NULL DEFAULT '0',
  shipped_qty TEXT NOT NULL DEFAULT '0',
  unit_price TEXT NOT NULL,
  amount TEXT NOT NULL,
  warranty_serial TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE IF NOT EXISTS sales_shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  status TEXT NOT NULL DEFAULT 'POSTED',
  total_qty TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS sales_shipment_lines (
  id TEXT PRIMARY KEY,
  sales_shipment_id TEXT NOT NULL REFERENCES sales_shipments(id) ON DELETE CASCADE,
  sales_order_line_id TEXT NOT NULL REFERENCES sales_order_lines(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  qty TEXT NOT NULL,
  serial_numbers TEXT NOT NULL DEFAULT '[]'
) STRICT;

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  paid_amount TEXT NOT NULL DEFAULT '0',
  balance_amount TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'BANK',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
) STRICT;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  receivable_id TEXT NOT NULL REFERENCES receivables(id),
  amount TEXT NOT NULL
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS parts_fts USING fts5(
  code,
  name,
  oem_code,
  content='parts',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
  code,
  name,
  phone,
  content='customers',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS parts_ai AFTER INSERT ON parts BEGIN
  INSERT INTO parts_fts(rowid, code, name, oem_code)
  VALUES (new.rowid, new.code, new.name, new.oem_code);
END;

CREATE TRIGGER IF NOT EXISTS parts_au AFTER UPDATE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, code, name, oem_code)
  VALUES ('delete', old.rowid, old.code, old.name, old.oem_code);
  INSERT INTO parts_fts(rowid, code, name, oem_code)
  VALUES (new.rowid, new.code, new.name, new.oem_code);
END;

CREATE TRIGGER IF NOT EXISTS parts_ad AFTER DELETE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, code, name, oem_code)
  VALUES ('delete', old.rowid, old.code, old.name, old.oem_code);
END;

CREATE TRIGGER IF NOT EXISTS customers_ai AFTER INSERT ON customers BEGIN
  INSERT INTO customers_fts(rowid, code, name, phone)
  VALUES (new.rowid, new.code, new.name, new.phone);
END;

CREATE TRIGGER IF NOT EXISTS customers_au AFTER UPDATE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, code, name, phone)
  VALUES ('delete', old.rowid, old.code, old.name, old.phone);
  INSERT INTO customers_fts(rowid, code, name, phone)
  VALUES (new.rowid, new.code, new.name, new.phone);
END;

CREATE TRIGGER IF NOT EXISTS customers_ad AFTER DELETE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, code, name, phone)
  VALUES ('delete', old.rowid, old.code, old.name, old.phone);
END;
