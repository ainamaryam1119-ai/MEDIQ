import React, { useMemo, useState } from 'react';
import { AlertOctagon, Clock, TrendingDown, Bot, ArrowRight } from 'lucide-react';
import type { AlertCategory, Medicine } from '../types/pharmacy';
import { formatPKR, generateAlerts } from '../utils/inventoryEngine';

interface ExpiryAlertsViewProps {
  medicines: Medicine[];
  initialCategory?: string;
  onJumpToStock: (medicineId: string) => void;
  onAskAi: (prompt: string) => void;
}

const TABS: Array<{ id: 'all' | AlertCategory; label: string }> = [
  { id: 'all', label: 'All Alerts' },
  { id: 'expired', label: 'Expired' },
  { id: 'expiring_30', label: 'Expiring ≤ 30d' },
  { id: 'expiring_60', label: '31–60 Days' },
  { id: 'expiring_90', label: '61–90 Days' },
  { id: 'out_of_stock', label: 'Out of Stock' },
  { id: 'low_stock', label: 'Low Stock' },
];

export function ExpiryAlertsView({
  medicines,
  initialCategory = 'all',
  onJumpToStock,
  onAskAi,
}: ExpiryAlertsViewProps) {
  const [activeTab, setActiveTab] = useState<'all' | AlertCategory>(
    (initialCategory as 'all' | AlertCategory) || 'all'
  );

  React.useEffect(() => {
    if (initialCategory) {
      setActiveTab(initialCategory as 'all' | AlertCategory);
    }
  }, [initialCategory]);

  const allAlerts = useMemo(() => generateAlerts(medicines), [medicines]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return allAlerts;
    return allAlerts.filter((a) => a.category === activeTab);
  }, [allAlerts, activeTab]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allAlerts.length };
    for (const a of allAlerts) {
      map[a.category] = (map[a.category] || 0) + 1;
    }
    return map;
  }, [allAlerts]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Smart Expiry & Stock Alerts
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Calculated live from stored expiry dates (Asia/Karachi) and minimum stock thresholds.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onAskAi('Which medicines are expired or expiring within 30 days, and what should I reorder?')
          }
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300 whitespace-nowrap cursor-pointer"
        >
          <Bot className="h-4 w-4" />
          Summarize Risks with AI
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1.5 dark:bg-[#111C2E]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label} ({counts[tab.id] || 0})
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#17263B]">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
            No alerts in this category.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filtered.map((alert) => {
              const Icon =
                alert.category === 'expired' || alert.category === 'out_of_stock'
                  ? AlertOctagon
                  : alert.category === 'low_stock'
                    ? TrendingDown
                    : Clock;

              const colorClass =
                alert.severity === 'critical'
                  ? 'text-red-600 dark:text-red-400'
                  : alert.severity === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-cyan-600 dark:text-cyan-400';

              const categoryLabel =
                alert.category === 'expired'
                  ? 'Expired'
                  : alert.category === 'expiring_30'
                    ? 'Expiring ≤ 30d'
                    : alert.category === 'expiring_60'
                      ? 'Expiring 31–60d'
                      : alert.category === 'expiring_90'
                        ? 'Expiring 61–90d'
                        : alert.category === 'out_of_stock'
                          ? 'Out of Stock'
                          : 'Low Stock';

              return (
                <div
                  key={alert.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/70 dark:hover:bg-[#1E314B]/40"
                >
                  <div className="flex items-start gap-3.5">
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${colorClass}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {alert.title}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className={`text-xs font-medium ${colorClass}`}>
                          {categoryLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        {alert.detail}
                        {alert.valueAtRisk > 0 && ` · Cost value at risk: ${formatPKR(alert.valueAtRisk)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onJumpToStock(alert.medicineId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      Adjust Stock
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
