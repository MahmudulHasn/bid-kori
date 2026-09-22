'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { ensureChartRegistered } from './ChartSetup';

ensureChartRegistered();

export type BidTimelinePoint = {
  amount: string | number;
  timestamp: string;
  bidder_username: string;
  auction_id?: number;
};

export default function BiddingTimelineChart({
  points,
  height = 280,
}: {
  points: BidTimelinePoint[];
  height?: number;
}) {
  const { labels, dataPoints, details } = useMemo(() => {
    // Sort oldest first for timeline left-to-right
    const sorted = [...points].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta - tb;
    });

    const labels = sorted.map((p) => {
      const d = new Date(p.timestamp);
      return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d, h:mm a');
    });

    const dataPoints = sorted.map((p) => Number(p.amount) || 0);

    return { labels, dataPoints, details: sorted };
  }, [points]);

  if (!points.length) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 p-8 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
        style={{ height }}
      >
        <p className="text-sm font-medium">No bidding activity recorded in this period</p>
        <p className="mt-1 text-xs">New bids will appear on this timeline automatically</p>
      </div>
    );
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Bid Amount (৳)',
        data: dataPoints,
        fill: true,
        borderColor: '#7c3aed', // Brand violet
        backgroundColor: 'rgba(124, 58, 237, 0.12)',
        borderWidth: 2.5,
        pointBackgroundColor: '#7c3aed',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#7c3aed',
        pointRadius: points.length > 30 ? 2 : 4,
        pointHoverRadius: 6,
        tension: 0.35,
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
        padding: 12,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          label: (context: any) => {
            const idx = context.dataIndex;
            const item = details[idx];
            const amount = Number(item?.amount || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            return [`Amount: ৳${amount}`, `Bidder: ${item?.bidder_username || 'Unknown'}`];
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
          maxRotation: 45,
          minRotation: 0,
          maxTicksLimit: 8,
        },
      },
      y: {
        grid: {
          color: 'rgba(113, 113, 122, 0.1)',
        },
        ticks: {
          color: '#71717a',
          font: { size: 11 },
          callback: (val: any) => `৳${Number(val).toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options as any} />
    </div>
  );
}
