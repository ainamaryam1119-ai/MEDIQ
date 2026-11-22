import type { AppLanguage, NavSection } from '../types/pharmacy';

interface TranslationDict {
  nav: Record<NavSection, string>;
  subtitle: string;
  searchPlaceholder: string;
  quickActions: string;
  addMedicine: string;
  askAi: string;
  recordMovement: string;
  exportCsv: string;
}

export const TRANSLATIONS: Record<AppLanguage, TranslationDict> = {
  en: {
    nav: {
      dashboard: 'Overview Dashboard',
      chatbot: 'AI Chatbot',
      inventory: 'Medicine Inventory',
      stock: 'Stock Management',
      alerts: 'Expiry Alerts',
      suppliers: 'Suppliers',
      reports: 'Analytics & Reports',
      settings: 'Settings',
    },
    subtitle: 'Smart Pharmacy Operations',
    searchPlaceholder: 'Search medicines, generics, batches, suppliers…',
    quickActions: 'Quick Actions',
    addMedicine: 'Add Medicine',
    askAi: 'Ask MediQ AI',
    recordMovement: 'Adjust Stock',
    exportCsv: 'Export CSV',
  },
  ur: {
    nav: {
      dashboard: 'ڈیش بورڈ',
      chatbot: 'اے آئی چیٹ بوٹ',
      inventory: 'ادویات کا اسٹاک',
      stock: 'اسٹاک مینجمنٹ',
      alerts: 'ایکسپائری الرٹس',
      suppliers: 'سپلائرز',
      reports: 'رپورٹس اور تجزیہ',
      settings: 'سیٹنگز',
    },
    subtitle: 'اسمارٹ فارمیسی آپریشنز',
    searchPlaceholder: 'دوا، فارمولا، بیچ یا سپلائر تلاش کریں…',
    quickActions: 'فوری اقدامات',
    addMedicine: 'نئی دوا شامل کریں',
    askAi: 'MediQ AI سے پوچھیں',
    recordMovement: 'اسٹاک اپڈیٹ',
    exportCsv: 'CSV ڈاؤن لوڈ',
  },
  'roman-ur': {
    nav: {
      dashboard: 'Overview Dashboard',
      chatbot: 'AI Chatbot',
      inventory: 'Dawaiyan (Inventory)',
      stock: 'Stock Management',
      alerts: 'Expiry Alerts',
      suppliers: 'Suppliers',
      reports: 'Analytics aur Reports',
      settings: 'Settings',
    },
    subtitle: 'Smart Pharmacy Operations',
    searchPlaceholder: 'Dawai, formula, batch ya supplier talash karein…',
    quickActions: 'Fori Actions',
    addMedicine: 'Nayi Dawai Shamil Karein',
    askAi: 'MediQ AI se Poochein',
    recordMovement: 'Stock Adjust Karein',
    exportCsv: 'CSV Export',
  },
};
