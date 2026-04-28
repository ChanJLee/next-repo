import { Card, PageHeader, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listSeasonalCalendar } from "@/server/phase1/service";

export default async function SeasonsPage() {
  const session = await getCurrentSession();
  const rows = session ? listSeasonalCalendar(session) : [];

  return (
    <div>
      <PageHeader description="按区域配置春耕、夏收、秋收等窗口，用于备货系数。" title="农时日历" />
      <Card>
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3 font-medium">{String(row.region_code)}</td>
                <td className="px-4 py-3">{String(row.season)}</td>
                <td className="px-4 py-3">{String(row.start_date)} - {String(row.end_date)}</td>
                <td className="px-4 py-3 text-zinc-500">{String(row.note)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
