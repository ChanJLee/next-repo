"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  SelectField,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import {
  createPartAction,
  type CreatePartFormState,
} from "@/server/phase1/actions";

import { PartRefPriceFields } from "./part-ref-price-fields";

const FIELD_LABELS: Record<string, string> = {
  code: "配件编码",
  name: "配件名称",
  oemCode: "厂家件号",
  category: "分类",
  brand: "品牌",
  warrantyType: "三包属性",
  refPurchasePrice: "采购参考价",
  refSalesPrice: "销售指导价",
  safetyStock: "安全库存",
  hasSerial: "管控序列号",
};

function firstError(messages?: string[]) {
  return messages?.[0];
}

export function NewPartForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<
    CreatePartFormState,
    FormData
  >(createPartAction, null);

  useEffect(() => {
    if (state) {
      dialogRef.current?.showModal();
    }
  }, [state]);

  const fe = state?.fieldErrors;

  return (
    <>
      <SafeForm action={formAction}>
        <FormCard>
          <FormGrid>
            <FormField
              error={firstError(fe?.code)}
              label="配件编码"
              name="code"
              placeholder="P-1003"
            />
            <FormField
              error={firstError(fe?.name)}
              label="配件名称"
              name="name"
              placeholder="柴油滤芯"
            />
            <FormField
              error={firstError(fe?.oemCode)}
              label="厂家件号"
              name="oemCode"
            />
            <FormField
              error={firstError(fe?.category)}
              label="分类"
              name="category"
              placeholder="发动机系/滤清器"
            />
            <FormField error={firstError(fe?.brand)} label="品牌" name="brand" />
            <SelectField
              error={firstError(fe?.warrantyType)}
              label="三包属性"
              name="warrantyType"
            >
              <option value="NORMAL">普通件</option>
              <option value="WEAR">易损件</option>
              <option value="THREE_GUARANTEE">三包件</option>
            </SelectField>
            <PartRefPriceFields
              purchaseError={firstError(fe?.refPurchasePrice)}
              salesError={firstError(fe?.refSalesPrice)}
            />
            <FormField
              defaultValue="0"
              error={firstError(fe?.safetyStock)}
              label="安全库存"
              name="safetyStock"
              type="number"
            />
          </FormGrid>
          <label className="flex items-center gap-2 text-sm">
            <input name="hasSerial" type="checkbox" />
            管控序列号
          </label>
          {firstError(fe?.hasSerial) ? (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {firstError(fe?.hasSerial)}
            </p>
          ) : null}
          <Button disabled={pending} type="submit">
            {pending ? "保存中…" : "保存配件"}
          </Button>
        </FormCard>
      </SafeForm>

      <dialog
        className="fixed left-[50vw] top-[50vh] z-50 w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 [&::backdrop]:bg-zinc-950/50"
        ref={dialogRef}
      >
        {state ? (
          <div>
            <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              无法保存配件
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {state.message}
            </p>
            {state.formErrors.length > 0 ? (
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {state.formErrors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {Object.keys(state.fieldErrors).length > 0 ? (
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {Object.entries(state.fieldErrors).map(([key, messages]) => {
                  const label = FIELD_LABELS[key] ?? key;
                  const text = messages?.[0] ?? "";
                  return (
                    <li key={key}>
                      {label}：{text}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="mt-6 flex justify-end">
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                onClick={() => dialogRef.current?.close()}
                type="button"
              >
                知道了
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
