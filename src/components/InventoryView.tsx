import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowUpDown,
  X,
  AlertCircle,
} from 'lucide-react';
import type {
  DosageForm,
  Medicine,
  MedicineCategory,
  Supplier,
} from '../types/pharmacy';
import {
  daysUntilExpiry,
  formatPKR,
  getExpiryStatus,
  getStockStatus,
} from '../utils/inventoryEngine';

interface InventoryViewProps {
  medicines: Medicine[];
  suppliers: Supplier[];
  initialSearch?: string;
  showAddModalSignal: number;
  onSaveMedicine: (medicine: Medicine, isEdit: boolean) => void;
  onDeleteMedicine: (id: string) => void;
  onRemoveDemoData: () => void;
}

const CATEGORIES: MedicineCategory[] = [
  'Analgesics',
  'Antibiotics',
  'Cardiovascular',
  'Gastrointestinal',
  'Antidiabetics',
  'Respiratory',
  'Vitamins & Supplements',
  'Dermatology',
  'Pediatrics',
  'Antihistamines',
];

const DOSAGE_FORMS: DosageForm[] = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Cream',
  'Inhaler',
  'Drops',
  'Sachet',
];

type SortKey = 'name' | 'expiryDate' | 'quantity';

interface MedicineFormState {
  id: string;
  name: string;
  genericName: string;
  category: MedicineCategory;
  manufacturer: string;
  strength: string;
  dosageForm: DosageForm;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  minThreshold: string;
  purchasePrice: string;
  sellingPrice: string;
  supplier: string;
}

function createEmptyForm(suppliers: Supplier[]): MedicineFormState {
  return {
    id: '',
    name: '',
    genericName: '',
    category: 'Analgesics',
    manufacturer: '',
    strength: '',
    dosageForm: 'Tablet',
    batchNumber: '',
    expiryDate: '',
    quantity: '0',
    minThreshold: '15',
    purchasePrice: '0',
    sellingPrice: '0',
    supplier: suppliers[0]?.name ?? 'Searle Pakistan Distributors',
  };
}

