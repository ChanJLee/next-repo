import { randomUUID } from "node:crypto";

import { sqlite } from "@/db";
import { writeAuditLog } from "@/server/audit/service";
import type { SessionPayload } from "@/server/auth/session";
import {
  addMoney,
  addQty,
  compareMoney,
  multiplyMoney,
  subtractMoney,
  subtractQty,
} from "./decimal";
import { all, get, nextCode, run, scope } from "./repository";
import type {
  CustomerInput,
  PartInput,
  PaymentInput,
  PurchaseOrderInput,
  SalesOrderInput,
} from "./schema";

type StatusRow = { status: string };
type InventoryRow = {
  id: string;
  qtyOnHand: string;
  qtyAllocated: string;
  qtyAvailable: string;
  avgCost: string;
};
type PartRow = {
  id: string;
  code: string;
  name: string;
  warrantyType: string;
  refSalesPrice: string;
};
type CustomerCreditRow = {
  creditLimit: string;
  creditUsed: string;
  paymentTermDays: number;
};

function tx<T>(action: () => T) {
  return sqlite.transaction(action)();
}

function ensureTransition(entity: string, current: string, allowed: string[]) {
  if (!allowed.includes(current)) {
    throw new Error(`${entity} 当前状态不允许执行该操作`);
  }
}

function getInventory(session: SessionPayload, partId: string, warehouseId: string) {
  return get<InventoryRow>(
    `SELECT id, qty_on_hand AS qtyOnHand, qty_allocated AS qtyAllocated,
      qty_available AS qtyAvailable, avg_cost AS avgCost
     FROM inventory
     WHERE tenant_id = ? AND part_id = ? AND warehouse_id = ?
     ORDER BY location_id IS NULL, location_id
     LIMIT 1`,
    [session.tenantId, partId, warehouseId],
  );
}

