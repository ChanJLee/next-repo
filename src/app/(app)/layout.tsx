import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/server/auth/current-session";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return <AppShell session={session}>{children}</AppShell>;
}
