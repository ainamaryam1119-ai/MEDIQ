export type NavSection =
  | 'dashboard'
  | 'chatbot'
  | 'inventory'
  | 'stock'
  | 'alerts'
  | 'suppliers'
  | 'reports'
  | 'settings';

export type ThemeMode = 'dark' | 'light';
export type AppLanguage = 'en' | 'ur' | 'roman-ur';
export type ChatbotLanguage = 'auto' | 'en' | 'ur' | 'roman-ur';
export type AiModePreference = 'auto' | 'local';

export type MedicineCategory =
  | 'Analgesics'
  | 'Antibiotics'
  | 'Cardiovascular'
  | 'Gastrointestinal'
  | 'Antidiabetics'
  | 'Respiratory'
  | 'Vitamins & Supplements'
  | 'Dermatology'
  | 'Pediatrics'
  | 'Antihistamines';

export type DosageForm =
  | 'Tablet'
  | 'Capsule'
  | 'Syrup'
  | 'Injection'
  | 'Cream'
  | 'Inhaler'
  | 'Drops'
  | 'Sachet';

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  category: MedicineCategory;
  manufacturer: string;
  strength: string;
  dosageForm: DosageForm;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD in Asia/Karachi
  quantity: number;
  minThreshold: number;
  purchasePrice: number; // PKR
  sellingPrice: number; // PKR
  supplier: string;
  isDemo?: boolean;
  updatedAt: string;
}

export type StockMovementType = 'in' | 'out' | 'writeoff' | 'adjustment';

export interface StockMovement {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  type: StockMovementType;
  quantityDelta: number; // positive for 'in', negative for 'out'/'writeoff', signed for 'adjustment'
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  timestamp: string; // ISO string
  isDemo?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  leadTimeDays: number;
  notes?: string;
  isDemo?: boolean;
}

export type ExpiryStatus =
  | 'expired'
  | 'expiring_30'
  | 'expiring_60'
  | 'expiring_90'
  | 'valid';

export type StockStatus = 'out_of_stock' | 'low_stock' | 'adequate';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertCategory =
  | 'expired'
  | 'expiring_30'
  | 'expiring_60'
  | 'expiring_90'
  | 'out_of_stock'
  | 'low_stock';

export interface AlertItem {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  detail: string;
  daysUntilExpiry: number;
  quantity: number;
  valueAtRisk: number;
}

export interface ReorderRecommendation {
  medicineId: string;
  medicineName: string;
  genericName: string;
  supplier: string;
  currentQuantity: number;
  minThreshold: number;
  recommendedOrderQty: number;
  estimatedCost: number;
  method: 'historical-velocity' | 'rule-based';
  rationale: string;
  urgency: 'immediate' | 'soon';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'gemini' | 'local';
  model?: string;
  isErrorNotice?: boolean;
  suggestedFollowUps?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface PharmacySettings {
  pharmacyName: string;
  pharmacistName: string;
  city: string;
  timezone: 'Asia/Karachi';
  language: AppLanguage;
  chatbotLanguage: ChatbotLanguage;
  theme: ThemeMode;
  aiMode: AiModePreference;
}
