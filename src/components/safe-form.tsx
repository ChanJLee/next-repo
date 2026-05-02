"use client";

import type { ComponentProps, KeyboardEvent } from "react";

/**
 * 阻止在普通输入框按 Enter 触发表单提交（避免误触）。
 * 保留：多行文本换行、按钮获得焦点时的键盘激活。
 */
function blockEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const target = e.target;
  if (target instanceof HTMLTextAreaElement) return;
  if (target instanceof HTMLButtonElement) return;
  if (target instanceof HTMLInputElement) {
    const t = target.type;
    if (t === "submit" || t === "button" || t === "reset") return;
    e.preventDefault();
  }
}

export function SafeForm({
  onKeyDown,
  ...props
}: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onKeyDown={(e) => {
        blockEnterSubmit(e);
        onKeyDown?.(e);
      }}
    />
  );
}
