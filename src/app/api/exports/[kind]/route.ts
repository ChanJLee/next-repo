import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/current-session";
import { exportRows } from "@/server/phase1/service";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind } = await params;
  const exported = exportRows(session, kind);
  const body = [
    exported.headers.map(csvEscape).join(","),
    ...exported.rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exported.filename}"`,
    },
  });
}
