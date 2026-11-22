import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, AlertCircle, Search } from 'lucide-react';
import type { Medicine, StockMovement, StockMovementType } from '../types/pharmacy';
import { formatKarachiTime, getStockStatus } from '../utils/inventoryEngine';

interface StockManagementViewProps {
  medicines: Medicine[];
  movements: StockMovement[];
  preselectedMedicineId?: string | null;
  onRecordMovement: (params: {
    medicineId: string;
    type: StockMovementType;
    quantity: number;
    reason: string;
  }) => void;
}

export function StockManagementView({
  medicines,
  movements,
  preselectedMedicineId,
  onRecordMovement,
}: StockManagementViewProps) {
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>(
    preselectedMedicineId || medicines[0]?.id || ''
  );
  const [movementType, setMovementType] = useState<StockMovementType>('in');
  const [quantity, setQuantity] = useState<string>('10');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StockMovementType>('all');

  React.useEffect(() => {
    if (preselectedMedicineId) {
      setSelectedMedicineId(preselectedMedicineId);
    } else if (!selectedMedicineId && medicines[0]) {
      setSelectedMedicineId(medicines[0].id);
    }
  }, [preselectedMedicineId, medicines, selectedMedicineId]);

  const selectedMed = medicines.find((m) => m.id === selectedMedicineId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedMed) {
      setError('Please select a valid medicine.');
      return;
    }

    const qtyNum = Number(quantity);
    if (Number.isNaN(qtyNum) || qtyNum <= 0) {
      setError('Enter a positive quantity greater than 0.');
      return;
    }

    if ((movementType === 'out' || movementType === 'writeoff') && qtyNum > selectedMed.quantity) {
      setError(`Cannot deduct ${qtyNum} units; only ${selectedMed.quantity} units available.`);
      return;
    }

    const defaultReason =
      movementType === 'in'
        ? 'Supplier restock received'
        : movementType === 'out'
          ? 'Prescription / counter dispensing'
          : movementType === 'writeoff'
            ? 'Expired / damaged stock write-off'
            : 'Physical stock count adjustment';

    onRecordMovement({
      medicineId: selectedMed.id,
      type: movementType,
      quantity: qtyNum,
      reason: reason.trim() || defaultReason,
    });

    setSuccessMsg(
      `Recorded ${movementType.toUpperCase()} for ${selectedMed.name} (${qtyNum} units).`
    );
    setReason('');
  };

  const filteredMovements = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.medicineName.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        m.reason.toLowerCase().includes(q)
      );
    });
  }, [movements, ledgerSearch, typeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Stock Management
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Record incoming restocks, counter dispensing, expired write-offs, and physical audit adjustments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Stock Movement Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Record Stock Movement
          </h2>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Select Medicine
              </label>
              <select
                value={selectedMedicineId}
                onChange={(e) => setSelectedMedicineId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
              >
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.batchNumber}) — {m.quantity} units
                  </option>
                ))}
              </select>
            </div>

            {selectedMed && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-[#111C2E]">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Current Stock: </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {selectedMed.quantity} units
                  </span>
                </div>
                <span
                  className={
                    getStockStatus(selectedMed) === 'out_of_stock'
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : getStockStatus(selectedMed) === 'low_stock'
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  }
                >
                  Min: {selectedMed.minThreshold}
                </span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Movement Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'in', label: 'Stock In (+)' },
                    { id: 'out', label: 'Dispense (-)' },
                    { id: 'writeoff', label: 'Write-off (-)' },
                    { id: 'adjustment', label: 'Set Exact Qty' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMovementType(t.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      movementType === t.id
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {movementType === 'adjustment' ? 'New Total Quantity' : 'Quantity (Units)'}
              </label>
              <input
                type="number"
                min={movementType === 'adjustment' ? 0 : 1}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reference / Reason
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., PO #4418 received, daily dispensing, expired quarantine"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={medicines.length === 0}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              Update Stock & Log Movement
            </button>
          </form>
        </div>

        {/* Stock Movement Ledger */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B] lg:col-span-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Stock Movement Ledger
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Filter movements…"
                  className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | StockMovementType)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
              >
                <option value="all">All Types</option>
                <option value="in">Stock In</option>
                <option value="out">Dispensed</option>
                <option value="writeoff">Write-off</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {filteredMovements.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                No stock movements match your filter.
              </p>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Medicine</th>
                    <th className="py-2.5 px-3 font-medium">Type</th>
                    <th className="py-2.5 px-3 font-medium text-right">Delta</th>
                    <th className="py-2.5 px-3 font-medium text-right">New Qty</th>
                    <th className="py-2.5 pl-3 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/70 dark:hover:bg-[#1E314B]/40">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {mov.medicineName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {mov.batchNumber} · {mov.reason}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 capitalize text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          {mov.quantityDelta > 0 ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {mov.type}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${
                          mov.quantityDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                        {mov.newQuantity}
                      </td>
                      <td className="py-2.5 pl-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatKarachiTime(mov.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
