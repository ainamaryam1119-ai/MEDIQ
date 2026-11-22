import type {
  AlertItem,
  ExpiryStatus,
  Medicine,
  ReorderRecommendation,
  StockMovement,
  StockStatus,
} from '../types/pharmacy';

export function getKarachiTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatKarachiTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('en-PK', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatPKR(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function daysUntilExpiry(expiryDate: string): number {
  const todayStr = getKarachiTodayStr();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [ey, em, ed] = expiryDate.split('-').map(Number);
  if (!ey || !em || !ed) return 9999;
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const expUtc = Date.UTC(ey, em - 1, ed);
  return Math.round((expUtc - todayUtc) / 86_400_000);
}

export function getExpiryStatus(expiryDate: string): ExpiryStatus {
  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_30';
  if (days <= 60) return 'expiring_60';
  if (days <= 90) return 'expiring_90';
  return 'valid';
}

export function getStockStatus(medicine: Pick<Medicine, 'quantity' | 'minThreshold'>): StockStatus {
  if (medicine.quantity <= 0) return 'out_of_stock';
  if (medicine.quantity <= medicine.minThreshold) return 'low_stock';
  return 'adequate';
}

export interface DashboardMetrics {
  totalMedicines: number;
  totalUnits: number;
  totalPurchaseValue: number;
  totalSellingValue: number;
  expiredCount: number;
  expiring30Count: number;
  expiring60Count: number;
  expiring90Count: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredValueAtRisk: number;
  nearExpiryValueAtRisk: number;
  categoryDistribution: Array<{
    category: string;
    shortName: string;
    skuCount: number;
    totalUnits: number;
    valuePKR: number;
  }>;
  expiryOverview: Array<{
    bucket: string;
    key: ExpiryStatus;
    count: number;
    units: number;
  }>;
  movementSeries: Array<{
    date: string;
    label: string;
    inbound: number;
    outbound: number;
  }>;
}

export function computeDashboardMetrics(
  medicines: Medicine[],
  movements: StockMovement[]
): DashboardMetrics {
  let totalUnits = 0;
  let totalPurchaseValue = 0;
  let totalSellingValue = 0;
  let expiredCount = 0;
  let expiring30Count = 0;
  let expiring60Count = 0;
  let expiring90Count = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let expiredValueAtRisk = 0;
  let nearExpiryValueAtRisk = 0;

  const categoryMap = new Map<
    string,
    { skuCount: number; totalUnits: number; valuePKR: number }
  >();

  const expiryBuckets: Record<ExpiryStatus, { count: number; units: number }> = {
    expired: { count: 0, units: 0 },
    expiring_30: { count: 0, units: 0 },
    expiring_60: { count: 0, units: 0 },
    expiring_90: { count: 0, units: 0 },
    valid: { count: 0, units: 0 },
  };

  for (const med of medicines) {
    totalUnits += med.quantity;
    const purchaseVal = med.quantity * med.purchasePrice;
    const sellingVal = med.quantity * med.sellingPrice;
    totalPurchaseValue += purchaseVal;
    totalSellingValue += sellingVal;

    const expStatus = getExpiryStatus(med.expiryDate);
    expiryBuckets[expStatus].count += 1;
    expiryBuckets[expStatus].units += med.quantity;

    if (expStatus === 'expired') {
      expiredCount += 1;
      expiredValueAtRisk += purchaseVal;
    } else if (expStatus === 'expiring_30') {
      expiring30Count += 1;
      nearExpiryValueAtRisk += purchaseVal;
    } else if (expStatus === 'expiring_60') {
      expiring60Count += 1;
    } else if (expStatus === 'expiring_90') {
      expiring90Count += 1;
    }

    const stockStatus = getStockStatus(med);
    if (stockStatus === 'out_of_stock') {
      outOfStockCount += 1;
    } else if (stockStatus === 'low_stock') {
      lowStockCount += 1;
    }

    const prev = categoryMap.get(med.category) ?? {
      skuCount: 0,
      totalUnits: 0,
      valuePKR: 0,
    };
    categoryMap.set(med.category, {
      skuCount: prev.skuCount + 1,
      totalUnits: prev.totalUnits + med.quantity,
      valuePKR: prev.valuePKR + sellingVal,
    });
  }

  const categoryDistribution = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      shortName: category.length > 14 ? `${category.slice(0, 12)}…` : category,
      ...stats,
    }))
    .sort((a, b) => b.totalUnits - a.totalUnits);

  const expiryOverview: DashboardMetrics['expiryOverview'] = [
    { bucket: 'Expired', key: 'expired', ...expiryBuckets.expired },
    { bucket: '≤ 30 Days', key: 'expiring_30', ...expiryBuckets.expiring_30 },
    { bucket: '31–60 Days', key: 'expiring_60', ...expiryBuckets.expiring_60 },
    { bucket: '61–90 Days', key: 'expiring_90', ...expiryBuckets.expiring_90 },
    { bucket: '> 90 Days', key: 'valid', ...expiryBuckets.valid },
  ];

  // Build 14-day stock movement series in Asia/Karachi
  const todayStr = getKarachiTodayStr();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const seriesMap = new Map<string, { label: string; inbound: number; outbound: number }>();

  for (let i = 13; i >= 0; i--) {
    const dt = new Date(todayUtc - i * 86_400_000);
    const isoDate = dt.toISOString().slice(0, 10);
    const label = dt.toLocaleDateString('en-PK', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    seriesMap.set(isoDate, { label, inbound: 0, outbound: 0 });
  }

  for (const mov of movements) {
    const movDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(mov.timestamp));
    const entry = seriesMap.get(movDate);
    if (entry) {
      if (mov.quantityDelta > 0) {
        entry.inbound += mov.quantityDelta;
      } else if (mov.quantityDelta < 0) {
        entry.outbound += Math.abs(mov.quantityDelta);
      }
    }
  }

  const movementSeries = Array.from(seriesMap.entries()).map(([date, vals]) => ({
    date,
    ...vals,
  }));

  return {
    totalMedicines: medicines.length,
    totalUnits,
    totalPurchaseValue,
    totalSellingValue,
    expiredCount,
    expiring30Count,
    expiring60Count,
    expiring90Count,
    lowStockCount,
    outOfStockCount,
    expiredValueAtRisk,
    nearExpiryValueAtRisk,
    categoryDistribution,
    expiryOverview,
    movementSeries,
  };
}

