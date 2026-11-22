import React, { useMemo, useState } from 'react';
import { Download, Printer, Info } from 'lucide-react';
import type { Medicine, StockMovement } from '../types/pharmacy';
import {
  computeDashboardMetrics,
  daysUntilExpiry,
  exportToCsv,
  formatKarachiTime,
  formatPKR,
  generateReorderRecommendations,
  getExpiryStatus,
  getKarachiTodayStr,
  getStockStatus,
} from '../utils/inventoryEngine';

interface ReportsViewProps {
  medicines: Medicine[];
  movements: StockMovement[];
  pharmacyName: string;
}

type ReportTab = 'inventory' | 'expiry' | 'low_stock' | 'movements';

export function ReportsView({ medicines, movements, pharmacyName }: ReportsViewProps) {
  const [tab, setTab] = useState<ReportTab>('inventory');

  const metrics = useMemo(
    () => computeDashboardMetrics(medicines, movements),
    [medicines, movements]
  );

  const expiryRows = useMemo(
    () =>
      medicines
        .filter((m) => daysUntilExpiry(m.expiryDate) <= 90)
        .sort((a, b) => daysUntilExpiry(a.expiryDate) - daysUntilExpiry(b.expiryDate)),
    [medicines]
  );

  const reorders = useMemo(
    () => generateReorderRecommendations(medicines, movements),
    [medicines, movements]
  );

  const handleExportCsv = () => {
    const today = getKarachiTodayStr();
    if (tab === 'inventory') {
      exportToCsv(
        `mediq-inventory-report-${today}.csv`,
        [
          'Medicine',
          'Generic',
          'Category',
          'Batch',
          'Expiry Date',
          'Qty',
          'Purchase PKR',
          'Selling PKR',
          'Total Retail PKR',
          'Supplier',
        ],
        medicines.map((m) => [
          m.name,
          m.genericName,
          m.category,
          m.batchNumber,
          m.expiryDate,
          m.quantity,
          m.purchasePrice,
          m.sellingPrice,
          m.quantity * m.sellingPrice,
          m.supplier,
        ])
      );
    } else if (tab === 'expiry') {
      exportToCsv(
        `mediq-expiry-report-${today}.csv`,
        ['Medicine', 'Batch', 'Expiry Date', 'Days Remaining', 'Status', 'Qty', 'Cost Risk PKR'],
        expiryRows.map((m) => {
          const d = daysUntilExpiry(m.expiryDate);
          return [
            m.name,
            m.batchNumber,
            m.expiryDate,
            d,
            getExpiryStatus(m.expiryDate),
            m.quantity,
            m.quantity * m.purchasePrice,
          ];
        })
      );
    } else if (tab === 'low_stock') {
      exportToCsv(
        `mediq-reorder-report-${today}.csv`,
        [
          'Medicine',
          'Current Qty',
          'Min Threshold',
          'Suggested Order Qty',
          'Estimated Cost PKR',
          'Method',
          'Supplier',
        ],
        reorders.map((r) => [
          r.medicineName,
          r.currentQuantity,
          r.minThreshold,
          r.recommendedOrderQty,
          r.estimatedCost,
          r.method,
          r.supplier,
        ])
      );
    } else {
      exportToCsv(
        `mediq-stock-movements-${today}.csv`,
        ['Timestamp', 'Medicine', 'Batch', 'Type', 'Delta', 'New Qty', 'Reason'],
        movements.map((m) => [
          m.timestamp,
          m.medicineName,
          m.batchNumber,
          m.type,
          m.quantityDelta,
          m.newQuantity,
          m.reason,
        ])
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Analytics & Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Audit-ready inventory, expiry risk, reorder suggestions, and movement logs with CSV & print export.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#17263B] dark:text-slate-200 dark:hover:bg-[#1E314B] whitespace-nowrap cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5 dark:bg-[#111C2E] no-print">
        {(
          [
            { id: 'inventory', label: 'Inventory Report' },
            { id: 'expiry', label: 'Expiry Report' },
            { id: 'low_stock', label: 'Low-Stock & Reorder Report' },
            { id: 'movements', label: 'Stock Movement Report' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Printable Report Surface */}
      <div className="print-container rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-[#17263B]">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {pharmacyName} —{' '}
              {tab === 'inventory'
                ? 'Inventory Valuation Report'
                : tab === 'expiry'
                  ? 'Expiry Risk Report (≤ 90 Days & Expired)'
                  : tab === 'low_stock'
                    ? 'Low-Stock & Reorder Recommendations'
                    : 'Stock Movement Audit Report'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Generated {getKarachiTodayStr()} (Asia/Karachi) · Currency: PKR
            </p>
          </div>
          <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            Total Retail Value: {formatPKR(metrics.totalSellingValue)}
          </div>
        </div>

        {tab === 'low_stock' && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-800 dark:text-cyan-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
            <span>
              Forecasting transparency: When a medicine has 2+ recorded outbound dispensing events, suggested order quantities factor in recent 14-day movement velocity; otherwise, transparent rule-based threshold targets (2× minimum threshold) are shown.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          {tab === 'inventory' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-3">Medicine</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Batch</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Cost Value</th>
                  <th className="py-2.5 pl-3 text-right">Retail Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {medicines.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {m.name} <span className="font-normal text-slate-400">({m.genericName})</span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{m.category}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{m.batchNumber}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{m.quantity}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatPKR(m.quantity * m.purchasePrice)}
                    </td>
                    <td className="py-2 pl-3 text-right font-mono font-medium tabular-nums">
                      {formatPKR(m.quantity * m.sellingPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'expiry' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-3">Medicine</th>
                  <th className="py-2.5 px-3">Batch</th>
                  <th className="py-2.5 px-3">Expiry Date</th>
                  <th className="py-2.5 px-3 text-right">Days</th>
                  <th className="py-2.5 px-3 text-right">Units</th>
                  <th className="py-2.5 pl-3 text-right">Cost at Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {expiryRows.map((m) => {
                  const d = daysUntilExpiry(m.expiryDate);
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {m.name}
                      </td>
                      <td className="py-2 px-3 font-mono">{m.batchNumber}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">{m.expiryDate}</td>
                      <td
                        className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                          d < 0 ? 'text-red-500' : 'text-amber-500'
                        }`}
                      >
                        {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">{m.quantity}</td>
                      <td className="py-2 pl-3 text-right font-mono tabular-nums">
                        {formatPKR(m.quantity * m.purchasePrice)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === 'low_stock' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-3">Medicine</th>
                  <th className="py-2.5 px-3 text-right">On Hand / Min</th>
                  <th className="py-2.5 px-3 text-right">Order Qty</th>
                  <th className="py-2.5 px-3 text-right">Est. Cost</th>
                  <th className="py-2.5 px-3">Method & Rationale</th>
                  <th className="py-2.5 pl-3">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {reorders.map((r) => (
                  <tr key={r.medicineId}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {r.medicineName}
                      <div className="font-normal text-slate-400">{r.genericName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className={r.currentQuantity === 0 ? 'text-red-500 font-semibold' : 'text-amber-500 font-semibold'}>
                        {r.currentQuantity}
                      </span>{' '}
                      / {r.minThreshold}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {r.recommendedOrderQty}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatPKR(r.estimatedCost)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-xs">
                      <span className="font-medium">
                        {r.method === 'historical-velocity' ? 'Movement Velocity' : 'Rule-Based'}:
                      </span>{' '}
                      {r.rationale}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-600 dark:text-slate-300">{r.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'movements' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-3">Date & Time</th>
                  <th className="py-2.5 px-3">Medicine</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Delta</th>
                  <th className="py-2.5 px-3 text-right">New Qty</th>
                  <th className="py-2.5 pl-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 font-mono tabular-nums text-slate-500">
                      {formatKarachiTime(m.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {m.medicineName} ({m.batchNumber})
                    </td>
                    <td className="py-2 px-3 capitalize">{m.type}</td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                        m.quantityDelta > 0 ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    >
                      {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{m.newQuantity}</td>
                    <td className="py-2 pl-3 text-slate-600 dark:text-slate-300">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
