import { SettingsForm } from "./_components/form";
import { getFeishuConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = await getFeishuConfig();
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">设置</h1>
      <SettingsForm initial={{ webhook: cfg?.webhook ?? "", hasSecret: !!cfg?.secret }} />
    </div>
  );
}
