'use client';

import { Doughnut } from 'react-chartjs-2';
import { ensureChartRegistered } from './ChartSetup';

ensureChartRegistered();

export type AuctionLifecycleCounts = {
  live: number;
  upcoming: number;
  closed: number;
  cancelled: number;
  total?: number;
};

export default function LifecycleDonutChart({
  counts,
  height = 240,
}: {
  counts?: AuctionLifecycleCounts;
  height?: number;
}) {
  const { live = 0, upcoming = 0, closed = 0, cancelled = 0 } = counts || {};
  const total = live + upcoming + closed + cancelled;

  if (total === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 p-6 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
        style={{ height }}
      >
        <p className="text-sm font-medium">No auctions data</p>
      </div>
    );
  }

  const chartData = {
    labels: ['Live', 'Upcoming', 'Closed', 'Cancelled'],
    datasets: [
      {
        data: [live, upcoming, closed, cancelled],
        backgroundColor: [
          '#10b981', // Emerald
          '#38bdf8', // Sky
          '#71717a', // Zinc
          '#f43f5e', // Rose
        ],
        hoverBackgroundColor: [
          '#059669',
          '#0284c7',
          '#52525b',
          '#e11d48',
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 14,
          color: '#71717a',
          font: { size: 11, weight: 'bold' as const },
        },
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#f4f4f5',
        bodyColor: '#e4e4e7',
        borderColor: '#27272a',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context: any) => {
            const val = context.raw || 0;
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
            return ` ${context.label}: ${val} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ height }}>
      <Doughnut data={chartData} options={options as any} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
        <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
          {total}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Total
        </span>
      </div>
    </div>
  );
}
