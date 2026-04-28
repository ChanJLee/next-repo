"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type ReportPoint = {
  name: string;
  value: number;
};

export function ReportChart({
  title,
  rows,
}: {
  title: string;
  rows: ReportPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = echarts.init(ref.current);
    const names = rows.map((row) => row.name || "未分类");
    const values = rows.map((row) => Number(row.value ?? 0));

    chart.setOption({
      color: ["#18181b", "#71717a", "#a1a1aa", "#d4d4d8"],
      title: {
        text: title,
        textStyle: { fontSize: 13, fontWeight: 600 },
      },
      tooltip: { trigger: "axis" },
      grid: { left: 32, right: 16, top: 48, bottom: 32 },
      xAxis: { type: "category", data: names },
      yAxis: { type: "value" },
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 36,
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [rows, title]);

  return <div className="h-64 w-full" ref={ref} />;
}