function upsertInventory(input: {
  session: SessionPayload;
  partId: string;
  warehouseId: string;
  qtyOnHand: string;
  qtyAllocated: string;
  avgCost?: string;
}) {
  const available = subtractQty(input.qtyOnHand, input.qtyAllocated);
  const existing = getInventory(input.session, input.partId, input.warehouseId);

  if (existing) {
    run(
      `UPDATE inventory
       SET qty_on_hand = ?, qty_allocated = ?, qty_available = ?,
           avg_cost = COALESCE(?, avg_cost), last_transaction_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        input.qtyOnHand,
        input.qtyAllocated,
        available,
        input.avgCost,
        existing.id,
      ],
    );
    return existing.id;
  }

  const id = randomUUID();
  run(
    `INSERT INTO inventory
      (id, tenant_id, org_id, part_id, warehouse_id, qty_on_hand, qty_allocated, qty_available, avg_cost, last_transaction_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      id,
      input.session.tenantId,
      input.session.orgId,
      input.partId,
      input.warehouseId,
      input.qtyOnHand,
      input.qtyAllocated,
      available,
      input.avgCost ?? "0",
    ],
  );
  return id;
}

function writeStockTransaction(input: {
  session: SessionPayload;
  partId: string;
  warehouseId: string;
  direction: "IN" | "OUT" | "ADJUST";
  transactionType: string;
  qty: string;
  unitCost?: string;
  sourceType: string;
  sourceId: string;
}) {
  run(
    `INSERT INTO stock_transactions
      (id, tenant_id, org_id, part_id, warehouse_id, direction, transaction_type, qty, unit_cost, source_type, source_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.session.tenantId,
      input.session.orgId,
      input.partId,
      input.warehouseId,
      input.direction,
      input.transactionType,
      input.qty,
      input.unitCost ?? "0",
      input.sourceType,
      input.sourceId,
      input.session.userId,
    ],
  );
}

export function listParts(session: SessionPayload, query = "") {
  const params = scope(session);
  if (query.trim()) {
    return all(
      `SELECT p.*, COALESCE(i.qty_on_hand, '0') AS qtyOnHand,
        COALESCE(i.qty_available, '0') AS qtyAvailable
       FROM parts p
       LEFT JOIN inventory i ON i.tenant_id = p.tenant_id AND i.part_id = p.id
       WHERE p.tenant_id = ? AND p.org_id = ?
         AND p.rowid IN (SELECT rowid FROM parts_fts WHERE parts_fts MATCH ?)
       ORDER BY p.updated_at DESC`,
      [...params, `${query.trim()}*`],
    );
  }

  return all(
    `SELECT p.*, COALESCE(i.qty_on_hand, '0') AS qtyOnHand,
      COALESCE(i.qty_available, '0') AS qtyAvailable
     FROM parts p
     LEFT JOIN inventory i ON i.tenant_id = p.tenant_id AND i.part_id = p.id
     WHERE p.tenant_id = ? AND p.org_id = ?
     ORDER BY p.updated_at DESC`,
    params,
  );
}

export function getPartDetail(session: SessionPayload, id: string) {
  const part = get(
    `SELECT * FROM parts WHERE tenant_id = ? AND org_id = ? AND id = ?`,
    [...scope(session), id],
  );
  if (!part) return null;

  return {
    part,
    fitments: all(
      `SELECT m.*
       FROM part_machine_fitments f
       JOIN machine_models m ON m.id = f.machine_model_id
       WHERE f.part_id = ?`,
      [id],
    ),
    substitutes: all(
      `SELECT p.*
       FROM part_substitutes s
       JOIN parts p ON p.id = s.substitute_part_id
       WHERE s.part_id = ?`,
      [id],
    ),
    transactions: all(
      `SELECT st.*, w.name AS warehouseName
       FROM stock_transactions st
       JOIN warehouses w ON w.id = st.warehouse_id
       WHERE st.tenant_id = ? AND st.part_id = ?
       ORDER BY st.occurred_at DESC
       LIMIT 20`,
      [session.tenantId, id],
    ),
  };
}

export function createPart(session: SessionPayload, input: PartInput) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO parts
        (id, tenant_id, org_id, code, name, oem_code, category, brand, warranty_type,
         ref_purchase_price, ref_sales_price, safety_stock, has_serial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        input.code,
        input.name,
        input.oemCode,
        input.category,
        input.brand,
        input.warrantyType,
        input.refPurchasePrice,
        input.refSalesPrice,
        input.safetyStock,
        input.hasSerial,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "parts", entityId: id });
  return id;
}

export function listMachineModels(session: SessionPayload) {
  return all(
    `SELECT * FROM machine_models WHERE tenant_id = ? AND org_id = ? ORDER BY manufacturer, model`,
    scope(session),
  );
}

export function listCustomers(session: SessionPayload, query = "") {
  const params = scope(session);
  if (query.trim()) {
    return all(
      `SELECT * FROM customers
       WHERE tenant_id = ? AND org_id = ?
         AND rowid IN (SELECT rowid FROM customers_fts WHERE customers_fts MATCH ?)
       ORDER BY updated_at DESC`,
      [...params, `${query.trim()}*`],
    );
  }
  return all(
    `SELECT * FROM customers WHERE tenant_id = ? AND org_id = ? ORDER BY updated_at DESC`,
    params,
  );
}

export function getCustomerDetail(session: SessionPayload, id: string) {
  const customer = get(
    `SELECT * FROM customers WHERE tenant_id = ? AND org_id = ? AND id = ?`,
    [...scope(session), id],
  );
  if (!customer) return null;

  return {
    customer,
    machines: all(
      `SELECT cm.*, m.manufacturer, m.model
       FROM customer_machines cm
       JOIN machine_models m ON m.id = cm.machine_model_id
       WHERE cm.customer_id = ?
       ORDER BY cm.created_at DESC`,
      [id],
    ),
    receivables: all(
      `SELECT * FROM receivables WHERE customer_id = ? ORDER BY due_date`,
      [id],
    ),
  };
}

export function createCustomer(session: SessionPayload, input: CustomerInput) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO customers
        (id, tenant_id, org_id, code, name, customer_type, level, contact_name,
         phone, credit_limit, payment_term_days, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        input.code,
        input.name,
        input.customerType,
        input.level,
        input.contactName,
        input.phone,
        input.creditLimit,
        input.paymentTermDays,
        input.address,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "customers", entityId: id });
  return id;
}

export function listCustomerMachines(session: SessionPayload) {
  return all(
    `SELECT cm.*, c.name AS customerName, m.manufacturer, m.model
     FROM customer_machines cm
     JOIN customers c ON c.id = cm.customer_id
     JOIN machine_models m ON m.id = cm.machine_model_id
     WHERE cm.tenant_id = ? AND cm.org_id = ?
     ORDER BY cm.created_at DESC`,
    scope(session),
  );
}

export function listSuppliers(session: SessionPayload) {
  return all(
    `SELECT * FROM suppliers WHERE tenant_id = ? AND org_id = ? ORDER BY code`,
    scope(session),
  );
}

export function listWarehouses(session: SessionPayload) {
  return all(
    `SELECT w.*, COUNT(l.id) AS locationCount
     FROM warehouses w
     LEFT JOIN warehouse_locations l ON l.warehouse_id = w.id
     WHERE w.tenant_id = ? AND w.org_id = ?
     GROUP BY w.id
     ORDER BY w.code`,
    scope(session),
  );
}

export function listSeasonalCalendar(session: SessionPayload) {
  return all(
    `SELECT * FROM seasonal_calendar WHERE tenant_id = ? AND org_id = ? ORDER BY start_date`,
    scope(session),
  );
}

export function listInventory(session: SessionPayload) {
  return all(
    `SELECT i.*, p.code AS partCode, p.name AS partName, p.safety_stock AS safetyStock,
      w.name AS warehouseName
     FROM inventory i
     JOIN parts p ON p.id = i.part_id
     JOIN warehouses w ON w.id = i.warehouse_id
     WHERE i.tenant_id = ? AND i.org_id = ?
     ORDER BY p.code`,
    scope(session),
  );
}

export function listStockTransactions(session: SessionPayload) {
  return all(
    `SELECT st.*, p.code AS partCode, p.name AS partName, w.name AS warehouseName
     FROM stock_transactions st
     JOIN parts p ON p.id = st.part_id
     JOIN warehouses w ON w.id = st.warehouse_id
     WHERE st.tenant_id = ? AND st.org_id = ?
     ORDER BY st.occurred_at DESC
     LIMIT 200`,
    scope(session),
  );
}

export function createStockCount(session: SessionPayload, warehouseId: string) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO stock_counts (id, tenant_id, org_id, code, warehouse_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, session.tenantId, session.orgId, nextCode("SC"), warehouseId],
    );
    const rows = all<{ part_id: string; qty_on_hand: string }>(
      `SELECT part_id, qty_on_hand FROM inventory WHERE tenant_id = ? AND warehouse_id = ?`,
      [session.tenantId, warehouseId],
    );
    for (const row of rows) {
      run(
        `INSERT INTO stock_count_lines
          (id, stock_count_id, part_id, book_qty, counted_qty, difference_qty)
         VALUES (?, ?, ?, ?, ?, '0')`,
        [randomUUID(), id, row.part_id, row.qty_on_hand, row.qty_on_hand],
      );
    }
  });
  writeAuditLog({ session, action: "create", entity: "stock_counts", entityId: id });
  return id;
}

export function listPurchaseOrders(session: SessionPayload) {
  return all(
    `SELECT po.*, s.name AS supplierName, w.name AS warehouseName
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN warehouses w ON w.id = po.warehouse_id
     WHERE po.tenant_id = ? AND po.org_id = ?
     ORDER BY po.created_at DESC`,
    scope(session),
  );
}

export function getPurchaseOrderDetail(session: SessionPayload, id: string) {
  const order = get(
    `SELECT po.*, s.name AS supplierName, w.name AS warehouseName
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN warehouses w ON w.id = po.warehouse_id
     WHERE po.tenant_id = ? AND po.org_id = ? AND po.id = ?`,
    [...scope(session), id],
  );
  if (!order) return null;
  return {
    order,
    lines: all(
      `SELECT l.*, p.code AS partCode, p.name AS partName, p.has_serial AS hasSerial
       FROM purchase_order_lines l
       JOIN parts p ON p.id = l.part_id
       WHERE l.purchase_order_id = ?`,
      [id],
    ),
    receipts: all(
      `SELECT * FROM goods_receipts WHERE purchase_order_id = ? ORDER BY created_at DESC`,
      [id],
    ),
  };
}

export function createPurchaseOrder(
  session: SessionPayload,
  input: PurchaseOrderInput,
) {
  const id = randomUUID();
  const lineId = randomUUID();
  const amount = multiplyMoney(input.unitPrice, input.qty);
  tx(() => {
    run(
      `INSERT INTO purchase_orders
        (id, tenant_id, org_id, code, supplier_id, warehouse_id, total_amount, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("PO"),
        input.supplierId,
        input.warehouseId,
        amount,
        input.note,
      ],
    );
    run(
      `INSERT INTO purchase_order_lines
        (id, purchase_order_id, part_id, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lineId, id, input.partId, input.qty, input.unitPrice, amount],
    );
  });
  writeAuditLog({ session, action: "create", entity: "purchase_orders", entityId: id });
  return id;
}

export function approvePurchaseOrder(session: SessionPayload, id: string) {
  tx(() => {
    const order = get<StatusRow>(
      `SELECT status FROM purchase_orders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!order) throw new Error("采购订单不存在");
    ensureTransition("采购订单", order.status, ["DRAFT", "PENDING"]);
    run(
      `UPDATE purchase_orders SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );
  });
  writeAuditLog({ session, action: "approve", entity: "purchase_orders", entityId: id });
}

export function receivePurchaseOrder(session: SessionPayload, id: string) {
  const receiptId = randomUUID();
  tx(() => {
    const order = get<{ status: string; warehouse_id: string }>(
      `SELECT status, warehouse_id FROM purchase_orders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!order) throw new Error("采购订单不存在");
    ensureTransition("采购订单", order.status, ["APPROVED", "PARTIAL_RECEIVED"]);

    const lines = all<{
      id: string;
      part_id: string;
      qty: string;
      received_qty: string;
      unit_price: string;
    }>(
      `SELECT id, part_id, qty, received_qty, unit_price
       FROM purchase_order_lines WHERE purchase_order_id = ?`,
      [id],
    );

    let totalQty = "0";
    run(
      `INSERT INTO goods_receipts
        (id, tenant_id, org_id, code, purchase_order_id, warehouse_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        receiptId,
        session.tenantId,
        session.orgId,
        nextCode("GR"),
        id,
        order.warehouse_id,
      ],
    );

    for (const line of lines) {
      const remainQty = subtractQty(line.qty, line.received_qty);
      if (Number(remainQty) <= 0) continue;
      totalQty = addQty(totalQty, remainQty);
      run(
        `INSERT INTO goods_receipt_lines
          (id, goods_receipt_id, purchase_order_line_id, part_id, qty, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), receiptId, line.id, line.part_id, remainQty, line.unit_price],
      );
      run(
        `UPDATE purchase_order_lines SET received_qty = qty WHERE id = ?`,
        [line.id],
      );

      const inventory = getInventory(session, line.part_id, order.warehouse_id);
      upsertInventory({
        session,
        partId: line.part_id,
        warehouseId: order.warehouse_id,
        qtyOnHand: addQty(inventory?.qtyOnHand ?? "0", remainQty),
        qtyAllocated: inventory?.qtyAllocated ?? "0",
        avgCost: line.unit_price,
      });
      writeStockTransaction({
        session,
        partId: line.part_id,
        warehouseId: order.warehouse_id,
        direction: "IN",
        transactionType: "PURCHASE_RECEIPT",
        qty: remainQty,
        unitCost: line.unit_price,
        sourceType: "goods_receipts",
        sourceId: receiptId,
      });
    }

    run(`UPDATE goods_receipts SET total_qty = ? WHERE id = ?`, [totalQty, receiptId]);
    run(
      `UPDATE purchase_orders
       SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id],
    );
  });
  writeAuditLog({ session, action: "receive", entity: "purchase_orders", entityId: id });
  return receiptId;
}

export function listSalesOrders(session: SessionPayload) {
  return all(
    `SELECT so.*, c.name AS customerName
     FROM sales_orders so
     JOIN customers c ON c.id = so.customer_id
     WHERE so.tenant_id = ? AND so.org_id = ?
     ORDER BY so.created_at DESC`,
    scope(session),
  );
}

export function getSalesOrderDetail(session: SessionPayload, id: string) {
  const order = get(
    `SELECT so.*, c.name AS customerName
     FROM sales_orders so
     JOIN customers c ON c.id = so.customer_id
     WHERE so.tenant_id = ? AND so.org_id = ? AND so.id = ?`,
    [...scope(session), id],
  );
  if (!order) return null;
  return {
    order,
    lines: all(
      `SELECT l.*, p.code AS partCode, p.name AS partName, p.warranty_type AS warrantyType,
        w.name AS warehouseName
       FROM sales_order_lines l
       JOIN parts p ON p.id = l.part_id
       JOIN warehouses w ON w.id = l.warehouse_id
       WHERE l.sales_order_id = ?`,
      [id],
    ),
    shipments: all(
      `SELECT * FROM sales_shipments WHERE sales_order_id = ? ORDER BY created_at DESC`,
      [id],
    ),
  };
}

export function createSalesOrder(session: SessionPayload, input: SalesOrderInput) {
  const part = get<PartRow>(
    `SELECT id, code, name, warranty_type AS warrantyType, ref_sales_price AS refSalesPrice
     FROM parts WHERE tenant_id = ? AND id = ?`,
    [session.tenantId, input.partId],
  );
  if (!part) throw new Error("配件不存在");
  if (part.warrantyType === "THREE_GUARANTEE" && !input.customerMachineId) {
    throw new Error("三包件销售必须关联客户机器档案");
  }
  if (part.warrantyType === "THREE_GUARANTEE" && !input.warrantySerial) {
    throw new Error("三包件销售必须登记序列号");
  }

  const id = randomUUID();
  const amount = multiplyMoney(input.unitPrice, input.qty);
  tx(() => {
    run(
      `INSERT INTO sales_orders
        (id, tenant_id, org_id, code, customer_id, customer_machine_id, total_amount, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("SO"),
        input.customerId,
        input.customerMachineId || null,
        amount,
        input.note,
      ],
    );
    run(
      `INSERT INTO sales_order_lines
        (id, sales_order_id, part_id, warehouse_id, qty, unit_price, amount, warranty_serial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        input.partId,
        input.warehouseId,
        input.qty,
        input.unitPrice,
        amount,
        input.warrantySerial,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "sales_orders", entityId: id });
  return id;
}

export function approveSalesOrder(session: SessionPayload, id: string) {
  tx(() => {
    const order = get<{
      status: string;
      customer_id: string;
      total_amount: string;
    }>(
      `SELECT status, customer_id, total_amount FROM sales_orders
       WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!order) throw new Error("销售订单不存在");
    ensureTransition("销售订单", order.status, ["DRAFT"]);

    const customer = get<CustomerCreditRow>(
      `SELECT credit_limit AS creditLimit, credit_used AS creditUsed, payment_term_days AS paymentTermDays
       FROM customers WHERE id = ?`,
      [order.customer_id],
    );
    if (!customer) throw new Error("客户不存在");
    if (compareMoney(addMoney(customer.creditUsed, order.total_amount), customer.creditLimit) > 0) {
      throw new Error("客户信用额度不足，无法审核销售订单");
    }

    const lines = all<{
      id: string;
      part_id: string;
      warehouse_id: string;
      qty: string;
    }>(
      `SELECT id, part_id, warehouse_id, qty FROM sales_order_lines WHERE sales_order_id = ?`,
      [id],
    );

    for (const line of lines) {
      const inventory = getInventory(session, line.part_id, line.warehouse_id);
      if (!inventory || Number(inventory.qtyAvailable) < Number(line.qty)) {
        throw new Error("库存可用量不足，无法审核销售订单");
      }
      const nextAllocated = addQty(inventory.qtyAllocated, line.qty);
      upsertInventory({
        session,
        partId: line.part_id,
        warehouseId: line.warehouse_id,
        qtyOnHand: inventory.qtyOnHand,
        qtyAllocated: nextAllocated,
      });
      run(`UPDATE sales_order_lines SET allocated_qty = qty WHERE id = ?`, [line.id]);
    }

    run(
      `UPDATE sales_orders SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );
  });
  writeAuditLog({ session, action: "approve", entity: "sales_orders", entityId: id });
}

export function shipSalesOrder(session: SessionPayload, id: string) {
  const shipmentId = randomUUID();
  tx(() => {
    const order = get<{
      status: string;
      customer_id: string;
      total_amount: string;
    }>(
      `SELECT status, customer_id, total_amount FROM sales_orders
       WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!order) throw new Error("销售订单不存在");
    ensureTransition("销售订单", order.status, ["APPROVED"]);

    const lines = all<{
      id: string;
      part_id: string;
      warehouse_id: string;
      qty: string;
      allocated_qty: string;
      unit_price: string;
    }>(
      `SELECT id, part_id, warehouse_id, qty, allocated_qty, unit_price
       FROM sales_order_lines WHERE sales_order_id = ?`,
      [id],
    );

    let totalQty = "0";
    run(
      `INSERT INTO sales_shipments
        (id, tenant_id, org_id, code, sales_order_id)
       VALUES (?, ?, ?, ?, ?)`,
      [shipmentId, session.tenantId, session.orgId, nextCode("SH"), id],
    );

    for (const line of lines) {
      const inventory = getInventory(session, line.part_id, line.warehouse_id);
      if (!inventory || Number(inventory.qtyAllocated) < Number(line.qty)) {
        throw new Error("预占库存不足，无法出库");
      }
      totalQty = addQty(totalQty, line.qty);
      run(
        `INSERT INTO sales_shipment_lines
          (id, sales_shipment_id, sales_order_line_id, part_id, warehouse_id, qty)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), shipmentId, line.id, line.part_id, line.warehouse_id, line.qty],
      );
      upsertInventory({
        session,
        partId: line.part_id,
        warehouseId: line.warehouse_id,
        qtyOnHand: subtractQty(inventory.qtyOnHand, line.qty),
        qtyAllocated: subtractQty(inventory.qtyAllocated, line.qty),
      });
      writeStockTransaction({
        session,
        partId: line.part_id,
        warehouseId: line.warehouse_id,
        direction: "OUT",
        transactionType: "SALES_SHIPMENT",
        qty: line.qty,
        unitCost: line.unit_price,
        sourceType: "sales_shipments",
        sourceId: shipmentId,
      });
      run(`UPDATE sales_order_lines SET shipped_qty = qty WHERE id = ?`, [line.id]);
    }

    const customer = get<CustomerCreditRow>(
      `SELECT credit_limit AS creditLimit, credit_used AS creditUsed, payment_term_days AS paymentTermDays
       FROM customers WHERE id = ?`,
      [order.customer_id],
    );
    if (!customer) throw new Error("客户不存在");
    const receivableId = randomUUID();
    run(`UPDATE sales_shipments SET total_qty = ? WHERE id = ?`, [totalQty, shipmentId]);
    run(
      `INSERT INTO receivables
        (id, tenant_id, org_id, code, customer_id, source_type, source_id,
         amount, balance_amount, due_date)
       VALUES (?, ?, ?, ?, ?, 'sales_shipments', ?, ?, ?, date('now', ?))`,
      [
        receivableId,
        session.tenantId,
        session.orgId,
        nextCode("AR"),
        order.customer_id,
        shipmentId,
        order.total_amount,
        order.total_amount,
        `+${customer.paymentTermDays} days`,
      ],
    );
    run(
      `UPDATE customers SET credit_used = ? WHERE id = ?`,
      [addMoney(customer.creditUsed, order.total_amount), order.customer_id],
    );
    run(
      `UPDATE sales_orders SET status = 'SHIPPED', shipped_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );
  });
  writeAuditLog({ session, action: "ship", entity: "sales_orders", entityId: id });
  return shipmentId;
}

