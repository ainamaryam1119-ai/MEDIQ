import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  Package,
  Boxes,
  Banknote,
  AlertOctagon,
  Clock,
  TrendingDown,
  Plus,
  Bot,
  ArrowLeftRight,
  Download,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import type { Medicine, NavSection, StockMovement, ThemeMode } from '../types/pharmacy';
import {
  computeDashboardMetrics,
  exportToCsv,
  formatKarachiTime,
  formatPKR,
  generateReorderRecommendations,
} from '../utils/inventoryEngine';

interface DashboardViewProps {
  medicines: Medicine[];
  movements: StockMovement[];
  theme: ThemeMode;
  onNavigate: (section: NavSection, filterHint?: string) => void;
  onOpenAddMedicine: () => void;
  onAskAiPrompt: (prompt: string) => void;
}

export function DashboardView({
  medicines,
  movements,
  theme,
  onNavigate,
  onOpenAddMedicine,
  onAskAiPrompt,
}: DashboardViewProps) {
  const metrics = useMemo(
    () => computeDashboardMetrics(medicines, movements),
    [medicines, movements]
  );

  const reorders = useMemo(
    () => generateReorderRecommendations(medicines, movements),
    [medicines, movements]
  );

  const isDark = theme === 'dark';
  const gridStroke = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const tooltipBg = isDark ? '#111C2E' : '#FFFFFF';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0';
  const tooltipText = isDark ? '#F8FAFC' : '#0F172A';

  const expiryColors: Record<string, string> = {
    expired: '#EF4444',
    expiring_30: '#F59E0B',
    expiring_60: '#38BDF8',
    expiring_90: '#22D3EE',
    valid: '#10B981',
  };

  const recentMovements = movements.slice(0, 6);

  const handleQuickCsv = () => {
    exportToCsv(
      'mediq-inventory-snapshot.csv',
      [
        'Medicine Name',
        'Generic Name',
        'Category',
        'Batch',
        'Expiry Date',
        'Quantity',
        'Min Threshold',
        'Purchase Price (PKR)',
        'Selling Price (PKR)',
        'Supplier',
      ],
      medicines.map((m) => [
        m.name,
        m.genericName,
        m.category,
        m.batchNumber,
        m.expiryDate,
        m.quantity,
        m.minThreshold,
        m.purchasePrice,
        m.sellingPrice,
        m.supplier,
      ])
    );
  };

  const kpiCards = [
    {
      label: 'Total Medicines',
      value: metrics.totalMedicines.toString(),
      sub: `${metrics.categoryDistribution.length} therapeutic categories`,
      icon: Package,
      accent: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigate('inventory'),
    },
    {
      label: 'Total Stock Quantity',
      value: metrics.totalUnits.toLocaleString('en-PK'),
      sub: 'Active units on shelves',
      icon: Boxes,
      accent: 'text-cyan-600 dark:text-cyan-400',
      onClick: () => onNavigate('stock'),
    },
    {
      label: 'Inventory Value',
      value: formatPKR(metrics.totalSellingValue),
      sub: `Cost basis ${formatPKR(metrics.totalPurchaseValue)}`,
      icon: Banknote,
      accent: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigate('reports'),
    },
    {
      label: 'Expired Batches',
      value: metrics.expiredCount.toString(),
      sub:
        metrics.expiredCount > 0
          ? `${formatPKR(metrics.expiredValueAtRisk)} cost at risk`
          : 'Zero expired batches',
      icon: AlertOctagon,
      accent:
        metrics.expiredCount > 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigate('alerts', 'expired'),
    },
    {
      label: 'Near-Expiry (≤30d)',
      value: metrics.expiring30Count.toString(),
      sub: `${metrics.expiring60Count} more in 31–60 days`,
      icon: Clock,
      accent:
        metrics.expiring30Count > 0
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigate('alerts', 'expiring_30'),
    },
    {
      label: 'Low & Out-of-Stock',
      value: (metrics.lowStockCount + metrics.outOfStockCount).toString(),
      sub: `${metrics.outOfStockCount} out of stock · ${metrics.lowStockCount} low`,
      icon: TrendingDown,
      accent:
        metrics.lowStockCount + metrics.outOfStockCount > 0
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigate('alerts', 'low_stock'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Pharmacy Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time inventory valuation, batch expiry monitoring, and stock movement in PKR (Asia/Karachi).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAddMedicine}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Medicine
          </button>
          <button
            type="button"
            onClick={() => onNavigate('stock')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#17263B] dark:text-slate-200 dark:hover:bg-[#1E314B] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Adjust Stock
          </button>
          <button
            type="button"
            onClick={() => onAskAiPrompt("Give me today's pharmacy summary.")}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Bot className="h-4 w-4" />
            Ask MediQ AI
          </button>
          <button
            type="button"
            onClick={handleQuickCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#17263B] dark:text-slate-200 dark:hover:bg-[#1E314B] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* 6 Interactive KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-emerald-500/40 dark:border-slate-800/80 dark:bg-[#17263B] dark:hover:border-emerald-400/40 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 ${card.accent}`} />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="font-mono text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 tabular-nums">
                  {card.value}
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {card.sub}
              </p>
            </button>
          );
        })}
      </div>

      {/* Charts Row 1: Stock Movement & Expiry Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Stock Movement (Last 14 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inbound restocks vs. outbound dispensing & write-offs
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Inbound
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" />
                Outbound
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.movementSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    color: tooltipText,
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="inbound"
                  name="Inbound Units"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#inboundGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="outbound"
                  name="Outbound Units"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#outboundGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Batch Expiry Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Batches grouped by days remaining
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400 whitespace-nowrap cursor-pointer"
            >
              Inspect alerts
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.expiryOverview} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    color: tooltipText,
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Batches" radius={[6, 6, 0, 0]}>
                  {metrics.expiryOverview.map((entry) => (
                    <Cell key={entry.key} fill={expiryColors[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Category Distribution + AI Operational Insights + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Inventory Distribution by Category
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total stock units across therapeutic classes
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.categoryDistribution.slice(0, 7)}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  width={100}
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    color: tooltipText,
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="totalUnits" name="Units" fill="#10B981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Area */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  MediQ AI Insights
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Live Analysis</span>
            </div>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              <div className="py-3 first:pt-0">
                <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                  <span>Expiry Risk Summary</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {metrics.expiredCount} expired batch(es) and {metrics.expiring30Count} batch(es) expiring within 30 days represent{' '}
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                    {formatPKR(metrics.expiredValueAtRisk + metrics.nearExpiryValueAtRisk)}
                  </span>{' '}
                  in purchase cost.
                </p>
              </div>

              <div className="py-3">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Reorder Priority
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {reorders.length > 0
                    ? `${reorders.length} item(s) are below minimum thresholds, including ${reorders
                        .slice(0, 2)
                        .map((r) => r.medicineName)
                        .join(' and ')}.`
                    : 'All medicine SKUs are currently above minimum stock thresholds.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => onAskAiPrompt('Which products should I reorder?')}
              className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300 transition-colors cursor-pointer"
            >
              Ask Reorder Plan
            </button>
            <button
              type="button"
              onClick={() => onAskAiPrompt('Which medicines are expiring next month?')}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Check Expiring Next Month
            </button>
          </div>
        </div>

        {/* Recent Inventory Activity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Recent Activity
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
            >
              View ledger
            </button>
          </div>

          {recentMovements.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No stock movements recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {recentMovements.map((mov) => (
                <div key={mov.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {mov.medicineName}
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        mov.quantityDelta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{mov.reason}</span>
                    <span className="shrink-0 ml-2 tabular-nums">
                      {formatKarachiTime(mov.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
