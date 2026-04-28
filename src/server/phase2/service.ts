import { randomUUID } from "node:crypto";

import { sqlite } from "@/db";
import { writeAuditLog } from "@/server/audit/service";
import type { SessionPayload } from "@/server/auth/session";
import { applyFieldAccess, getFieldAccessMap } from "@/server/permissions";
import { addMoney, multiplyMoney } from "@/server/phase1/decimal";
import { all, get, nextCode, run, scope } from "@/server/phase1/repository";
import type {
  CompleteServiceOrderInput,
  DispatchServiceOrderInput,
  MaintenancePreorderInput,
  MaintenanceTemplateInput,
  ServiceOrderInput,
  SubsidyLedgerInput,
  WarrantyClaimInput,
} from "./schema";

type StatusRow = { status: string };
type CustomerMachineRow = {
  id: string;
  customer_id: string;
  current_hours: string;
  current_acres: string;
  factory_serial: string;
};

function tx<T>(action: () => T) {
  return sqlite.transaction(action)();
}

function ensureTransition(entity: string, current: string, allowed: string[]) {
  if (!allowed.includes(current)) {
    throw new Error(`${entity} 当前状态不允许执行该操作`);
  }
}

function writeServiceEvent(input: {
  session: SessionPayload;
  serviceOrderId: string;
  eventType: string;
  title: string;
  description?: string;
}) {
  run(
    `INSERT INTO service_order_events
      (id, tenant_id, org_id, service_order_id, event_type, title, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.session.tenantId,
      input.session.orgId,
      input.serviceOrderId,
      input.eventType,
      input.title,
      input.description ?? "",
      input.session.userId,
    ],
  );
}

function materialComplete(input: WarrantyClaimInput | SubsidyLedgerInput) {
  if ("failurePhoto" in input) {
    return Number(Boolean(
      input.failurePhoto &&
        input.nameplatePhoto &&
        input.repairOrderFile &&
        input.customerSignatureFile &&
        input.purchaseProofFile,
    ));
  }

  return Number(Boolean(
    input.customerIdNo &&
      input.machineSerial &&
      input.bankAccount &&
      input.applicationFile,
  ));
}

export function listServiceOrders(session: SessionPayload) {
  return all(
    `SELECT so.*, c.name AS customerName, cm.factory_serial AS factorySerial
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN customer_machines cm ON cm.id = so.customer_machine_id
     WHERE so.tenant_id = ? AND so.org_id = ?
     ORDER BY so.created_at DESC`,
    scope(session),
  );
}

export function getServiceOrderDetail(session: SessionPayload, id: string) {
  const order = get(
    `SELECT so.*, c.name AS customerName, cm.factory_serial AS factorySerial,
      mm.manufacturer, mm.model
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN customer_machines cm ON cm.id = so.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = cm.machine_model_id
     WHERE so.tenant_id = ? AND so.org_id = ? AND so.id = ?`,
    [...scope(session), id],
  );
  if (!order) return null;

  return {
    order,
    events: all(
      `SELECT * FROM service_order_events
       WHERE service_order_id = ?
       ORDER BY created_at`,
      [id],
    ),
    claims: all(
      `SELECT wc.*, p.code AS partCode, p.name AS partName
       FROM warranty_claims wc
       JOIN parts p ON p.id = wc.failed_part_id
       WHERE wc.service_order_id = ?
       ORDER BY wc.created_at DESC`,
      [id],
    ),
  };
}

export function createServiceOrder(session: SessionPayload, input: ServiceOrderInput) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO service_orders
        (id, tenant_id, org_id, code, customer_id, customer_machine_id, source_channel,
         fault_description, fault_code, urgency, expected_at, current_hours, current_acres,
         latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("SV"),
        input.customerId,
        input.customerMachineId || null,
        input.sourceChannel,
        input.faultDescription,
        input.faultCode,
        input.urgency,
        input.expectedAt || null,
        input.currentHours,
        input.currentAcres,
        input.latitude,
        input.longitude,
      ],
    );
    writeServiceEvent({
      session,
      serviceOrderId: id,
      eventType: "CREATE",
      title: "报修录入",
      description: input.faultDescription,
    });
  });
  writeAuditLog({ session, action: "create", entity: "service_orders", entityId: id });
  return id;
}

export function dispatchServiceOrder(
  session: SessionPayload,
  input: DispatchServiceOrderInput,
) {
  tx(() => {
    const order = get<StatusRow>(
      `SELECT status FROM service_orders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), input.id],
    );
    if (!order) throw new Error("服务工单不存在");
    ensureTransition("服务工单", order.status, ["REPORTED"]);
    run(
      `UPDATE service_orders
       SET status = 'DISPATCHED', assigned_engineer_name = ?, dispatched_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.engineerName, input.id],
    );
    writeServiceEvent({
      session,
      serviceOrderId: input.id,
      eventType: "DISPATCH",
      title: "已派单",
      description: `派给 ${input.engineerName}`,
    });
  });
  writeAuditLog({ session, action: "dispatch", entity: "service_orders", entityId: input.id });
}

export function advanceServiceOrder(session: SessionPayload, id: string, action: "accept" | "start") {
  tx(() => {
    const order = get<StatusRow>(
      `SELECT status FROM service_orders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!order) throw new Error("服务工单不存在");

    if (action === "accept") {
      ensureTransition("服务工单", order.status, ["DISPATCHED"]);
      run(
        `UPDATE service_orders SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
      );
      writeServiceEvent({ session, serviceOrderId: id, eventType: "ACCEPT", title: "工程师接单" });
      return;
    }

    ensureTransition("服务工单", order.status, ["ACCEPTED"]);
    run(
      `UPDATE service_orders SET status = 'IN_SERVICE', started_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );
    writeServiceEvent({ session, serviceOrderId: id, eventType: "START", title: "开始上门服务" });
  });
  writeAuditLog({ session, action, entity: "service_orders", entityId: id });
}

