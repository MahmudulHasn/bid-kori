'use client';

import { Doughnut } from 'react-chartjs-2';
import { ensureChartRegistered } from './ChartSetup';

ensureChartRegistered();

export type UserRoleCounts = {
  buyers: number;
  sellers: number;
  admins: number;
  suspended: number;
  total?: number;
};

export default function UserRolesChart({
  counts,
  height = 240,
}: {
  counts?: UserRoleCounts;
  height?: number;
}) {
  const { buyers = 0, sellers = 0, admins = 0, suspended = 0 } = counts || {};
  const total = buyers + sellers + admins;

  if (total === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 p-6 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
        style={{ height }}
      >
        <p className="text-sm font-medium">No user data available</p>
      </div>
    );
  }

  const chartData = {
    labels: ['Buyers', 'Sellers', 'Staff Admins'],
    datasets: [
      {
        data: [buyers, sellers, admins],
        backgroundColor: [
          '#6366f1', // Indigo
          '#f59e0b', // Amber
          '#8b5cf6', // Purple
        ],
        hoverBackgroundColor: [
          '#4f46e5',
          '#d97706',
          '#7c3aed',
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
          Users
        </span>
      </div>
    </div>
  );
}
