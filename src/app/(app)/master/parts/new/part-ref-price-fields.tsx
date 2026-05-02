"use client";

import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function PartRefPriceFields({
  purchaseError,
  salesError,
}: {
  purchaseError?: string;
  salesError?: string;
} = {}) {
  function onPurchaseBlur() {
    const purchaseEl = document.getElementById(
      "part-ref-purchase",
    ) as HTMLInputElement | null;
    const salesEl = document.getElementById(
      "part-ref-sales",
    ) as HTMLInputElement | null;
    if (!purchaseEl || !salesEl) return;
    const purchaseRaw = purchaseEl.value.trim();
    const salesRaw = salesEl.value.trim();
    if (salesRaw !== "") return;
    if (!purchaseRaw || !MONEY_PATTERN.test(purchaseRaw)) return;
    const num = Number.parseFloat(purchaseRaw);
    if (Number.isNaN(num)) return;
    salesEl.value = (num * 1.3).toFixed(2);
  }

  return (
    <>
      <label className="space-y-2 text-sm">
        <span className="font-medium">采购参考价</span>
        <Input
          aria-invalid={purchaseError ? true : undefined}
          className={cn(
            purchaseError &&
              "border-red-500 focus:border-red-500 dark:border-red-600 dark:focus:border-red-500",
          )}
          id="part-ref-purchase"
          name="refPurchasePrice"
          onBlur={onPurchaseBlur}
          type="text"
        />
        {purchaseError ? (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {purchaseError}
          </p>
        ) : null}
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium">销售指导价</span>
        <Input
          aria-invalid={salesError ? true : undefined}
          className={cn(
            salesError &&
              "border-red-500 focus:border-red-500 dark:border-red-600 dark:focus:border-red-500",
          )}
          id="part-ref-sales"
          name="refSalesPrice"
          type="text"
        />
        {salesError ? (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {salesError}
          </p>
        ) : null}
      </label>
    </>
  );
}
