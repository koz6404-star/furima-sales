'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';

type ChartDataPoint = {
  label: string;
  売上: number;
  利益: number;
  利益率: number;
};

export function DashboardCharts({
  data,
  period,
  height = 300,
}: {
  data: ChartDataPoint[];
  period: 'month' | 'year';
  height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 h-[300px] flex items-center justify-center text-slate-500">
        表示するデータがありません
      </div>
    );
  }

  const formatY = (v: number) => `¥${(v / 10000).toFixed(0)}万`;
  const formatTooltipY = (v: number) => `¥${v?.toLocaleString() ?? 0}`;
  const formatRate = (v: number) => `${v}%`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="font-bold text-lg mb-4">
        {period === 'month' ? '日別推移' : '月別推移'}
      </h2>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="left"
              tickFormatter={formatY}
              tick={{ fontSize: 12 }}
              label={{ value: '金額（円）', angle: -90, position: 'insideLeft', offset: -10 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatRate}
              tick={{ fontSize: 12 }}
              domain={[0, 'auto']}
              label={{ value: '利益率（%）', angle: 90, position: 'insideRight', offset: -10 }}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = Number(value) ?? 0;
                const n = String(name ?? '');
                if (n === '利益率') return [formatRate(v), n];
                return [formatTooltipY(v), n];
              }}
              contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="売上" fill="#64748b" name="売上" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="利益" fill="#10b981" name="利益" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="利益率"
              stroke="#f59e0b"
              strokeWidth={2}
              name="利益率（%）"
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
