import type { ChatbotLanguage, Medicine, StockMovement, Supplier } from '../types/pharmacy';
import {
  computeDashboardMetrics,
  daysUntilExpiry,
  formatPKR,
  generateReorderRecommendations,
  getKarachiTodayStr,
} from './inventoryEngine';

export interface LocalChatResult {
  reply: string;
  suggestedFollowUps: string[];
}

export function containsUrduScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function detectLanguage(query: string, pref: ChatbotLanguage): 'en' | 'ur' | 'roman-ur' {
  if (pref !== 'auto') return pref;
  if (containsUrduScript(query)) return 'ur';

  const lower = query.toLowerCase();
  const romanMarkers = [
    'kitni',
    'kitne',
    'kitna',
    'dawai',
    'dawaiyan',
    'dawa',
    'konsi',
    'kaunsi',
    'aaj',
    'kal',
    'aglay',
    'mahine',
    'qeemat',
    'kul',
    'kam',
    'khatam',
    'mein',
    'hain',
    'hai',
    'batao',
    'batayen',
    'dikhao',
    'order',
    'karun',
    'salam',
    'shukriya',
    'madad',
  ];
  if (romanMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) {
    return 'roman-ur';
  }
  return 'en';
}

function isClinicalSafetyTrigger(query: string): boolean {
  const lower = query.toLowerCase();
  const clinicalPatterns = [
    /\bdiagnos(e|is)\b/i,
    /\bprescrib(e|ing)\b/i,
    /\bdosage for\b/i,
    /\bhow much should i take\b/i,
    /\bhow many mg should\b/i,
    /\bsubstitut(e|ion)\b/i,
    /\breplace\b.*\bwith\b/i,
    /\balternative (drug|medicine) for\b/i,
    /\bwhat (?:medicine|drug|tablet|pill)?\s*should i take\b/i,
    /\bwhich (?:medicine|drug|tablet) (?:for|should i take)\b/i,
    /\bmedicine for\b/i,
    /\bchest pain\b/i,
    /\btreat my\b/i,
    /تشخیص|تجویز|خوراک|متبادل دوا|کس بیماری|علاج/,
    /\b(ilaaj|beemari|khurak|kitni goli khani|badal sakta)\b/i,
  ];
  return clinicalPatterns.some((rx) => rx.test(lower));
}