export function completeServiceOrder(
  session: SessionPayload,
  input: CompleteServiceOrderInput,
) {
  tx(() => {
    const order = get<{
      status: string;
      customer_id: string;
      customer_machine_id: string | null;
      fault_description: string;
    }>(
      `SELECT status, customer_id, customer_machine_id, fault_description
       FROM service_orders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), input.id],
    );
    if (!order) throw new Error("服务工单不存在");
    ensureTransition("服务工单", order.status, ["IN_SERVICE"]);

    const totalAmount = addMoney(input.laborAmount, input.partsAmount);
    run(
      `UPDATE service_orders
       SET status = 'COMPLETED', resolution_note = ?, customer_signature = ?,
           photos_json = ?, current_hours = ?, current_acres = ?, labor_amount = ?,
           parts_amount = ?, total_amount = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        input.resolutionNote,
        input.customerSignature,
        input.photosJson || "[]",
        input.currentHours,
        input.currentAcres,
        input.laborAmount,
        input.partsAmount,
        totalAmount,
        input.id,
      ],
    );

    if (order.customer_machine_id) {
      run(
        `UPDATE customer_machines
         SET current_hours = ?, current_acres = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.currentHours, input.currentAcres, order.customer_machine_id],
      );
    }

    if (Number(totalAmount) > 0) {
      run(
        `INSERT INTO receivables
          (id, tenant_id, org_id, code, customer_id, source_type, source_id,
           amount, balance_amount, due_date)
         VALUES (?, ?, ?, ?, ?, 'service_orders', ?, ?, ?, date('now', '+15 days'))`,
        [
          randomUUID(),
          session.tenantId,
          session.orgId,
          nextCode("AR"),
          order.customer_id,
          input.id,
          totalAmount,
          totalAmount,
        ],
      );
    }

    if (order.customer_machine_id && input.warrantyPartId && input.warrantySerial) {
      const claimId = createWarrantyClaimInsideTransaction(session, {
        serviceOrderId: input.id,
        customerMachineId: order.customer_machine_id,
        failedPartId: input.warrantyPartId,
        failedSerial: input.warrantySerial,
        faultDescription: order.fault_description,
        claimAmount: totalAmount,
        failurePhoto: "",
        nameplatePhoto: "",
        repairOrderFile: "",
        customerSignatureFile: input.customerSignature,
        purchaseProofFile: "",
      });
      writeServiceEvent({
        session,
        serviceOrderId: input.id,
        eventType: "WARRANTY",
        title: "自动生成三包索赔",
        description: claimId,
      });
    }

    writeServiceEvent({
      session,
      serviceOrderId: input.id,
      eventType: "COMPLETE",
      title: "服务完成",
      description: input.resolutionNote,
    });
  });
  writeAuditLog({ session, action: "complete", entity: "service_orders", entityId: input.id });
}

export function listMaintenanceTemplates(session: SessionPayload) {
  return all(
    `SELECT mt.*, mm.manufacturer, mm.model
     FROM maintenance_templates mt
     JOIN machine_models mm ON mm.id = mt.machine_model_id
     WHERE mt.tenant_id = ? AND mt.org_id = ?
     ORDER BY mt.threshold_hours`,
    scope(session),
  );
}

export function createMaintenanceTemplate(
  session: SessionPayload,
  input: MaintenanceTemplateInput,
) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO maintenance_templates
        (id, tenant_id, org_id, code, machine_model_id, name, threshold_hours,
         advance_ratio, part_package_json, labor_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("MT"),
        input.machineModelId,
        input.name,
        input.thresholdHours,
        input.advanceRatio,
        input.partPackageJson,
        input.laborHours,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "maintenance_templates", entityId: id });
  return id;
}

export function listMaintenancePreorders(session: SessionPayload) {
  return all(
    `SELECT mp.*, mt.name AS templateName, c.name AS customerName,
      cm.factory_serial AS factorySerial, mm.model
     FROM maintenance_preorders mp
     JOIN maintenance_templates mt ON mt.id = mp.maintenance_template_id
     JOIN customers c ON c.id = mp.customer_id
     JOIN customer_machines cm ON cm.id = mp.customer_machine_id
     JOIN machine_models mm ON mm.id = cm.machine_model_id
     WHERE mp.tenant_id = ? AND mp.org_id = ?
     ORDER BY mp.created_at DESC`,
    scope(session),
  );
}

export function createMaintenancePreorder(
  session: SessionPayload,
  input: MaintenancePreorderInput,
) {
  const machine = get<CustomerMachineRow>(
    `SELECT id, customer_id, current_hours, current_acres, factory_serial
     FROM customer_machines WHERE tenant_id = ? AND org_id = ? AND id = ?`,
    [...scope(session), input.customerMachineId],
  );
  if (!machine) throw new Error("客户机器不存在");

  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO maintenance_preorders
        (id, tenant_id, org_id, code, maintenance_template_id, customer_id,
         customer_machine_id, trigger_hours, quote_amount, expected_service_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("MP"),
        input.maintenanceTemplateId,
        machine.customer_id,
        input.customerMachineId,
        machine.current_hours,
        input.quoteAmount,
        input.expectedServiceDate || null,
        input.note,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "maintenance_preorders", entityId: id });
  return id;
}

export function confirmMaintenancePreorder(session: SessionPayload, id: string) {
  tx(() => {
    const preorder = get<StatusRow>(
      `SELECT status FROM maintenance_preorders WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!preorder) throw new Error("保养预订单不存在");
    ensureTransition("保养预订单", preorder.status, ["GENERATED"]);
    run(
      `UPDATE maintenance_preorders
       SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id],
    );
  });
  writeAuditLog({ session, action: "confirm", entity: "maintenance_preorders", entityId: id });
}

export function convertMaintenancePreorderToService(session: SessionPayload, id: string) {
  let serviceOrderId = "";
  tx(() => {
    const preorder = get<{
      status: string;
      customer_id: string;
      customer_machine_id: string;
      trigger_hours: string;
      expected_service_date: string | null;
      templateName: string;
    }>(
      `SELECT mp.status, mp.customer_id, mp.customer_machine_id, mp.trigger_hours,
        mp.expected_service_date, mt.name AS templateName
       FROM maintenance_preorders mp
       JOIN maintenance_templates mt ON mt.id = mp.maintenance_template_id
       WHERE mp.tenant_id = ? AND mp.org_id = ? AND mp.id = ?`,
      [...scope(session), id],
    );
    if (!preorder) throw new Error("保养预订单不存在");
    ensureTransition("保养预订单", preorder.status, ["CONFIRMED"]);

    serviceOrderId = createServiceOrder(session, {
      customerId: preorder.customer_id,
      customerMachineId: preorder.customer_machine_id,
      sourceChannel: "MAINTENANCE",
      faultDescription: `保养计划转工单：${preorder.templateName}`,
      faultCode: "MAINTENANCE",
      urgency: "NORMAL",
      expectedAt: preorder.expected_service_date ?? undefined,
      currentHours: preorder.trigger_hours,
      currentAcres: "0",
      latitude: "",
      longitude: "",
    });
    run(
      `UPDATE maintenance_preorders
       SET status = 'CONVERTED', service_order_id = ?, converted_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [serviceOrderId, id],
    );
  });
  writeAuditLog({ session, action: "convert", entity: "maintenance_preorders", entityId: id });
  return serviceOrderId;
}

