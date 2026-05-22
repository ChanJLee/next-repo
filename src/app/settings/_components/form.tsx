"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function SettingsForm({ initial }: { initial: { webhook: string; hasSecret: boolean } }) {
  const [webhook, setWebhook] = useState(initial.webhook);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook, secret }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : "保存失败");
        return;
      }
      toast.success("已保存");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const j = await res.json();
      if (!res.ok) toast.error(j.error ?? "推送失败");
      else toast.success("已发送测试消息，请查收钉钉群");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>钉钉机器人</CardTitle>
        <CardDescription>
          在钉钉群 → 群设置 → 智能群助手 → 添加机器人 → 自定义。安全设置选择「加签」，把 webhook URL 和 secret 填到这里。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook">Webhook URL</Label>
          <Input
            id="webhook"
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxxxxx"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="secret">加签 Secret {initial.hasSecret ? <span className="text-xs text-muted-foreground">（已保存，填新值会覆盖）</span> : null}</Label>
          <Input
            id="secret"
            placeholder="SECxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
          <Button variant="outline" onClick={test} disabled={testing || !initial.hasSecret && !secret}>
            {testing ? "发送中…" : "发送测试消息"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