export function generateAlerts(medicines: Medicine[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const med of medicines) {
    const days = daysUntilExpiry(med.expiryDate);
    const expStatus = getExpiryStatus(med.expiryDate);
    const stockStatus = getStockStatus(med);
    const valueAtRisk = med.quantity * med.purchasePrice;

    if (expStatus === 'expired') {
      alerts.push({
        id: `alert-exp-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'expired',
        severity: 'critical',
        title: `${med.name} batch expired`,
        detail: `Batch ${med.batchNumber} expired ${Math.abs(days)} day(s) ago (${med.expiryDate}) · ${med.quantity} units`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk,
      });
    } else if (expStatus === 'expiring_30') {
      alerts.push({
        id: `alert-exp30-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'expiring_30',
        severity: 'warning',
        title: `${med.name} expires in ${days}d`,
        detail: `Batch ${med.batchNumber} expires on ${med.expiryDate} · ${med.quantity} units`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk,
      });
    } else if (expStatus === 'expiring_60') {
      alerts.push({
        id: `alert-exp60-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'expiring_60',
        severity: 'warning',
        title: `${med.name} expires in ${days}d`,
        detail: `Batch ${med.batchNumber} expires on ${med.expiryDate} · ${med.quantity} units`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk,
      });
    } else if (expStatus === 'expiring_90') {
      alerts.push({
        id: `alert-exp90-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'expiring_90',
        severity: 'info',
        title: `${med.name} expires in ${days}d`,
        detail: `Batch ${med.batchNumber} expires on ${med.expiryDate} · ${med.quantity} units`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk,
      });
    }

    if (stockStatus === 'out_of_stock') {
      alerts.push({
        id: `alert-oos-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'out_of_stock',
        severity: 'critical',
        title: `${med.name} out of stock`,
        detail: `0 units remaining (minimum threshold: ${med.minThreshold}) · Supplier: ${med.supplier}`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk: 0,
      });
    } else if (stockStatus === 'low_stock') {
      alerts.push({
        id: `alert-low-${med.id}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        category: 'low_stock',
        severity: 'warning',
        title: `${med.name} low stock (${med.quantity} left)`,
        detail: `Below minimum threshold of ${med.minThreshold} units · Supplier: ${med.supplier}`,
        daysUntilExpiry: days,
        quantity: med.quantity,
        valueAtRisk: 0,
      });
    }
  }

  const priorityOrder: Record<AlertItem['category'], number> = {
    expired: 0,
    out_of_stock: 1,
    expiring_30: 2,
    low_stock: 3,
    expiring_60: 4,
    expiring_90: 5,
  };

  return alerts.sort((a, b) => priorityOrder[a.category] - priorityOrder[b.category]);
}

