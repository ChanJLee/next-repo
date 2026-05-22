"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { X, KeyRound } from "lucide-react";

const COOKIE_NAME = "stooq_apikey";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 86400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * 顶部横幅：检测到没设置 Stooq apikey 时引导用户填写。设置完通过 cookie 存到浏览器。
 * 用户也可以点 "稍后" 关闭横幅（关闭状态用 sessionStorage 记录，关掉页签后又会弹）。
 */
export function StooqApikeyBanner() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);  // null = 初始未检测
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setHasKey(!!readCookie(COOKIE_NAME));
    setDismissed(sessionStorage.getItem("stooq_apikey_banner_dismissed") === "1");
  }, []);

  function save() {
    const v = draft.trim();
    if (!v) {
      toast.error("apikey 不能为空");
      return;
    }
    writeCookie(COOKIE_NAME, v, 365);
    setHasKey(true);
    setEditing(false);
    setDraft("");
    toast.success("apikey 已保存到本地 cookie");
  }

  function dismiss() {
    sessionStorage.setItem("stooq_apikey_banner_dismissed", "1");
    setDismissed(true);
  }

  if (hasKey !== false || dismissed) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="p-3 flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="text-sm font-medium text-amber-900">未配置 Stooq API Key</div>
            <p className="text-xs text-amber-800 mt-0.5">
              股票数据优先从 Stooq 拉取。免费 apikey 在{" "}
              <a href="https://stooq.com/api/" target="_blank" rel="noreferrer" className="underline">stooq.com/api</a>{" "}
              申请，填到这里仅保存在你本机 cookie。
            </p>
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="stooq-apikey" className="sr-only">apikey</Label>
              <Input
                id="stooq-apikey"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="粘贴你的 Stooq apikey"
                className="h-8 max-w-xs bg-white"
                autoFocus
              />
              <Button size="sm" onClick={save}>保存</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(""); }}>取消</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setEditing(true)}>填写 apikey</Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>稍后</Button>
            </div>
          )}
        </div>
        {!editing ? (
          <Button size="icon" variant="ghost" onClick={dismiss} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * 设置页面里的"管理 Stooq apikey"卡片：可以编辑、清除已保存的 key。
 */
export function StooqApikeySettings() {
  const [stored, setStored] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setStored(readCookie(COOKIE_NAME));
  }, []);

  function save() {
    const v = draft.trim();
    if (!v) {
      toast.error("apikey 不能为空");
      return;
    }
    writeCookie(COOKIE_NAME, v, 365);
    setStored(v);
    setEditing(false);
    setDraft("");
    toast.success("已保存");
  }

  function remove() {
    clearCookie(COOKIE_NAME);
    setStored(null);
    setEditing(false);
    setDraft("");
    toast.message("已清除本地 apikey");
  }

  const masked = stored ? `${stored.slice(0, 4)}${"*".repeat(Math.max(0, stored.length - 8))}${stored.slice(-4)}` : "";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Stooq API Key</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            存储在浏览器 cookie 里（仅本机有效）。免费 apikey 在{" "}
            <a href="https://stooq.com/api/" target="_blank" rel="noreferrer" className="underline">stooq.com/api</a> 申请。
          </p>
        </div>
        {!editing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{stored ? masked : "未设置"}</span>
            <Button size="sm" variant="outline" onClick={() => { setDraft(stored ?? ""); setEditing(true); }}>
              {stored ? "更换" : "填写"}
            </Button>
            {stored ? (
              <Button size="sm" variant="ghost" onClick={remove}>清除</Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="粘贴你的 Stooq apikey"
              className="max-w-xs"
              autoFocus
            />
            <Button size="sm" onClick={save}>保存</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(""); }}>取消</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