export function listReceivables(session: SessionPayload) {
  return all(
    `SELECT r.*, c.name AS customerName,
      CASE
        WHEN julianday('now') - julianday(r.due_date) <= 0 THEN '未到期'
        WHEN julianday('now') - julianday(r.due_date) <= 30 THEN '1-30 天'
        WHEN julianday('now') - julianday(r.due_date) <= 60 THEN '31-60 天'
        ELSE '60 天以上'
      END AS ageBucket
     FROM receivables r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.tenant_id = ? AND r.org_id = ?
     ORDER BY r.due_date`,
    scope(session),
  );
}

export function createPayment(session: SessionPayload, input: PaymentInput) {
  const paymentId = randomUUID();
  tx(() => {
    let remainAmount = input.amount;
    run(
      `INSERT INTO payments
        (id, tenant_id, org_id, code, customer_id, amount, payment_method, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        session.tenantId,
        session.orgId,
        nextCode("PAY"),
        input.customerId,
        input.amount,
        input.paymentMethod,
        input.note,
      ],
    );

    const receivables = all<{
      id: string;
      balance_amount: string;
    }>(
      `SELECT id, balance_amount FROM receivables
       WHERE tenant_id = ? AND customer_id = ? AND status <> 'PAID'
       ORDER BY due_date, created_at`,
      [session.tenantId, input.customerId],
    );

    for (const receivable of receivables) {
      if (compareMoney(remainAmount, "0") <= 0) break;
      const allocation =
        compareMoney(remainAmount, receivable.balance_amount) >= 0
          ? receivable.balance_amount
          : remainAmount;
      const nextBalance = subtractMoney(receivable.balance_amount, allocation);
      run(
        `INSERT INTO payment_allocations (id, payment_id, receivable_id, amount)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), paymentId, receivable.id, allocation],
      );
      run(
        `UPDATE receivables
         SET paid_amount = amount - ?, balance_amount = ?, status = ?
         WHERE id = ?`,
        [
          nextBalance,
          nextBalance,
          compareMoney(nextBalance, "0") === 0 ? "PAID" : "PARTIAL",
          receivable.id,
        ],
      );
      remainAmount = subtractMoney(remainAmount, allocation);
    }

    const customer = get<{ credit_used: string }>(
      `SELECT credit_used FROM customers WHERE id = ?`,
      [input.customerId],
    );
    if (customer) {
      run(`UPDATE customers SET credit_used = ? WHERE id = ?`, [
        subtractMoney(customer.credit_used, subtractMoney(input.amount, remainAmount)),
        input.customerId,
      ]);
    }
  });
  writeAuditLog({ session, action: "create", entity: "payments", entityId: paymentId });
  return paymentId;
}

