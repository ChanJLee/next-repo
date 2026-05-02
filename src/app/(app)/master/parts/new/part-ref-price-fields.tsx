"use client";

import { Input } from "@/components/ui";

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function PartRefPriceFields() {
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
          id="part-ref-purchase"
          name="refPurchasePrice"
          onBlur={onPurchaseBlur}
          type="text"
        />
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium">销售指导价</span>
        <Input id="part-ref-sales" name="refSalesPrice" type="text" />
      </label>
    </>
  );
}