export function generateReorderRecommendations(
  medicines: Medicine[],
  movements: StockMovement[]
): ReorderRecommendation[] {
  const recommendations: ReorderRecommendation[] = [];

  for (const med of medicines) {
    const stockStatus = getStockStatus(med);
    if (stockStatus === 'adequate') continue;

    // Check historical outbound movement for this medicine in last 14 days
    const outboundMovements = movements.filter(
      (m) => m.medicineId === med.id && m.type === 'out' && m.quantityDelta < 0
    );

    const totalOutbound = outboundMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantityDelta),
      0
    );

    const hasVelocityData = outboundMovements.length >= 2 && totalOutbound > 0;
    const targetLevel = hasVelocityData
      ? Math.max(med.minThreshold * 2, Math.ceil((totalOutbound / 14) * 30))
      : med.minThreshold * 2;

    const recommendedOrderQty = Math.max(10, targetLevel - med.quantity);

    recommendations.push({
      medicineId: med.id,
      medicineName: med.name,
      genericName: med.genericName,
      supplier: med.supplier,
      currentQuantity: med.quantity,
      minThreshold: med.minThreshold,
      recommendedOrderQty,
      estimatedCost: recommendedOrderQty * med.purchasePrice,
      method: hasVelocityData ? 'historical-velocity' : 'rule-based',
      rationale: hasVelocityData
        ? `Based on ${totalOutbound} units dispensed across ${outboundMovements.length} recorded outbound events.`
        : `Rule-based threshold suggestion (2× min threshold of ${med.minThreshold}; insufficient historical movement logs for velocity forecasting).`,
      urgency: med.quantity === 0 ? 'immediate' : 'soon',
    });
  }

  return recommendations.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === 'immediate' ? -1 : 1;
    return a.currentQuantity - b.currentQuantity;
  });
}

export function buildVerifiedInventorySnapshot(
  medicines: Medicine[],
  movements: StockMovement[]
) {
  const metrics = computeDashboardMetrics(medicines, movements);
  const reorders = generateReorderRecommendations(medicines, movements);

  return {
    asOfDateKarachi: getKarachiTodayStr(),
    currency: 'PKR',
    summary: {
      totalMedicineSKUs: metrics.totalMedicines,
      totalUnitsInStock: metrics.totalUnits,
      totalPurchaseCostPKR: Math.round(metrics.totalPurchaseValue),
      totalRetailValuePKR: Math.round(metrics.totalSellingValue),
      expiredBatchesCount: metrics.expiredCount,
      expiringWithin30DaysCount: metrics.expiring30Count,
      expiringWithin60DaysCount: metrics.expiring60Count,
      expiringWithin90DaysCount: metrics.expiring90Count,
      lowStockCount: metrics.lowStockCount,
      outOfStockCount: metrics.outOfStockCount,
    },
    reorderRecommendations: reorders.slice(0, 12),
    medicines: medicines.map((m) => ({
      name: m.name,
      genericName: m.genericName,
      category: m.category,
      strength: m.strength,
      dosageForm: m.dosageForm,
      batchNumber: m.batchNumber,
      expiryDate: m.expiryDate,
      daysUntilExpiry: daysUntilExpiry(m.expiryDate),
      expiryStatus: getExpiryStatus(m.expiryDate),
      quantity: m.quantity,
      minThreshold: m.minThreshold,
      stockStatus: getStockStatus(m),
      purchasePricePKR: m.purchasePrice,
      sellingPricePKR: m.sellingPrice,
      supplier: m.supplier,
      isDemo: Boolean(m.isDemo),
    })),
  };
}

export function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (cell: string | number) => {
    let str = String(cell ?? '');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join(
      '\n'
    );

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