export function getDashboardMetrics(session: SessionPayload) {
  const [tenantId, orgId] = scope(session);
  const sales = get<{ total: string }>(
    `SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) AS total
     FROM sales_orders
     WHERE tenant_id = ? AND org_id = ? AND status = 'SHIPPED'`,
    [tenantId, orgId],
  );
  const inventory = get<{ total: string }>(
    `SELECT COALESCE(SUM(CAST(i.qty_on_hand AS REAL) * CAST(i.avg_cost AS REAL)), 0) AS total
     FROM inventory i
     WHERE i.tenant_id = ? AND i.org_id = ?`,
    [tenantId, orgId],
  );
  const receivable = get<{ total: string }>(
    `SELECT COALESCE(SUM(CAST(balance_amount AS REAL)), 0) AS total
     FROM receivables
     WHERE tenant_id = ? AND org_id = ? AND status <> 'PAID'`,
    [tenantId, orgId],
  );
  const pendingShip = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sales_orders
     WHERE tenant_id = ? AND org_id = ? AND status = 'APPROVED'`,
    [tenantId, orgId],
  );

  return {
    salesAmount: Number(sales?.total ?? 0).toFixed(2),
    inventoryValue: Number(inventory?.total ?? 0).toFixed(2),
    receivableAmount: Number(receivable?.total ?? 0).toFixed(2),
    pendingShipments: pendingShip?.count ?? 0,
  };
}

export function exportRows(session: SessionPayload, kind: string) {
  switch (kind) {
    case "parts":
      return {
        filename: "parts.csv",
        headers: ["编码", "名称", "厂家件号", "库存", "可用量"],
        rows: listParts(session).map((row) => [
          row.code,
          row.name,
          row.oem_code,
          row.qtyOnHand,
          row.qtyAvailable,
        ]),
      };
    case "customers":
      return {
        filename: "customers.csv",
        headers: ["编码", "名称", "联系人", "电话", "信用额度"],
        rows: listCustomers(session).map((row) => [
          row.code,
          row.name,
          row.contact_name,
          row.phone,
          row.credit_limit,
        ]),
      };
    case "inventory":
      return {
        filename: "inventory.csv",
        headers: ["配件编码", "配件名称", "仓库", "现存", "可用"],
        rows: listInventory(session).map((row) => [
          row.partCode,
          row.partName,
          row.warehouseName,
          row.qty_on_hand,
          row.qty_available,
        ]),
      };
    default:
      throw new Error("不支持的导出类型");
  }
}
