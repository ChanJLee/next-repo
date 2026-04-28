import { z } from "zod";

const requiredText = z.string().trim().min(1, "必填");
const jsonText = z.string().trim().refine(
  (value) => {
    try {
      JSON.parse(value || "{}");
      return true;
    } catch {
      return false;
    }
  },
  "请输入合法 JSON",
);

export const organizationInputSchema = z.object({
  parentId: z.string().trim().optional(),
  name: requiredText.max(128),
  code: requiredText.max(32),
  orgType: z.enum(["GROUP", "REGION", "STORE", "TEAM", "DEALER"]).default("STORE"),
});

export const roleInputSchema = z.object({
  name: requiredText.max(64),
  code: requiredText.max(64),
  dataScope: z.enum(["TENANT", "ORG", "ORG_TREE", "SELF"]).default("ORG"),
  permissionCodes: z.array(z.string()).default([]),
  fieldPermissions: z.record(z.string(), z.enum(["VISIBLE", "MASKED", "HIDDEN"])).default({}),
});

export const userInputSchema = z.object({
  username: requiredText.max(64),
  name: requiredText.max(64),
  password: z.string().min(6, "密码至少 6 位").max(128),
  orgId: requiredText,
  roleIds: z.array(z.string()).default([]),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

export const approvalFlowInputSchema = z.object({
  name: requiredText.max(128),
  code: requiredText.max(64),
  documentType: requiredText.max(64),
  conditionJson: jsonText.default("{}"),
});

export const numberRuleInputSchema = z.object({
  documentType: requiredText.max(64),
  prefix: requiredText.max(16),
  datePattern: z.string().trim().max(32).default("yyyyMMdd"),
  sequenceLength: z.coerce.number().int().min(2).max(8).default(4),
  resetCycle: z.enum(["DAY", "MONTH", "YEAR", "NEVER"]).default("DAY"),
  enabled: z.coerce.number().int().min(0).max(1).default(1),
});

export const dictionaryInputSchema = z.object({
  type: requiredText.max(64),
  code: requiredText.max(64),
  label: requiredText.max(128),
  sortOrder: z.coerce.number().int().default(0),
});

export const parameterInputSchema = z.object({
  paramKey: requiredText.max(128),
  paramValue: requiredText.max(500),
  valueType: z.enum(["TEXT", "NUMBER", "BOOLEAN", "JSON"]).default("TEXT"),
  description: z.string().trim().max(255).default(""),
});

export type OrganizationInput = z.infer<typeof organizationInputSchema>;
export type RoleInput = z.infer<typeof roleInputSchema>;
export type UserInput = z.infer<typeof userInputSchema>;
export type ApprovalFlowInput = z.infer<typeof approvalFlowInputSchema>;
export type NumberRuleInput = z.infer<typeof numberRuleInputSchema>;
export type DictionaryInput = z.infer<typeof dictionaryInputSchema>;
export type ParameterInput = z.infer<typeof parameterInputSchema>;