export function runLocalInventoryChatbot(
  query: string,
  medicines: Medicine[],
  movements: StockMovement[],
  suppliers: Supplier[],
  languagePref: ChatbotLanguage
): LocalChatResult {
  const lang = detectLanguage(query, languagePref);
  const lower = query.toLowerCase().trim();
  const metrics = computeDashboardMetrics(medicines, movements);
  const reorders = generateReorderRecommendations(medicines, movements);
  const today = getKarachiTodayStr();

  // 1. Medical Safety Check first
  if (isClinicalSafetyTrigger(query)) {
    if (lang === 'ur') {
      return {
        reply:
          'معذرت، MediQ AI صرف فارمیسی انوینٹری آپریشنز اور عمومی معلوماتی مدد کے لیے ہے۔ میں بیماری کی تشخیص، دوا تجویز کرنے، ذاتی خوراک بتانے، یا کسی دوا کا متبادل تجویز کرنے کا مجاز نہیں ہوں۔ براہِ کرم طبی فیصلوں کے لیے مستند فارماسسٹ یا ڈاکٹر سے رجوع کریں۔',
        suggestedFollowUps: ['آج کا خلاصہ دکھائیں', 'کم اسٹاک والی ادویات'],
      };
    }
    if (lang === 'roman-ur') {
      return {
        reply:
          'Maazrat, MediQ AI sirf pharmacy inventory operations aur aam maloomat ke liye hai. Main kisi mareez ki tashkhees (diagnosis), dawai tajweez (prescribe), zaati dosage batane, ya kisi dawai ka mutabadil (substitution) tajweez karne ka ikhtiyar nahi rakhta. Barah-e-karam clinical faislon ke liye licensed pharmacist ya doctor se mashwara karein.',
        suggestedFollowUps: ['Aaj ki pharmacy summary dikhao', 'Low stock medicines dikhao'],
      };
    }
    return {
      reply:
        'MediQ AI is designed strictly for pharmacy inventory operations and general non-clinical information. I cannot diagnose patients, prescribe medications, provide personalized dosing instructions, or independently recommend drug substitutions. Please consult a licensed pharmacist or physician for any clinical decision.',
      suggestedFollowUps: ["Give me today's pharmacy summary", 'Show low-stock medicines'],
    };
  }

  // 2. Numeric threshold match e.g. "below 10", "under 20", "10 se kam"
  const thresholdMatch =
    lower.match(/(?:below|under|less than|<)\s*(\d+)/i) ||
    lower.match(/(\d+)\s*(?:se kam|say kam|کم)/i);
  if (
    thresholdMatch ||
    /low[\s-]?stock|out of stock|kam stock|khatam|کم اسٹاک|ختم/i.test(lower)
  ) {
    const limit = thresholdMatch ? Number(thresholdMatch[1]) : null;
    const matched =
      limit !== null
        ? medicines.filter((m) => m.quantity < limit)
        : medicines.filter((m) => m.quantity <= m.minThreshold);

    const sorted = [...matched].sort((a, b) => a.quantity - b.quantity);

    if (sorted.length === 0) {
      return {
        reply:
          lang === 'ur'
            ? `اس وقت ${limit !== null ? `${limit} سے کم` : 'کم اسٹاک'} والی کوئی دوا موجود نہیں ہے۔`
            : lang === 'roman-ur'
              ? `Is waqt ${limit !== null ? `${limit} se kam` : 'low stock'} wali koi dawai maujood nahi hai.`
              : `No medicines currently have stock ${limit !== null ? `below ${limit} units` : 'at or below their minimum threshold'}.`,
        suggestedFollowUps: ['Which products should I reorder?', 'Show expired medicines'],
      };
    }

    const lines = sorted.map(
      (m) =>
        `• ${m.name} (${m.genericName}, Batch ${m.batchNumber}): ${m.quantity} units (Min threshold: ${m.minThreshold}) — Supplier: ${m.supplier}`
    );

    const header =
      lang === 'ur'
        ? `${limit !== null ? `${limit} یونٹس سے کم` : 'کم اسٹاک یا ختم شدہ'} ادویات (${sorted.length} ریکارڈز):`
        : lang === 'roman-ur'
          ? `${limit !== null ? `${limit} units se kam` : 'Kam stock ya out-of-stock'} dawaiyan (${sorted.length} records):`
          : `Medicines with ${limit !== null ? `stock below ${limit} units` : 'low or zero stock'} (${sorted.length} found):`;

    return {
      reply: `${header}\n\n${lines.join('\n')}`,
      suggestedFollowUps: ['Which products should I reorder?', 'What is the total inventory value?'],
    };
  }

  // 3. Expired medicines
  if (/expired|expire ho|میعاد ختم/i.test(lower) && !/expiring|next month|aglay|soon/i.test(lower)) {
    const expired = medicines.filter((m) => daysUntilExpiry(m.expiryDate) < 0);
    if (expired.length === 0) {
      return {
        reply:
          lang === 'ur'
            ? 'الحمدللہ، فی الحال کوئی میعاد ختم شدہ دوا انوینٹری میں موجود نہیں ہے۔'
            : lang === 'roman-ur'
              ? 'Is waqt inventory mein koi expired dawai maujood nahi hai.'
              : 'There are currently 0 expired medicine batches in inventory.',
        suggestedFollowUps: ['Which medicines are expiring next month?', "Give me today's pharmacy summary"],
      };
    }
    const lines = expired.map(
      (m) =>
        `• ${m.name} (Batch ${m.batchNumber}): Expired ${Math.abs(daysUntilExpiry(m.expiryDate))} day(s) ago on ${m.expiryDate} · ${m.quantity} units (${formatPKR(m.quantity * m.purchasePrice)} cost)`
    );
    const header =
      lang === 'ur'
        ? `میعاد ختم شدہ بیچز (${expired.length}):`
        : lang === 'roman-ur'
          ? `Expired medicine batches (${expired.length}):`
          : `Expired medicine batches as of ${today} (${expired.length} found):`;

    return {
      reply: `${header}\n\n${lines.join('\n')}`,
      suggestedFollowUps: ['Which medicines are expiring next month?', 'Show medicines with stock below 10'],
    };
  }

  // 4. Expiring soon / next month / 30 / 60 / 90 days
  if (/expiring|next month|aglay mahine|30 days|60 days|90 days|جلد ختم|اگلے مہینے/i.test(lower)) {
    const windowDays = /90/.test(lower) ? 90 : /60/.test(lower) ? 60 : 30;
    const expiring = medicines
      .filter((m) => {
        const d = daysUntilExpiry(m.expiryDate);
        return d >= 0 && d <= windowDays;
      })
      .sort((a, b) => daysUntilExpiry(a.expiryDate) - daysUntilExpiry(b.expiryDate));

    if (expiring.length === 0) {
      return {
        reply:
          lang === 'ur'
            ? `اگلے ${windowDays} دنوں میں کوئی دوا ایکسپائر نہیں ہو رہی۔`
            : lang === 'roman-ur'
              ? `Aglay ${windowDays} dino mein koi dawai expire nahi ho rahi.`
              : `No medicines are scheduled to expire within the next ${windowDays} days.`,
        suggestedFollowUps: ['Show expired medicines', "Give me today's pharmacy summary"],
      };
    }

    const lines = expiring.map((m) => {
      const d = daysUntilExpiry(m.expiryDate);
      return `• ${m.name} (Batch ${m.batchNumber}): Expires in ${d} day(s) on ${m.expiryDate} · ${m.quantity} units (${formatPKR(m.quantity * m.purchasePrice)} cost)`;
    });

    const header =
      lang === 'ur'
        ? `اگلے ${windowDays} دنوں میں ایکسپائر ہونے والی ادویات (${expiring.length}):`
        : lang === 'roman-ur'
          ? `Aglay ${windowDays} dino mein expire hone wali dawaiyan (${expiring.length}):`
          : `Medicines expiring within ${windowDays} days (${expiring.length} batches):`;

    return {
      reply: `${header}\n\n${lines.join('\n')}`,
      suggestedFollowUps: ['Show expired medicines', 'Which products should I reorder?'],
    };
  }

  // 5. Inventory Value
  if (/value|worth|qeemat|malayat|مالیت|قیمت/i.test(lower)) {
    const header =
      lang === 'ur'
        ? `موجودہ انوینٹری کی مالی تفصیل (${today}):`
        : lang === 'roman-ur'
          ? `Inventory ki kul maaliyat (${today}):`
          : `Current Inventory Valuation (${today}, Asia/Karachi):`;

    const body =
      lang === 'ur'
        ? `• کل ادویات (SKUs): ${metrics.totalMedicines}\n• کل یونٹس: ${metrics.totalUnits.toLocaleString()}\n• خریداری مالیت (Cost): ${formatPKR(metrics.totalPurchaseValue)}\n• فروخت مالیت (Retail): ${formatPKR(metrics.totalSellingValue)}\n• ایکسپائرڈ نقصان کا خطرہ: ${formatPKR(metrics.expiredValueAtRisk)}`
        : lang === 'roman-ur'
          ? `• Kul Medicines (SKUs): ${metrics.totalMedicines}\n• Kul Units: ${metrics.totalUnits.toLocaleString()}\n• Purchase Cost Value: ${formatPKR(metrics.totalPurchaseValue)}\n• Retail Selling Value: ${formatPKR(metrics.totalSellingValue)}\n• Expired Stock Value at Risk: ${formatPKR(metrics.expiredValueAtRisk)}`
          : `• Total SKUs: ${metrics.totalMedicines}\n• Total Units in Stock: ${metrics.totalUnits.toLocaleString()}\n• Total Purchase Cost Value: ${formatPKR(metrics.totalPurchaseValue)}\n• Total Retail Selling Value: ${formatPKR(metrics.totalSellingValue)}\n• Expired Stock Value at Risk: ${formatPKR(metrics.expiredValueAtRisk)}`;

    return {
      reply: `${header}\n\n${body}`,
      suggestedFollowUps: ['Which products should I reorder?', 'Show expired medicines'],
    };
  }

  // 6. Reorder recommendations
  if (/reorder|order|restock|منگوائیں|آرڈر/i.test(lower)) {
    if (reorders.length === 0) {
      return {
        reply:
          lang === 'ur'
            ? 'تمام ادویات مناسب مقدار میں موجود ہیں، فی الحال کسی نئے آرڈر کی ضرورت نہیں۔'
            : lang === 'roman-ur'
              ? 'Tamam dawaiyan munasib miqdar mein maujood hain, filhaal reorder ki zaroorat nahi.'
              : 'All medicines are currently above their minimum stock thresholds. No immediate reorders needed.',
        suggestedFollowUps: ["Give me today's pharmacy summary"],
      };
    }

    const lines = reorders.map(
      (r) =>
        `• ${r.medicineName}: ${r.currentQuantity} left (Min ${r.minThreshold}) → Suggested order: ${r.recommendedOrderQty} units (${formatPKR(r.estimatedCost)}) via ${r.supplier} [${r.method === 'historical-velocity' ? 'Movement-based' : 'Rule-based'}]`
    );
    const totalOrderCost = reorders.reduce((s, r) => s + r.estimatedCost, 0);

    const header =
      lang === 'ur'
        ? `دوبارہ آرڈر کی سفارشات (${reorders.length} مصنوعات، تخمینہ لاگت ${formatPKR(totalOrderCost)}):`
        : lang === 'roman-ur'
          ? `Reorder recommendations (${reorders.length} items, andazan laagat ${formatPKR(totalOrderCost)}):`
          : `Recommended Reorders (${reorders.length} items, estimated total ${formatPKR(totalOrderCost)}):`;

    return {
      reply: `${header}\n\n${lines.join('\n')}`,
      suggestedFollowUps: ['What is the total inventory value?', 'Show medicines with stock below 10'],
    };
  }

  // 7. Specific medicine search (e.g. "How much Paracetamol is available?")
  const normalizedQuery = lower
    .replace(/how much|is available|how many|available|stock of|show me|find|kitna|kitni|hai|hain|موجود|کتنی/gi, '')
    .replace(/[?!.,؟]+/g, ' ')
    .trim();

  if (normalizedQuery.length >= 3) {
    const matches = medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(normalizedQuery) ||
        m.genericName.toLowerCase().includes(normalizedQuery) ||
        m.batchNumber.toLowerCase().includes(normalizedQuery) ||
        m.category.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.split(/\s+/).some(
          (tok) =>
            tok.length >= 4 &&
            (m.name.toLowerCase().includes(tok) || m.genericName.toLowerCase().includes(tok))
        )
    );

    if (matches.length > 0) {
      const totalMatchedQty = matches.reduce((s, m) => s + m.quantity, 0);
      const lines = matches.map((m) => {
        const d = daysUntilExpiry(m.expiryDate);
        const expLabel = d < 0 ? `EXPIRED (${m.expiryDate})` : `Exp: ${m.expiryDate} (${d}d)`;
        return `• ${m.name} [${m.genericName}, ${m.strength} ${m.dosageForm}] — ${m.quantity} units · Batch ${m.batchNumber} · ${expLabel} · ${formatPKR(m.sellingPrice)}/unit`;
      });

      const header =
        lang === 'ur'
          ? `"${normalizedQuery}" سے متعلق ${matches.length} ریکارڈز ملے (مجموعی ${totalMatchedQty} یونٹس):`
          : lang === 'roman-ur'
            ? `"${normalizedQuery}" se mutalliq ${matches.length} records mile (kul ${totalMatchedQty} units):`
            : `Found ${matches.length} matching record(s) for "${normalizedQuery}" (${totalMatchedQty} total units):`;

      return {
        reply: `${header}\n\n${lines.join('\n')}`,
        suggestedFollowUps: ["Give me today's pharmacy summary", 'Which products should I reorder?'],
      };
    }
  }

  // 8. Total medicines count
  if (/how many medicines|total medicines|kitni dawai|کتنی ادویات/i.test(lower)) {
    return {
      reply:
        lang === 'ur'
          ? `انوینٹری میں کل ${metrics.totalMedicines} ادویات (SKUs) اور مجموعی طور پر ${metrics.totalUnits.toLocaleString()} یونٹس موجود ہیں۔`
          : lang === 'roman-ur'
            ? `Inventory mein kul ${metrics.totalMedicines} medicines (SKUs) aur ${metrics.totalUnits.toLocaleString()} total units maujood hain.`
            : `There are currently ${metrics.totalMedicines} medicine SKUs in inventory totaling ${metrics.totalUnits.toLocaleString()} units in stock.`,
      suggestedFollowUps: ['What is the total inventory value?', 'Show medicines with stock below 10'],
    };
  }

  // 9. Suppliers query
  if (/supplier|vendor|distributor|سپلائر/i.test(lower)) {
    const lines = suppliers.map(
      (s) => `• ${s.name} (${s.city}) — Contact: ${s.contactPerson}, ${s.phone} (Lead time: ${s.leadTimeDays} days)`
    );
    return {
      reply: `Active Suppliers (${suppliers.length}):\n\n${lines.join('\n')}`,
      suggestedFollowUps: ['Which products should I reorder?'],
    };
  }

  // 10. Today's summary / greeting / default fallback
  if (lang === 'ur') {
    return {
      reply: `آج کی فارمیسی انوینٹری کا خلاصہ (${today}):\n\n• کل ادویات (SKUs): ${metrics.totalMedicines}\n• کل یونٹس: ${metrics.totalUnits.toLocaleString()}\n• ریٹیل مالیت: ${formatPKR(metrics.totalSellingValue)}\n• میعاد ختم شدہ بیچز: ${metrics.expiredCount}\n• 30 دن میں ایکسپائر ہونے والی: ${metrics.expiring30Count}\n• کم اسٹاک / ختم شدہ: ${metrics.lowStockCount + metrics.outOfStockCount}\n\nآپ کسی مخصوص دوا (جیسے Paracetamol)، ایکسپائری، یا کم اسٹاک کے بارے میں پوچھ سکتے ہیں۔`,
      suggestedFollowUps: ['اگلے مہینے کون سی ادویات ایکسپائر ہوں گی؟', 'کم اسٹاک والی ادویات دکھائیں'],
    };
  }

  if (lang === 'roman-ur') {
    return {
      reply: `Aaj ki pharmacy summary (${today}):\n\n• Kul Medicines (SKUs): ${metrics.totalMedicines}\n• Kul Units: ${metrics.totalUnits.toLocaleString()}\n• Retail Value: ${formatPKR(metrics.totalSellingValue)}\n• Expired Batches: ${metrics.expiredCount}\n• Aglay 30 dino mein expire hone wali: ${metrics.expiring30Count}\n• Low / Out-of-Stock Items: ${metrics.lowStockCount + metrics.outOfStockCount}\n\nAap kisi bhi dawai ka naam (jaise Paracetamol), expiry alerts, ya reorder ke baray mein pooch sakte hain.`,
      suggestedFollowUps: ['Aglay mahine konsi dawaiyan expire hongi?', '10 se kam stock wali dawaiyan dikhao'],
    };
  }

  return {
    reply: `Today's Pharmacy Operations Summary (${today}, Asia/Karachi):\n\n• Total Medicine SKUs: ${metrics.totalMedicines}\n• Total Stock Units: ${metrics.totalUnits.toLocaleString()}\n• Total Inventory Retail Value: ${formatPKR(metrics.totalSellingValue)} (Purchase cost: ${formatPKR(metrics.totalPurchaseValue)})\n• Expired Batches: ${metrics.expiredCount}\n• Expiring Within 30 Days: ${metrics.expiring30Count}\n• Low Stock / Out of Stock: ${metrics.lowStockCount} low · ${metrics.outOfStockCount} out of stock\n\nYou can ask about any specific medicine (e.g., "How much Paracetamol is available?"), expiry windows, stock below a number, or reorder recommendations.`,
    suggestedFollowUps: [
      'Which medicines are expiring next month?',
      'Show medicines with stock below 10',
      'Which products should I reorder?',
    ],
  };
}
