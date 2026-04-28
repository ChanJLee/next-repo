"use server";

import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/current-session";
import {
  approvePurchaseOrder,
  approveSalesOrder,
  createCustomer,
  createPart,
  createPayment,
  createPurchaseOrder,
  createSalesOrder,
  createStockCount,
  receivePurchaseOrder,
  shipSalesOrder,
} from "./service";
import {
  customerInputSchema,
  partInputSchema,
  paymentInputSchema,
  purchaseOrderInputSchema,
  salesOrderInputSchema,
} from "./schema";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function createPartAction(formData: FormData) {
  const session = await requireSession();
  const parsed = partInputSchema.safeParse({
    code: value(formData, "code"),
    name: value(formData, "name"),
    oemCode: value(formData, "oemCode"),
    category: value(formData, "category"),
    brand: value(formData, "brand"),
    warrantyType: value(formData, "warrantyType") || "NORMAL",
    refPurchasePrice: value(formData, "refPurchasePrice") || "0",
    refSalesPrice: value(formData, "refSalesPrice") || "0",
    safetyStock: value(formData, "safetyStock") || "0",
    hasSerial: formData.get("hasSerial") === "on" ? 1 : 0,
  });

  if (!parsed.success) {
    redirect("/master/parts/new?error=invalid");
  }

  const id = createPart(session, parsed.data);
  redirect(`/master/parts/${id}`);
}

export async function createCustomerAction(formData: FormData) {
  const session = await requireSession();
  const parsed = customerInputSchema.safeParse({
    code: value(formData, "code"),
    name: value(formData, "name"),
    customerType: value(formData, "customerType") || "FARMER",
    level: value(formData, "level") || "NORMAL",
    contactName: value(formData, "contactName"),
    phone: value(formData, "phone"),
    creditLimit: value(formData, "creditLimit") || "0",
    paymentTermDays: value(formData, "paymentTermDays") || "0",
    address: value(formData, "address"),
  });

  if (!parsed.success) {
    redirect("/master/customers/new?error=invalid");
  }

  const id = createCustomer(session, parsed.data);
  redirect(`/master/customers/${id}`);
}

export async function createPurchaseOrderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = purchaseOrderInputSchema.safeParse({
    supplierId: value(formData, "supplierId"),
    warehouseId: value(formData, "warehouseId"),
    partId: value(formData, "partId"),
    qty: value(formData, "qty"),
    unitPrice: value(formData, "unitPrice"),
    note: value(formData, "note"),
  });

  if (!parsed.success) {
    redirect("/purchase/orders/new?error=invalid");
  }

  const id = createPurchaseOrder(session, parsed.data);
  redirect(`/purchase/orders/${id}`);
}

export async function approvePurchaseOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  approvePurchaseOrder(session, id);
  redirect(`/purchase/orders/${id}`);
}

export async function receivePurchaseOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  receivePurchaseOrder(session, id);
  redirect(`/purchase/orders/${id}`);
}

export async function createSalesOrderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = salesOrderInputSchema.safeParse({
    customerId: value(formData, "customerId"),
    customerMachineId: value(formData, "customerMachineId") || undefined,
    partId: value(formData, "partId"),
    warehouseId: value(formData, "warehouseId"),
    qty: value(formData, "qty"),
    unitPrice: value(formData, "unitPrice"),
    warrantySerial: value(formData, "warrantySerial"),
    note: value(formData, "note"),
  });

  if (!parsed.success) {
    redirect("/sales/orders/new?error=invalid");
  }

  const id = createSalesOrder(session, parsed.data);
  redirect(`/sales/orders/${id}`);
}

export async function approveSalesOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  approveSalesOrder(session, id);
  redirect(`/sales/orders/${id}`);
}

export async function shipSalesOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  shipSalesOrder(session, id);
  redirect(`/sales/orders/${id}`);
}

export async function createPaymentAction(formData: FormData) {
  const session = await requireSession();
  const parsed = paymentInputSchema.safeParse({
    customerId: value(formData, "customerId"),
    amount: value(formData, "amount"),
    paymentMethod: value(formData, "paymentMethod") || "BANK",
    note: value(formData, "note"),
  });

  if (!parsed.success) {
    redirect("/finance/payments/new?error=invalid");
  }

  createPayment(session, parsed.data);
  redirect("/finance/receivables");
}

export async function createStockCountAction(formData: FormData) {
  const session = await requireSession();
  const warehouseId = value(formData, "warehouseId");
  createStockCount(session, warehouseId);
  redirect("/inventory");
}
