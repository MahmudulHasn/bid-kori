'use client';

export type FinancialBreakdownData = {
  gross_paid_volume: string | number;
  platform_revenue: string | number;
  seller_net_total: string | number;
  completed_sales_count: number;
};

export default function FinancialVolumeBar({
  finance,
}: {
  finance?: FinancialBreakdownData;
}) {
  const gross = Number(finance?.gross_paid_volume || 0);
  const revenue = Number(finance?.platform_revenue || 0);
  const sellerNet = Number(finance?.seller_net_total || 0);
  const salesCount = finance?.completed_sales_count || 0;

  const revenuePct = gross > 0 ? ((revenue / gross) * 100).toFixed(1) : '0';
  const sellerPct = gross > 0 ? ((sellerNet / gross) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      {/* Progress Track */}
      <div>
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Settled Sales Allocation</span>
          <span>{salesCount} Completed Transactions</span>
        </div>
        <div className="mt-2 flex h-3.5 w-full overflow-hidden rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800">
          <div
            className="rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${sellerPct}%` }}
            title={`Seller Net: ৳${sellerNet.toLocaleString()} (${sellerPct}%)`}
          />
          <div
            className="rounded-full bg-violet-600 transition-all duration-500"
            style={{ width: `${revenuePct}%` }}
            title={`Platform Fee: ৳${revenue.toLocaleString()} (${revenuePct}%)`}
          />
        </div>
      </div>

      {/* Legend & Amounts */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Gross Paid</span>
          </div>
          <p className="mt-1 text-base font-bold tabular-nums text-zinc-900 dark:text-white">
            ৳{gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-950/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Seller Net ({sellerPct}%)</span>
          </div>
          <p className="mt-1 text-base font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
            ৳{sellerNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-violet-950/40 dark:bg-violet-950/20">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            <span className="text-xs font-medium text-violet-800 dark:text-violet-300">Platform Revenue ({revenuePct}%)</span>
          </div>
          <p className="mt-1 text-base font-bold tabular-nums text-violet-900 dark:text-violet-200">
            ৳{revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  );
}