export function InventoryView({
  medicines,
  suppliers,
  initialSearch = '',
  showAddModalSignal,
  onSaveMedicine,
  onDeleteMedicine,
  onRemoveDemoData,
}: InventoryViewProps) {
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<MedicineFormState>(() => createEmptyForm(suppliers));
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Medicine | null>(null);

  React.useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  React.useEffect(() => {
    if (showAddModalSignal > 0) {
      openAddModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModalSignal]);

  const hasDemoRecords = medicines.some((m) => m.isDemo);

  const openAddModal = () => {
    setIsEditing(false);
    setForm(createEmptyForm(suppliers));
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (med: Medicine) => {
    setIsEditing(true);
    setForm({
      id: med.id,
      name: med.name,
      genericName: med.genericName,
      category: med.category,
      manufacturer: med.manufacturer,
      strength: med.strength,
      dosageForm: med.dosageForm,
      batchNumber: med.batchNumber,
      expiryDate: med.expiryDate,
      quantity: String(med.quantity),
      minThreshold: String(med.minThreshold),
      purchasePrice: String(med.purchasePrice),
      sellingPrice: String(med.sellingPrice),
      supplier: med.supplier,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return medicines
      .filter((m) => {
        if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
        if (statusFilter === 'low_stock' && getStockStatus(m) === 'adequate') return false;
        if (statusFilter === 'expired' && getExpiryStatus(m.expiryDate) !== 'expired') return false;
        if (
          statusFilter === 'expiring_soon' &&
          !['expiring_30', 'expiring_60', 'expiring_90'].includes(getExpiryStatus(m.expiryDate))
        ) {
          return false;
        }
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.batchNumber.toLowerCase().includes(q) ||
          m.manufacturer.toLowerCase().includes(q) ||
          m.supplier.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'expiryDate') cmp = a.expiryDate.localeCompare(b.expiryDate);
        else cmp = a.quantity - b.quantity;
        return sortAsc ? cmp : -cmp;
      });
  }, [medicines, search, categoryFilter, statusFilter, sortKey, sortAsc]);

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.genericName.trim() || !form.batchNumber.trim() || !form.expiryDate) {
      setFormError('Please fill in medicine name, generic name, batch number, and expiry date.');
      return;
    }

    const quantity = Number(form.quantity);
    const minThreshold = Number(form.minThreshold);
    const purchasePrice = Number(form.purchasePrice);
    const sellingPrice = Number(form.sellingPrice);

    if (
      Number.isNaN(quantity) ||
      quantity < 0 ||
      Number.isNaN(minThreshold) ||
      minThreshold < 0 ||
      Number.isNaN(purchasePrice) ||
      purchasePrice < 0 ||
      Number.isNaN(sellingPrice) ||
      sellingPrice < 0
    ) {
      setFormError('Quantities and PKR prices must be valid non-negative numbers.');
      return;
    }

    const saved: Medicine = {
      id: isEditing ? form.id : `med-${Date.now()}`,
      name: form.name.trim(),
      genericName: form.genericName.trim(),
      category: form.category,
      manufacturer: form.manufacturer.trim() || 'Standard Pharma',
      strength: form.strength.trim() || 'Standard',
      dosageForm: form.dosageForm,
      batchNumber: form.batchNumber.trim(),
      expiryDate: form.expiryDate,
      quantity,
      minThreshold,
      purchasePrice,
      sellingPrice,
      supplier: form.supplier.trim() || 'Direct Supplier',
      isDemo: false,
      updatedAt: new Date().toISOString(),
    };

    onSaveMedicine(saved, isEditing);
    setModalOpen(false);
  };

  const supplierOptions = Array.from(
    new Set([
      ...suppliers.map((s) => s.name),
      ...medicines.map((m) => m.supplier),
    ])
  ).filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Medicine Inventory
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {medicines.length} total SKUs · Manage batches, expiry dates, thresholds, and PKR pricing
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasDemoRecords && (
            <button
              type="button"
              onClick={onRemoveDemoData}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#17263B] dark:text-slate-300 dark:hover:bg-[#1E314B] whitespace-nowrap cursor-pointer"
            >
              Remove Demo Data
            </button>
          )}
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Medicine
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-[#17263B] md:grid-cols-12">
        <div className="relative md:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by medicine, generic, batch, or supplier…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
          />
        </div>

        <div className="md:col-span-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
          >
            <option value="all">All Statuses</option>
            <option value="low_stock">Low / Out of Stock</option>
            <option value="expiring_soon">Expiring ≤ 90d</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-end text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Showing {filtered.length} of {medicines.length}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#17263B]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No matching medicines found
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Adjust your search filters or add a new medicine record to your pharmacy inventory.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add First Medicine
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-400">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Medicine & Formula
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">Category · Form</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('expiryDate')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Expiry
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('quantity')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Stock
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Buy / Sell (PKR)</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filtered.map((med) => {
                  const days = daysUntilExpiry(med.expiryDate);
                  const expStatus = getExpiryStatus(med.expiryDate);
                  const stockStatus = getStockStatus(med);

                  return (
                    <tr
                      key={med.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-[#1E314B]/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {med.name}
                          </span>
                          {med.isDemo && (
                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {med.genericName} · {med.strength} · {med.manufacturer}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        <div>{med.category}</div>
                        <div className="text-slate-400">{med.dosageForm}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                        {med.batchNumber}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        <div className="font-mono text-slate-800 dark:text-slate-200">
                          {med.expiryDate}
                        </div>
                        <div
                          className={
                            expStatus === 'expired'
                              ? 'font-medium text-red-600 dark:text-red-400'
                              : expStatus === 'expiring_30' || expStatus === 'expiring_60'
                                ? 'font-medium text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {days < 0 ? `Expired (${Math.abs(days)}d ago)` : `${days}d remaining`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div
                          className={`font-mono font-semibold ${
                            stockStatus === 'out_of_stock'
                              ? 'text-red-600 dark:text-red-400'
                              : stockStatus === 'low_stock'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {med.quantity}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {stockStatus === 'out_of_stock'
                            ? 'Out of stock'
                            : stockStatus === 'low_stock'
                              ? `Low (min ${med.minThreshold})`
                              : `Min ${med.minThreshold}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <div className="text-slate-800 dark:text-slate-200">
                          {formatPKR(med.sellingPrice)}
                        </div>
                        <div className="text-slate-400">
                          Cost {formatPKR(med.purchasePrice)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate">
                        {med.supplier}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(med)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                            aria-label={`Edit ${med.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(med)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400 cursor-pointer"
                            aria-label={`Delete ${med.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Medicine Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {isEditing ? 'Edit Medicine Record' : 'Add New Medicine'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Medicine Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Panadol Extra"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Generic Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.genericName}
                  onChange={(e) => setForm({ ...form, genericName: e.target.value })}
                  placeholder="e.g., Paracetamol + Caffeine"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as MedicineCategory })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                  placeholder="e.g., GSK Pakistan"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Strength
                </label>
                <input
                  type="text"
                  value={form.strength}
                  onChange={(e) => setForm({ ...form, strength: e.target.value })}
                  placeholder="e.g., 500mg"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Dosage Form
                </label>
                <select
                  value={form.dosageForm}
                  onChange={(e) => setForm({ ...form, dosageForm: e.target.value as DosageForm })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                >
                  {DOSAGE_FORMS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Batch Number *
                </label>
                <input
                  type="text"
                  required
                  value={form.batchNumber}
                  onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                  placeholder="e.g., PK-26A104"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Expiry Date *
                </label>
                <input
                  type="date"
                  required
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Quantity in Stock *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minimum Stock Threshold *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={form.minThreshold}
                  onChange={(e) => setForm({ ...form, minThreshold: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Purchase Price (PKR) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Selling Price (PKR) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Supplier
                </label>
                <input
                  type="text"
                  list="supplier-datalist"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="Select or type supplier name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
                <datalist id="supplier-datalist">
                  {supplierOptions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 cursor-pointer"
                >
                  {isEditing ? 'Save Changes' : 'Add Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Delete Medicine Record?
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to remove <span className="font-medium text-slate-900 dark:text-slate-100">{deleteTarget.name}</span> (Batch {deleteTarget.batchNumber}) from inventory? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMedicine(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 cursor-pointer"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
