"use server";

import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/current-session";
import {
  advanceServiceOrder,
  advanceSubsidyLedger,
  advanceWarrantyClaim,
  completeServiceOrder,
  confirmMaintenancePreorder,
  convertMaintenancePreorderToService,
  convertStockingSuggestionToPurchase,
  createMaintenancePreorder,
  createMaintenanceTemplate,
  createServiceOrder,
  createSubsidyLedger,
  createWarrantyClaim,
  dispatchServiceOrder,
  regenerateStockingSuggestions,
} from "./service";
import {
  completeServiceOrderInputSchema,
  dispatchServiceOrderInputSchema,
  maintenancePreorderInputSchema,
  maintenanceTemplateInputSchema,
  serviceOrderInputSchema,
  subsidyLedgerInputSchema,
  warrantyClaimInputSchema,
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

export async function createServiceOrderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = serviceOrderInputSchema.safeParse({
    customerId: value(formData, "customerId"),
    customerMachineId: value(formData, "customerMachineId") || undefined,
    sourceChannel: value(formData, "sourceChannel") || "PHONE",
    faultDescription: value(formData, "faultDescription"),
    faultCode: value(formData, "faultCode"),
    urgency: value(formData, "urgency") || "NORMAL",
    expectedAt: value(formData, "expectedAt") || undefined,
    currentHours: value(formData, "currentHours") || "0",
    currentAcres: value(formData, "currentAcres") || "0",
    latitude: value(formData, "latitude"),
    longitude: value(formData, "longitude"),
  });
  if (!parsed.success) {
    redirect("/service/orders/new?error=invalid");
  }

  const id = createServiceOrder(session, parsed.data);
  redirect(`/service/orders/${id}`);
}

export async function dispatchServiceOrderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = dispatchServiceOrderInputSchema.safeParse({
    id: value(formData, "id"),
    engineerName: value(formData, "engineerName"),
  });
  if (parsed.success) {
    dispatchServiceOrder(session, parsed.data);
  }
  redirect(`/service/orders/${value(formData, "id")}`);
}

export async function acceptServiceOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  advanceServiceOrder(session, id, "accept");
  redirect(`/service/orders/${id}`);
}

export async function startServiceOrderAction(formData: FormData) {
  const session = await requireSession();
  const id = value(formData, "id");
  advanceServiceOrder(session, id, "start");
  redirect(`/service/orders/${id}`);
}

export async function completeServiceOrderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = completeServiceOrderInputSchema.safeParse({
    id: value(formData, "id"),
    resolutionNote: value(formData, "resolutionNote"),
    customerSignature: value(formData, "customerSignature") || "现场签字已确认",
    photosJson: value(formData, "photosJson") || "[]",
    currentHours: value(formData, "currentHours") || "0",
    currentAcres: value(formData, "currentAcres") || "0",
    laborAmount: value(formData, "laborAmount") || "0",
    partsAmount: value(formData, "partsAmount") || "0",
    warrantyPartId: value(formData, "warrantyPartId") || undefined,
    warrantySerial: value(formData, "warrantySerial"),
  });
  if (parsed.success) {
    completeServiceOrder(session, parsed.data);
  }
  redirect(`/service/orders/${value(formData, "id")}`);
}

export async function createMaintenanceTemplateAction(formData: FormData) {
  const session = await requireSession();
  const parsed = maintenanceTemplateInputSchema.safeParse({
    machineModelId: value(formData, "machineModelId"),
    name: value(formData, "name"),
    thresholdHours: value(formData, "thresholdHours"),
    advanceRatio: value(formData, "advanceRatio") || "0.9",
    partPackageJson: value(formData, "partPackageJson") || "[]",
    laborHours: value(formData, "laborHours") || "0",
  });
  if (parsed.success) {
    createMaintenanceTemplate(session, parsed.data);
  }
  redirect("/maintenance/templates");
}

export async function createMaintenancePreorderAction(formData: FormData) {
  const session = await requireSession();
  const parsed = maintenancePreorderInputSchema.safeParse({
    maintenanceTemplateId: value(formData, "maintenanceTemplateId"),
    customerMachineId: value(formData, "customerMachineId"),
    quoteAmount: value(formData, "quoteAmount") || "0",
    expectedServiceDate: value(formData, "expectedServiceDate") || undefined,
    note: value(formData, "note"),
  });
  if (parsed.success) {
    createMaintenancePreorder(session, parsed.data);
  }
  redirect("/maintenance/preorders");
}

export async function confirmMaintenancePreorderAction(formData: FormData) {
  const session = await requireSession();
  confirmMaintenancePreorder(session, value(formData, "id"));
  redirect("/maintenance/preorders");
}

export async function convertMaintenancePreorderAction(formData: FormData) {
  const session = await requireSession();
  const serviceOrderId = convertMaintenancePreorderToService(session, value(formData, "id"));
  redirect(`/service/orders/${serviceOrderId}`);
}

export async function createWarrantyClaimAction(formData: FormData) {
  const session = await requireSession();
  const parsed = warrantyClaimInputSchema.safeParse({
    serviceOrderId: value(formData, "serviceOrderId"),
    customerMachineId: value(formData, "customerMachineId"),
    failedPartId: value(formData, "failedPartId"),
    failedSerial: value(formData, "failedSerial"),
    faultDescription: value(formData, "faultDescription"),
    claimAmount: value(formData, "claimAmount") || "0",
    failurePhoto: value(formData, "failurePhoto"),
    nameplatePhoto: value(formData, "nameplatePhoto"),
    repairOrderFile: value(formData, "repairOrderFile"),
    customerSignatureFile: value(formData, "customerSignatureFile"),
    purchaseProofFile: value(formData, "purchaseProofFile"),
  });
  if (parsed.success) {
    createWarrantyClaim(session, parsed.data);
  }
  redirect("/warranty/claims");
}

export async function advanceWarrantyClaimAction(formData: FormData) {
  const session = await requireSession();
  advanceWarrantyClaim(session, value(formData, "id"));
  redirect("/warranty/claims");
}

export async function regenerateStockingSuggestionsAction(formData: FormData) {
  const session = await requireSession();
  regenerateStockingSuggestions(session, value(formData, "season") || "SPRING");
  redirect("/stocking/suggestions");
}

export async function convertStockingSuggestionAction(formData: FormData) {
  const session = await requireSession();
  const purchaseOrderId = convertStockingSuggestionToPurchase(session, value(formData, "id"));
  redirect(`/purchase/orders/${purchaseOrderId}`);
}

export async function createSubsidyLedgerAction(formData: FormData) {
  const session = await requireSession();
  const parsed = subsidyLedgerInputSchema.safeParse({
    salesOrderId: value(formData, "salesOrderId") || undefined,
    customerId: value(formData, "customerId"),
    customerMachineId: value(formData, "customerMachineId") || undefined,
    policyType: value(formData, "policyType") || "PURCHASE",
    subsidyAmount: value(formData, "subsidyAmount") || "0",
    subsidyRatio: value(formData, "subsidyRatio") || "0",
    customerIdNo: value(formData, "customerIdNo"),
    machineSerial: value(formData, "machineSerial"),
    bankAccount: value(formData, "bankAccount"),
    applicationFile: value(formData, "applicationFile"),
    note: value(formData, "note"),
  });
  if (parsed.success) {
    createSubsidyLedger(session, parsed.data);
  }
  redirect("/finance/subsidies");
}

export async function advanceSubsidyLedgerAction(formData: FormData) {
  const session = await requireSession();
  advanceSubsidyLedger(session, value(formData, "id"));
  redirect("/finance/subsidies");
}
