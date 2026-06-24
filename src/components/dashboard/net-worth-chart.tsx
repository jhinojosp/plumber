"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type NetWorthPoint = {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

type NetWorthChartProps = {
  data: NetWorthPoint[];
};

const chartConfig = {
  netWorth: {
    label: "Net worth",
    color: "var(--chart-1)",
  },
  assets: {
    label: "Assets",
    color: "var(--chart-2)",
  },
  liabilities: {
    label: "Liabilities",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function NetWorthChart({ data }: NetWorthChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add balance snapshots to build your net worth history.
      </p>
    );
  }

  return (
    <ChartContainer className="h-[320px] w-full" config={chartConfig}>
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 12 }}>
        <CartesianGrid vertical={false} />

        <XAxis
          axisLine={false}
          dataKey="date"
          tickFormatter={formatDate}
          tickLine={false}
        />

        <YAxis
          axisLine={false}
          tickFormatter={(value) =>
            new Intl.NumberFormat("es-MX", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(Number(value))
          }
          tickLine={false}
          width={60}
        />

        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex min-w-[160px] items-center justify-between gap-4">
                  <span>{chartConfig[name as keyof typeof chartConfig]?.label}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: "MXN",
                      maximumFractionDigits: 0,
                    }).format(Number(value))}
                  </span>
                </div>
              )}
              labelFormatter={(label) => formatDate(String(label))}
            />
          }
        />

        <Area
          dataKey="assets"
          fill="var(--color-assets)"
          fillOpacity={0.12}
          stroke="var(--color-assets)"
          strokeWidth={2}
          type="monotone"
        />

        <Area
          dataKey="liabilities"
          fill="var(--color-liabilities)"
          fillOpacity={0.12}
          stroke="var(--color-liabilities)"
          strokeWidth={2}
          type="monotone"
        />

        <Area
          dataKey="netWorth"
          fill="var(--color-netWorth)"
          fillOpacity={0.2}
          stroke="var(--color-netWorth)"
          strokeWidth={3}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
