import { z } from "zod";

const requiredText = z.string().trim().min(1, "必填");
const moneyText = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "请输入金额");
/** 允许留空，入库按 0 处理（用于配件参考价等不必预填的场景） */
const optionalPartMoneyText = z
  .string()
  .trim()
  .refine((s) => s === "" || /^\d+(\.\d{1,2})?$/.test(s), "请输入金额")
  .transform((s) => (s === "" ? "0" : s));
const qtyText = z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "请输入数量");

export const partInputSchema = z.object({
  code: requiredText.max(32),
  name: requiredText.max(128),
  oemCode: z.string().trim().max(64).default(""),
  category: z.string().trim().max(128).default(""),
  brand: z.string().trim().max(64).default(""),
  warrantyType: z
    .enum(["THREE_GUARANTEE", "WEAR", "NORMAL"])
    .default("NORMAL"),
  refPurchasePrice: optionalPartMoneyText,
  refSalesPrice: optionalPartMoneyText,
  safetyStock: z.coerce.number().int().min(0).default(0),
  hasSerial: z.coerce.number().int().min(0).max(1).default(0),
});

export const customerInputSchema = z.object({
  code: requiredText.max(32),
  name: requiredText.max(128),
  customerType: z.enum(["INDIVIDUAL", "FARMER", "COOP", "FARM_ENTERPRISE", "REPAIR_SHOP", "DEALER"]).default("FARMER"),
  level: z.enum(["NORMAL", "SILVER", "GOLD", "VIP"]).default("NORMAL"),
  contactName: z.string().trim().max(64).default(""),
  phone: z.string().trim().max(32).default(""),
  creditLimit: moneyText.default("0"),
  paymentTermDays: z.coerce.number().int().min(0).default(0),
  address: z.string().trim().max(255).default(""),
});

export const purchaseOrderInputSchema = z.object({
  supplierId: requiredText,
  warehouseId: requiredText,
  partId: requiredText,
  qty: qtyText,
  unitPrice: moneyText,
  note: z.string().trim().max(255).default(""),
});

export const salesOrderInputSchema = z.object({
  customerId: requiredText,
  customerMachineId: z.string().trim().optional(),
  partId: requiredText,
  warehouseId: requiredText,
  qty: qtyText,
  unitPrice: moneyText,
  warrantySerial: z.string().trim().max(128).default(""),
  note: z.string().trim().max(255).default(""),
});

export const paymentInputSchema = z.object({
  customerId: requiredText,
  amount: moneyText,
  paymentMethod: z.enum(["BANK", "CASH", "WECHAT", "ALIPAY"]).default("BANK"),
  note: z.string().trim().max(255).default(""),
});

export type PartInput = z.infer<typeof partInputSchema>;
export type CustomerInput = z.infer<typeof customerInputSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;
export type SalesOrderInput = z.infer<typeof salesOrderInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
