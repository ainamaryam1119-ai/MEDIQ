import React, { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { Medicine, Supplier } from '../types/pharmacy';
import { formatPKR, getStockStatus } from '../utils/inventoryEngine';

interface SuppliersViewProps {
  suppliers: Supplier[];
  medicines: Medicine[];
  onSaveSupplier: (supplier: Supplier, isEdit: boolean) => void;
  onDeleteSupplier: (id: string) => void;
  onInspectSupplierMedicines: (supplierName: string) => void;
}

export function SuppliersView({
  suppliers,
  medicines,
  onSaveSupplier,
  onDeleteSupplier,
  onInspectSupplierMedicines,
}: SuppliersViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Karachi');
  const [leadTimeDays, setLeadTimeDays] = useState('3');
  const [notes, setNotes] = useState('');

  // Send Order modal state
  const [orderTarget, setOrderTarget] = useState<Supplier | null>(null);
  const [orderEmail, setOrderEmail] = useState('');
  const [orderMessage, setOrderMessage] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setCity('Karachi');
    setLeadTimeDays('3');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (sup: Supplier) => {
    setEditing(sup);
    setName(sup.name);
    setContactPerson(sup.contactPerson);
    setPhone(sup.phone);
    setEmail(sup.email);
    setCity(sup.city);
    setLeadTimeDays(String(sup.leadTimeDays));
    setNotes(sup.notes || '');
    setModalOpen(true);
  };

  const openSendOrder = (sup: Supplier) => {
    const lowItems = medicines.filter(
      (m) => m.supplier === sup.name && getStockStatus(m) !== 'adequate'
    );
    const defaultDraft =
      lowItems.length > 0
        ? `Purchase Order Request for ${sup.name}:\n` +
          lowItems
            .map(
              (m) =>
                `- ${m.name} (${m.strength}, Batch ref ${m.batchNumber}): Need ${Math.max(10, m.minThreshold * 2 - m.quantity)} units (Current: ${m.quantity})`
            )
            .join('\n')
        : `Purchase Order Inquiry for ${sup.name}: Please confirm current stock availability and delivery schedule.`;

    setOrderTarget(sup);
    setOrderEmail(sup.email && sup.email !== 'N/A' ? sup.email : '');
    setOrderMessage(defaultDraft.slice(0, 1000));
    setOrderResult(null);
    setOrderSubmitting(false);
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTarget || orderSubmitting) return;

    setOrderResult(null);
    setOrderSubmitting(true);

    try {
      const response = await fetch('/api/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierEmail: orderEmail.trim(),
          supplierName: orderTarget.name,
          message: orderMessage.trim(),
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string };
      setOrderResult({
        success: Boolean(response.ok && data.success),
        message:
          data.message ||
          (response.ok
            ? 'Order request sent successfully.'
            : 'Unable to send order request. Please check your details.'),
      });
    } catch {
      setOrderResult({
        success: false,
        message: 'Network error while contacting the server. Please try again.',
      });
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const saved: Supplier = {
      id: editing ? editing.id : `sup-${Date.now()}`,
      name: name.trim(),
      contactPerson: contactPerson.trim() || 'Account Representative',
      phone: phone.trim() || 'N/A',
      email: email.trim() || 'N/A',
      city: city.trim() || 'Pakistan',
      leadTimeDays: Math.max(1, Number(leadTimeDays) || 3),
      notes: notes.trim(),
      isDemo: false,
    };
    onSaveSupplier(saved, Boolean(editing));
    setModalOpen(false);
  };

  const supplierStats = useMemo(() => {
    const map = new Map<string, { skuCount: number; totalUnits: number; totalCost: number }>();
    for (const m of medicines) {
      const prev = map.get(m.supplier) ?? { skuCount: 0, totalUnits: 0, totalCost: 0 };
      map.set(m.supplier, {
        skuCount: prev.skuCount + 1,
        totalUnits: prev.totalUnits + m.quantity,
        totalCost: prev.totalCost + m.quantity * m.purchasePrice,
      });
    }
    return map;
  }, [medicines]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Suppliers & Distributors
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {suppliers.length} registered distributors supplying active pharmacy batches.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {suppliers.map((sup) => {
          const stats = supplierStats.get(sup.name) ?? {
            skuCount: 0,
            totalUnits: 0,
            totalCost: 0,
          };

          return (
            <div
              key={sup.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#17263B]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                      {sup.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Contact: {sup.contactPerson}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(sup)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                      aria-label={`Edit ${sup.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSupplier(sup.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                      aria-label={`Delete ${sup.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono tabular-nums">{sup.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span className="truncate">{sup.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {sup.city}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {sup.leadTimeDays}d lead time
                    </span>
                  </div>
                </div>

                {sup.notes && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {sup.notes}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
                <div className="text-slate-600 dark:text-slate-400 tabular-nums">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {stats.skuCount}
                  </span>{' '}
                  SKUs ·{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {formatPKR(stats.totalCost)}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => openSendOrder(sup)}
                    className="inline-flex items-center gap-1 font-medium text-cyan-600 hover:underline dark:text-cyan-400 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="h-3 w-3" />
                    Send Order
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectSupplierMedicines(sup.name)}
                    className="font-medium text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer whitespace-nowrap"
                  >
                    View medicines
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Send Supplier Order Modal */}
      {orderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Send Purchase Order
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {orderTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderTarget(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close order modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {orderResult && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                  orderResult.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
                }`}
              >
                {orderResult.success ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                )}
                <span>{orderResult.message}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSendOrder(e)} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Supplier Email *
                </label>
                <input
                  type="email"
                  required
                  value={orderEmail}
                  onChange={(e) => setOrderEmail(e.target.value)}
                  placeholder="orders@supplier.pk"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Order Message *
                  </label>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {orderMessage.length} / 1000
                  </span>
                </div>
                <textarea
                  rows={5}
                  required
                  maxLength={1000}
                  value={orderMessage}
                  onChange={(e) => setOrderMessage(e.target.value)}
                  placeholder="Enter medicines, batch notes, and quantities to request…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrderTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={orderSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {orderSubmitting ? 'Sending…' : 'Send Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Supplier Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {editing ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                  />
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Lead Time (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                  />
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 cursor-pointer"
                >
                  {editing ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
