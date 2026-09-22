'use client';

import { Bar } from 'react-chartjs-2';
import { ensureChartRegistered } from './ChartSetup';

ensureChartRegistered();

export type CategoryBreakdownItem = {
  category: string;
  avg_starting_price: string | number | null;
  avg_highest_bid: string | number | null;
  auction_count: number;
};

export default function CategoryBarChart({
  items,
  height = 280,
}: {
  items: CategoryBreakdownItem[];
  height?: number;
}) {
  if (!items.length) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 p-8 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
        style={{ height }}
      >
        <p className="text-sm font-medium">No category breakdown data available</p>
      </div>
    );
  }

  // Top 8 categories by auction count
  const sorted = [...items].sort((a, b) => b.auction_count - a.auction_count).slice(0, 8);
  const labels = sorted.map((i) => i.category);
  const counts = sorted.map((i) => i.auction_count);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Auctions',
        data: counts,
        backgroundColor: 'rgba(99, 102, 241, 0.85)', // Indigo
        hoverBackgroundColor: 'rgba(99, 102, 241, 1)',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
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
            const idx = context.dataIndex;
            const item = sorted[idx];
            const avgBid = Number(item.avg_highest_bid || 0).toLocaleString('en-US', {
              maximumFractionDigits: 0,
            });
            return [
              `Auctions: ${context.raw}`,
              `Avg Highest Bid: ৳${avgBid}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#71717a',
          font: { size: 11 },
          maxRotation: 30,
        },
      },
      y: {
        grid: {
          color: 'rgba(113, 113, 122, 0.1)',
        },
        ticks: {
          color: '#71717a',
          font: { size: 11 },
          stepSize: 1,
          precision: 0,
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={chartData} options={options as any} />
    </div>
  );
}
