import {
  createDemoMedicines,
  createDemoMovements,
  createDemoSuppliers,
  DEFAULT_SETTINGS,
} from '../data/demoData';
import type {
  ChatSession,
  Medicine,
  PharmacySettings,
  StockMovement,
  Supplier,
} from '../types/pharmacy';

function sanitizeScope(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
}

function keysForUser(userId: string) {
  const scope = sanitizeScope(userId);
  return {
    MEDICINES: `mediq_u_${scope}_medicines_v1`,
    MOVEMENTS: `mediq_u_${scope}_movements_v1`,
    SUPPLIERS: `mediq_u_${scope}_suppliers_v1`,
    CHATS: `mediq_u_${scope}_chats_v1`,
    SETTINGS: `mediq_u_${scope}_settings_v1`,
  };
}

function safeRead<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = fallback();
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors cleanly
  }
}

export interface UserWorkspaceBundle {
  medicines: Medicine[];
  movements: StockMovement[];
  suppliers: Supplier[];
  sessions: ChatSession[];
  settings: PharmacySettings;
}

export function loadUserWorkspaceLocal(userId: string): UserWorkspaceBundle {
  const k = keysForUser(userId);
  const storedSettings = safeRead<Partial<PharmacySettings>>(k.SETTINGS, () => DEFAULT_SETTINGS);
  return {
    medicines: safeRead<Medicine[]>(k.MEDICINES, createDemoMedicines),
    movements: safeRead<StockMovement[]>(k.MOVEMENTS, createDemoMovements),
    suppliers: safeRead<Supplier[]>(k.SUPPLIERS, createDemoSuppliers),
    sessions: safeRead<ChatSession[]>(k.CHATS, () => []),
    settings: { ...DEFAULT_SETTINGS, ...storedSettings, timezone: 'Asia/Karachi' },
  };
}

export function saveUserWorkspaceLocal(userId: string, bundle: UserWorkspaceBundle): void {
  const k = keysForUser(userId);
  safeWrite(k.MEDICINES, bundle.medicines);
  safeWrite(k.MOVEMENTS, bundle.movements);
  safeWrite(k.SUPPLIERS, bundle.suppliers);
  safeWrite(k.CHATS, bundle.sessions);
  safeWrite(k.SETTINGS, bundle.settings);
}
