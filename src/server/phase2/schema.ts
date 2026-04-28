import { z } from "zod";

const requiredText = z.string().trim().min(1, "必填");
const moneyText = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "请输入金额");
const decimalText = z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "请输入数字");

export const serviceOrderInputSchema = z.object({
  customerId: requiredText,
  customerMachineId: z.string().trim().optional(),
  sourceChannel: z.enum(["PHONE", "MINI_APP", "SALES", "MAINTENANCE"]).default("PHONE"),
  faultDescription: requiredText.max(500),
  faultCode: z.string().trim().max(64).default(""),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "EMERGENCY"]).default("NORMAL"),
  expectedAt: z.string().trim().max(32).optional(),
  currentHours: decimalText.default("0"),
  currentAcres: decimalText.default("0"),
  latitude: z.string().trim().max(32).default(""),
  longitude: z.string().trim().max(32).default(""),
});

export const dispatchServiceOrderInputSchema = z.object({
  id: requiredText,
  engineerName: requiredText.max(64),
});

export const completeServiceOrderInputSchema = z.object({
  id: requiredText,
  resolutionNote: requiredText.max(500),
  customerSignature: z.string().trim().max(128).default("现场签字已确认"),
  photosJson: z.string().trim().max(500).default("[]"),
  currentHours: decimalText.default("0"),
  currentAcres: decimalText.default("0"),
  laborAmount: moneyText.default("0"),
  partsAmount: moneyText.default("0"),
  warrantyPartId: z.string().trim().optional(),
  warrantySerial: z.string().trim().max(128).default(""),
});

export const maintenanceTemplateInputSchema = z.object({
  machineModelId: requiredText,
  name: requiredText.max(128),
  thresholdHours: z.coerce.number().int().min(1),
  advanceRatio: decimalText.default("0.9"),
  partPackageJson: z.string().trim().max(1000).default("[]"),
  laborHours: decimalText.default("0"),
});

export const maintenancePreorderInputSchema = z.object({
  maintenanceTemplateId: requiredText,
  customerMachineId: requiredText,
  quoteAmount: moneyText.default("0"),
  expectedServiceDate: z.string().trim().max(32).optional(),
  note: z.string().trim().max(255).default(""),
});

export const warrantyClaimInputSchema = z.object({
  serviceOrderId: requiredText,
  customerMachineId: requiredText,
  failedPartId: requiredText,
  failedSerial: requiredText.max(128),
  faultDescription: requiredText.max(500),
  claimAmount: moneyText.default("0"),
  failurePhoto: z.string().trim().max(128).default(""),
  nameplatePhoto: z.string().trim().max(128).default(""),
  repairOrderFile: z.string().trim().max(128).default(""),
  customerSignatureFile: z.string().trim().max(128).default(""),
  purchaseProofFile: z.string().trim().max(128).default(""),
});

export const subsidyLedgerInputSchema = z.object({
  salesOrderId: z.string().trim().optional(),
  customerId: requiredText,
  customerMachineId: z.string().trim().optional(),
  policyType: z.enum(["PURCHASE", "SCRAP_RENEWAL", "LOCAL"]).default("PURCHASE"),
  subsidyAmount: moneyText.default("0"),
  subsidyRatio: decimalText.default("0"),
  customerIdNo: z.string().trim().max(64).default(""),
  machineSerial: z.string().trim().max(128).default(""),
  bankAccount: z.string().trim().max(128).default(""),
  applicationFile: z.string().trim().max(128).default(""),
  note: z.string().trim().max(255).default(""),
});

export type ServiceOrderInput = z.infer<typeof serviceOrderInputSchema>;
export type DispatchServiceOrderInput = z.infer<typeof dispatchServiceOrderInputSchema>;
export type CompleteServiceOrderInput = z.infer<typeof completeServiceOrderInputSchema>;
export type MaintenanceTemplateInput = z.infer<typeof maintenanceTemplateInputSchema>;
export type MaintenancePreorderInput = z.infer<typeof maintenancePreorderInputSchema>;
export type WarrantyClaimInput = z.infer<typeof warrantyClaimInputSchema>;
export type SubsidyLedgerInput = z.infer<typeof subsidyLedgerInputSchema>;