function createWarrantyClaimInsideTransaction(
  session: SessionPayload,
  input: WarrantyClaimInput,
) {
  const machine = get<CustomerMachineRow>(
    `SELECT id, customer_id, current_hours, current_acres, factory_serial
     FROM customer_machines WHERE tenant_id = ? AND org_id = ? AND id = ?`,
    [...scope(session), input.customerMachineId],
  );
  if (!machine) throw new Error("客户机器不存在");

  const id = randomUUID();
  run(
    `INSERT INTO warranty_claims
      (id, tenant_id, org_id, code, service_order_id, customer_id, customer_machine_id,
       failed_part_id, failed_serial, fault_description, claim_amount, material_complete,
       failure_photo, nameplate_photo, repair_order_file, customer_signature_file, purchase_proof_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      session.tenantId,
      session.orgId,
      nextCode("WC"),
      input.serviceOrderId,
      machine.customer_id,
      input.customerMachineId,
      input.failedPartId,
      input.failedSerial,
      input.faultDescription,
      input.claimAmount,
      materialComplete(input),
      input.failurePhoto,
      input.nameplatePhoto,
      input.repairOrderFile,
      input.customerSignatureFile,
      input.purchaseProofFile,
    ],
  );
  run(
    `INSERT INTO warranty_claim_timeline
      (id, warranty_claim_id, node, status, description)
     VALUES (?, ?, 'AFTER_SALES_MANAGER', 'PENDING', '售后主管待初审')`,
    [randomUUID(), id],
  );
  return id;
}

export function listWarrantyClaims(session: SessionPayload) {
  return all(
    `SELECT wc.*, c.name AS customerName, cm.factory_serial AS factorySerial,
      p.code AS partCode, p.name AS partName
     FROM warranty_claims wc
     JOIN customers c ON c.id = wc.customer_id
     JOIN customer_machines cm ON cm.id = wc.customer_machine_id
     JOIN parts p ON p.id = wc.failed_part_id
     WHERE wc.tenant_id = ? AND wc.org_id = ?
     ORDER BY wc.created_at DESC`,
    scope(session),
  );
}

export function createWarrantyClaim(session: SessionPayload, input: WarrantyClaimInput) {
  let id = "";
  tx(() => {
    id = createWarrantyClaimInsideTransaction(session, input);
  });
  writeAuditLog({ session, action: "create", entity: "warranty_claims", entityId: id });
  return id;
}

export function advanceWarrantyClaim(session: SessionPayload, id: string) {
  tx(() => {
    const claim = get<StatusRow>(
      `SELECT status FROM warranty_claims WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!claim) throw new Error("三包索赔单不存在");

    const nextStatus: Record<string, string> = {
      DRAFT: "REGION_REVIEW",
      REGION_REVIEW: "OEM_REVIEW",
      OEM_REVIEW: "APPROVED",
      APPROVED: "SETTLED",
    };
    const next = nextStatus[claim.status];
    if (!next) throw new Error("三包索赔单当前状态不允许推进");

    run(
      `UPDATE warranty_claims
       SET status = ?,
           submitted_at = CASE WHEN ? = 'REGION_REVIEW' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
           approved_at = CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END,
           settled_at = CASE WHEN ? = 'SETTLED' THEN CURRENT_TIMESTAMP ELSE settled_at END
       WHERE id = ?`,
      [next, next, next, next, id],
    );
    run(
      `INSERT INTO warranty_claim_timeline
        (id, warranty_claim_id, node, status, description)
       VALUES (?, ?, ?, 'DONE', ?)`,
      [randomUUID(), id, next, `状态推进到 ${next}`],
    );

    if (next === "APPROVED") {
      run(
        `INSERT INTO warranty_returns
          (id, tenant_id, org_id, code, warranty_claim_id)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), session.tenantId, session.orgId, nextCode("WR"), id],
      );
    }
  });
  writeAuditLog({ session, action: "advance", entity: "warranty_claims", entityId: id });
}

export function listStockingSuggestions(session: SessionPayload) {
  return all(
    `SELECT ss.*, p.code AS partCode, p.name AS partName, p.ref_purchase_price AS refPurchasePrice,
      p.default_supplier_id AS defaultSupplierId, w.name AS warehouseName, po.code AS purchaseOrderCode
     FROM stocking_suggestions ss
     JOIN parts p ON p.id = ss.part_id
     JOIN warehouses w ON w.id = ss.warehouse_id
     LEFT JOIN purchase_orders po ON po.id = ss.purchase_order_id
     WHERE ss.tenant_id = ? AND ss.org_id = ?
     ORDER BY CAST(ss.suggested_qty AS REAL) DESC`,
    scope(session),
  );
}

export function regenerateStockingSuggestions(session: SessionPayload, season = "SPRING") {
  tx(() => {
    const rows = all<{
      part_id: string;
      warehouse_id: string;
      qty_available: string;
      safety_stock: number;
      seasonal_factor: string;
    }>(
      `SELECT i.part_id, i.warehouse_id, i.qty_available, p.safety_stock, p.seasonal_factor
       FROM inventory i
       JOIN parts p ON p.id = i.part_id
       WHERE i.tenant_id = ? AND i.org_id = ?`,
      scope(session),
    );

    for (const row of rows) {
      const factorMap = JSON.parse(row.seasonal_factor || "{}") as Record<string, number>;
      const factor = factorMap[season.toLowerCase()] ?? 1;
      const targetQty = Math.ceil(row.safety_stock * factor);
      const suggestedQty = Math.max(targetQty - Number(row.qty_available), 0);
      run(
        `INSERT INTO stocking_suggestions
          (id, tenant_id, org_id, part_id, warehouse_id, season, current_qty,
           safety_stock, season_factor, suggested_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, part_id, warehouse_id, season) DO UPDATE SET
           current_qty = excluded.current_qty,
           safety_stock = excluded.safety_stock,
           season_factor = excluded.season_factor,
           suggested_qty = excluded.suggested_qty,
           status = CASE WHEN stocking_suggestions.status = 'CONVERTED' THEN 'CONVERTED' ELSE 'OPEN' END`,
        [
          randomUUID(),
          session.tenantId,
          session.orgId,
          row.part_id,
          row.warehouse_id,
          season,
          row.qty_available,
          row.safety_stock,
          String(factor),
          String(suggestedQty),
        ],
      );
    }
  });
  writeAuditLog({ session, action: "regenerate", entity: "stocking_suggestions", entityId: season });
}

export function convertStockingSuggestionToPurchase(session: SessionPayload, id: string) {
  let purchaseOrderId = "";
  tx(() => {
    const row = get<{
      status: string;
      part_id: string;
      warehouse_id: string;
      suggested_qty: string;
      defaultSupplierId: string | null;
      refPurchasePrice: string;
    }>(
      `SELECT ss.status, ss.part_id, ss.warehouse_id, ss.suggested_qty,
        p.default_supplier_id AS defaultSupplierId, p.ref_purchase_price AS refPurchasePrice
       FROM stocking_suggestions ss
       JOIN parts p ON p.id = ss.part_id
       WHERE ss.tenant_id = ? AND ss.org_id = ? AND ss.id = ?`,
      [...scope(session), id],
    );
    if (!row) throw new Error("备货建议不存在");
    ensureTransition("备货建议", row.status, ["OPEN"]);
    if (!row.defaultSupplierId) throw new Error("配件未设置默认供应商");
    if (Number(row.suggested_qty) <= 0) throw new Error("建议采购量为 0");

    purchaseOrderId = randomUUID();
    const amount = multiplyMoney(row.refPurchasePrice, row.suggested_qty);
    run(
      `INSERT INTO purchase_orders
        (id, tenant_id, org_id, code, supplier_id, warehouse_id, total_amount, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseOrderId,
        session.tenantId,
        session.orgId,
        nextCode("PO"),
        row.defaultSupplierId,
        row.warehouse_id,
        amount,
        "农忙备货建议自动生成",
      ],
    );
    run(
      `INSERT INTO purchase_order_lines
        (id, purchase_order_id, part_id, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), purchaseOrderId, row.part_id, row.suggested_qty, row.refPurchasePrice, amount],
    );
    run(
      `UPDATE stocking_suggestions
       SET status = 'CONVERTED', purchase_order_id = ?
       WHERE id = ?`,
      [purchaseOrderId, id],
    );
  });
  writeAuditLog({ session, action: "convert", entity: "stocking_suggestions", entityId: id });
  return purchaseOrderId;
}

export function listSubsidyLedgers(session: SessionPayload) {
  const fieldAccess = getFieldAccessMap(session);

  return all(
    `SELECT sl.*, c.name AS customerName, so.code AS salesOrderCode,
      cm.factory_serial AS factorySerial
     FROM subsidy_ledgers sl
     JOIN customers c ON c.id = sl.customer_id
     LEFT JOIN sales_orders so ON so.id = sl.sales_order_id
     LEFT JOIN customer_machines cm ON cm.id = sl.customer_machine_id
     WHERE sl.tenant_id = ? AND sl.org_id = ?
     ORDER BY sl.created_at DESC`,
    scope(session),
  ).map((row) => applyFieldAccess(row, fieldAccess, ["customer_id_no", "bank_account"]));
}

export function createSubsidyLedger(session: SessionPayload, input: SubsidyLedgerInput) {
  const id = randomUUID();
  tx(() => {
    run(
      `INSERT INTO subsidy_ledgers
        (id, tenant_id, org_id, code, sales_order_id, customer_id, customer_machine_id,
         policy_type, subsidy_amount, subsidy_ratio, customer_id_no, machine_serial,
         bank_account, application_file, material_complete, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.tenantId,
        session.orgId,
        nextCode("SUB"),
        input.salesOrderId || null,
        input.customerId,
        input.customerMachineId || null,
        input.policyType,
        input.subsidyAmount,
        input.subsidyRatio,
        input.customerIdNo,
        input.machineSerial,
        input.bankAccount,
        input.applicationFile,
        materialComplete(input),
        input.note,
      ],
    );
  });
  writeAuditLog({ session, action: "create", entity: "subsidy_ledgers", entityId: id });
  return id;
}

export function advanceSubsidyLedger(session: SessionPayload, id: string) {
  tx(() => {
    const ledger = get<StatusRow>(
      `SELECT status FROM subsidy_ledgers WHERE tenant_id = ? AND org_id = ? AND id = ?`,
      [...scope(session), id],
    );
    if (!ledger) throw new Error("补贴台账不存在");

    const nextStatus: Record<string, string> = {
      DRAFT: "SUBMITTED",
      SUBMITTED: "APPROVED",
      APPROVED: "PAID_SUBSIDY",
    };
    const next = nextStatus[ledger.status];
    if (!next) throw new Error("补贴台账当前状态不允许推进");
    run(
      `UPDATE subsidy_ledgers
       SET status = ?,
           submitted_at = CASE WHEN ? = 'SUBMITTED' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
           approved_at = CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END,
           paid_at = CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END
       WHERE id = ?`,
      [next, next, next, next, id],
    );
  });
  writeAuditLog({ session, action: "advance", entity: "subsidy_ledgers", entityId: id });
}
