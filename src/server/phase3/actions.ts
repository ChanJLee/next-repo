"use server";

import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/current-session";
import {
  createApprovalFlow,
  createDictionary,
  createNumberRule,
  createOrganization,
  createParameter,
  createRole,
  createUser,
} from "./service";
import {
  approvalFlowInputSchema,
  dictionaryInputSchema,
  numberRuleInputSchema,
  organizationInputSchema,
  parameterInputSchema,
  roleInputSchema,
  userInputSchema,
} from "./schema";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function values(formData: FormData, key: string) {
  return formData.getAll(key).filter((item): item is string => typeof item === "string");
}

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function createOrganizationAction(formData: FormData) {
  const session = await requireSession();
  const parsed = organizationInputSchema.safeParse({
    parentId: value(formData, "parentId") || undefined,
    name: value(formData, "name"),
    code: value(formData, "code"),
    orgType: value(formData, "orgType") || "STORE",
  });
  if (parsed.success) {
    createOrganization(session, parsed.data);
  }
  redirect("/system/organizations");
}

export async function createRoleAction(formData: FormData) {
  const session = await requireSession();
  const parsed = roleInputSchema.safeParse({
    name: value(formData, "name"),
    code: value(formData, "code"),
    dataScope: value(formData, "dataScope") || "ORG",
    permissionCodes: values(formData, "permissionCodes"),
    fieldPermissions: {
      cost_price: value(formData, "field_cost_price") || "MASKED",
      credit_limit: value(formData, "field_credit_limit") || "MASKED",
      customer_id_no: value(formData, "field_customer_id_no") || "MASKED",
      bank_account: value(formData, "field_bank_account") || "MASKED",
    },
  });
  if (parsed.success) {
    createRole(session, parsed.data);
  }
  redirect("/system/roles");
}

export async function createUserAction(formData: FormData) {
  const session = await requireSession();
  const parsed = userInputSchema.safeParse({
    username: value(formData, "username"),
    name: value(formData, "name"),
    password: value(formData, "password"),
    orgId: value(formData, "orgId"),
    roleIds: values(formData, "roleIds"),
    status: value(formData, "status") || "ACTIVE",
  });
  if (parsed.success) {
    createUser(session, parsed.data);
  }
  redirect("/system/users");
}

export async function createApprovalFlowAction(formData: FormData) {
  const session = await requireSession();
  const parsed = approvalFlowInputSchema.safeParse({
    name: value(formData, "name"),
    code: value(formData, "code"),
    documentType: value(formData, "documentType"),
    conditionJson: value(formData, "conditionJson") || "{}",
  });
  if (parsed.success) {
    createApprovalFlow(session, parsed.data);
  }
  redirect("/system/workflows");
}

export async function createNumberRuleAction(formData: FormData) {
  const session = await requireSession();
  const parsed = numberRuleInputSchema.safeParse({
    documentType: value(formData, "documentType"),
    prefix: value(formData, "prefix"),
    datePattern: value(formData, "datePattern") || "yyyyMMdd",
    sequenceLength: value(formData, "sequenceLength") || "4",
    resetCycle: value(formData, "resetCycle") || "DAY",
    enabled: value(formData, "enabled") || "1",
  });
  if (parsed.success) {
    createNumberRule(session, parsed.data);
  }
  redirect("/system/number-rules");
}

export async function createDictionaryAction(formData: FormData) {
  const session = await requireSession();
  const parsed = dictionaryInputSchema.safeParse({
    type: value(formData, "type"),
    code: value(formData, "code"),
    label: value(formData, "label"),
    sortOrder: value(formData, "sortOrder") || "0",
  });
  if (parsed.success) {
    createDictionary(session, parsed.data);
  }
  redirect("/system/dictionaries");
}

export async function createParameterAction(formData: FormData) {
  const session = await requireSession();
  const parsed = parameterInputSchema.safeParse({
    paramKey: value(formData, "paramKey"),
    paramValue: value(formData, "paramValue"),
    valueType: value(formData, "valueType") || "TEXT",
    description: value(formData, "description"),
  });
  if (parsed.success) {
    createParameter(session, parsed.data);
  }
  redirect("/system/parameters");
}
