/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquareText,
  Pill,
  ArrowLeftRight,
  Bell,
  Truck,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  AlertOctagon,
  Clock,
  TrendingDown,
  ChevronDown,
  Bot,
  UserCheck,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import type {
  ChatSession,
  Medicine,
  NavSection,
  PharmacySettings,
  StockMovement,
  StockMovementType,
  Supplier,
} from './types/pharmacy';
import {
  createDemoMedicines,
  createDemoMovements,
  createDemoSuppliers,
  DEFAULT_SETTINGS,
} from './data/demoData';
import {
  loadUserWorkspaceLocal,
  saveUserWorkspaceLocal,
} from './utils/storage';
import { generateAlerts } from './utils/inventoryEngine';
import { TRANSLATIONS } from './utils/i18n';
import { MediQLogoMark } from './components/BrandLogo';
import { DashboardView } from './components/DashboardView';
import { ChatbotView, type AiQuotaInfo } from './components/ChatbotView';
import { InventoryView } from './components/InventoryView';
import { StockManagementView } from './components/StockManagementView';
import { ExpiryAlertsView } from './components/ExpiryAlertsView';
import { SuppliersView } from './components/SuppliersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';

interface SessionUser {
  userId: string;
  username: string;
  isGuest: boolean;
}

const PHARMACIST_AVATAR = '/src/assets/images/avatar_pharmacist_1795362205400.jpg';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [aiQuota, setAiQuota] = useState<AiQuotaInfo | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const [medicines, setMedicines] = useState<Medicine[]>(() => createDemoMedicines());
  const [movements, setMovements] = useState<StockMovement[]>(() => createDemoMovements());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => createDemoSuppliers());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PharmacySettings>(DEFAULT_SETTINGS);

  // Account Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Cross-view navigation hints
  const [inventorySearchHint, setInventorySearchHint] = useState<string>('');
  const [alertCategoryHint, setAlertCategoryHint] = useState<string>('all');
  const [stockMedIdHint, setStockMedIdHint] = useState<string | null>(null);
  const [addMedicineSignal, setAddMedicineSignal] = useState<number>(0);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);

  // Topbar UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const loadWorkspaceForSession = async (user: SessionUser) => {
    setWorkspaceReady(false);
    const localBundle = loadUserWorkspaceLocal(user.userId);
    try {
      const dataRes = await fetch('/api/data');
      if (dataRes.ok) {
        const dataJson = await dataRes.json();
        if (dataJson?.hasSavedData && dataJson?.data) {
          const d = dataJson.data;
          setMedicines(Array.isArray(d.medicines) ? d.medicines : localBundle.medicines);
          setMovements(Array.isArray(d.movements) ? d.movements : localBundle.movements);
          setSuppliers(Array.isArray(d.suppliers) ? d.suppliers : localBundle.suppliers);
          const loadedChats = Array.isArray(d.sessions) ? d.sessions : localBundle.sessions;
          setSessions(loadedChats);
          setActiveSessionId(loadedChats[0]?.id ?? null);
          setSettings(d.settings ? { ...DEFAULT_SETTINGS, ...d.settings, timezone: 'Asia/Karachi' } : localBundle.settings);
          setWorkspaceReady(true);
          return;
        }
      }
    } catch {
      // Fallback to scoped local storage for this specific userId
    }
    setMedicines(localBundle.medicines);
    setMovements(localBundle.movements);
    setSuppliers(localBundle.suppliers);
    setSessions(localBundle.sessions);
    setActiveSessionId(localBundle.sessions[0]?.id ?? null);
    setSettings(localBundle.settings);
    setWorkspaceReady(true);
  };

  // Bootstrap verified HttpOnly session on mount
  useEffect(() => {
    fetch('/api/session')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.userId) {
          const user = data.user as SessionUser;
          setSessionUser(user);
          if (data.aiQuota) setAiQuota(data.aiQuota as AiQuotaInfo);
          void loadWorkspaceForSession(user);
        }
      })
      .catch(() => {
        const fallbackUser: SessionUser = {
          userId: 'usr_local_offline',
          username: 'Guest Pharmacist',
          isGuest: true,
        };
        setSessionUser(fallbackUser);
        void loadWorkspaceForSession(fallbackUser);
      });
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Persist data strictly under verified userId (local scoped cache + server isolated vault)
  useEffect(() => {
    if (!sessionUser || !workspaceReady) return;
    const bundle = { medicines, movements, suppliers, sessions, settings };
    saveUserWorkspaceLocal(sessionUser.userId, bundle);

    const timer = window.setTimeout(() => {
      void fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      }).catch(() => {});
    }, 400);

    return () => window.clearTimeout(timer);
  }, [medicines, movements, suppliers, sessions, settings, sessionUser, workspaceReady]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      const endpoint = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setAuthError(data?.message || 'Authentication failed. Please check your details.');
        return;
      }
      const nextUser = data.user as SessionUser;
      setSessionUser(nextUser);
      if (data.aiQuota) setAiQuota(data.aiQuota as AiQuotaInfo);
      setAuthModalOpen(false);
      setAuthUsername('');
      setAuthPassword('');
      await loadWorkspaceForSession(nextUser);
    } catch {
      setAuthError('Unable to connect to authentication server.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data?.user) {
        const nextUser = data.user as SessionUser;
        setSessionUser(nextUser);
        if (data.aiQuota) setAiQuota(data.aiQuota as AiQuotaInfo);
        await loadWorkspaceForSession(nextUser);
      }
    } catch {
      // Ignore network errors
    }
  };

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const alerts = useMemo(() => generateAlerts(medicines), [medicines]);
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  const t = TRANSLATIONS[settings.language] || TRANSLATIONS.en;

  const globalSearchMatches = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.batchNumber.toLowerCase().includes(q) ||
          m.supplier.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [globalSearch, medicines]);

  const handleNavigate = (section: NavSection, hint?: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    if (section === 'alerts' && hint) {
      setAlertCategoryHint(hint);
    } else if (section === 'alerts') {
      setAlertCategoryHint('all');
    }
    if (section === 'inventory' && hint !== undefined) {
      setInventorySearchHint(hint);
    }
  };

  const handleOpenAddMedicine = () => {
    setActiveSection('inventory');
    setMobileMenuOpen(false);
    setAddMedicineSignal((n) => n + 1);
  };

  const handleAskAiPrompt = (prompt: string) => {
    setPendingAiPrompt(prompt);
    setActiveSection('chatbot');
    setMobileMenuOpen(false);
  };

  const handleSaveMedicine = (med: Medicine, isEdit: boolean) => {
    if (isEdit) {
      setMedicines((prev) => prev.map((m) => (m.id === med.id ? med : m)));
    } else {
      setMedicines((prev) => [med, ...prev]);
      const initMov: StockMovement = {
        id: `mov-${Date.now()}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: med.batchNumber,
        type: 'in',
        quantityDelta: med.quantity,
        previousQuantity: 0,
        newQuantity: med.quantity,
        reason: 'Initial batch added to inventory',
        timestamp: new Date().toISOString(),
      };
      setMovements((prev) => [initMov, ...prev]);
    }
  };

  const handleDeleteMedicine = (id: string) => {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
  };

  const handleRecordMovement = ({
    medicineId,
    type,
    quantity,
    reason,
  }: {
    medicineId: string;
    type: StockMovementType;
    quantity: number;
    reason: string;
  }) => {
    const target = medicines.find((m) => m.id === medicineId);
    if (!target) return;

    const prevQty = target.quantity;
    let newQty = prevQty;
    let delta = 0;

    if (type === 'in') {
      newQty = prevQty + quantity;
      delta = quantity;
    } else if (type === 'out' || type === 'writeoff') {
      newQty = Math.max(0, prevQty - quantity);
      delta = newQty - prevQty;
    } else {
      newQty = Math.max(0, quantity);
      delta = newQty - prevQty;
    }

    setMedicines((prev) =>
      prev.map((m) =>
        m.id === medicineId
          ? { ...m, quantity: newQty, updatedAt: new Date().toISOString() }
          : m
      )
    );

    const newMov: StockMovement = {
      id: `mov-${Date.now()}`,
      medicineId: target.id,
      medicineName: target.name,
      batchNumber: target.batchNumber,
      type,
      quantityDelta: delta,
      previousQuantity: prevQty,
      newQuantity: newQty,
      reason,
      timestamp: new Date().toISOString(),
    };
    setMovements((prev) => [newMov, ...prev]);
  };

  const handleSaveSupplier = (sup: Supplier, isEdit: boolean) => {
    if (isEdit) {
      setSuppliers((prev) => prev.map((s) => (s.id === sup.id ? sup : s)));
    } else {
      setSuppliers((prev) => [sup, ...prev]);
    }
  };

  const handleDeleteSupplier = (id: string) => {
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRemoveDemoData = () => {
    setMedicines((prev) => prev.filter((m) => !m.isDemo));
    setMovements((prev) => prev.filter((m) => !m.isDemo));
    setSuppliers((prev) => prev.filter((s) => !s.isDemo));
  };

  const handleRestoreDemoData = () => {
    setMedicines(createDemoMedicines());
    setMovements(createDemoMovements());
    setSuppliers(createDemoSuppliers());
  };

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'chatbot', label: t.nav.chatbot, icon: MessageSquareText },
    { id: 'inventory', label: t.nav.inventory, icon: Pill },
    { id: 'stock', label: t.nav.stock, icon: ArrowLeftRight },
    {
      id: 'alerts',
      label: t.nav.alerts,
      icon: Bell,
      badge: alerts.length > 0 ? alerts.length : undefined,
    },
    { id: 'suppliers', label: t.nav.suppliers, icon: Truck },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
    { id: 'settings', label: t.nav.settings, icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] dark:bg-[#0B1220] dark:text-[#F8FAFC] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm dark:border-slate-800/80 dark:bg-[#0B1220]/95 sm:px-6 no-print">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#17263B] lg:hidden cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer whitespace-nowrap shrink-0"
          >
            <MediQLogoMark className="h-8 w-8 shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
              MediQ AI
            </span>
          </button>
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="relative hidden flex-1 max-w-md md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={globalSearch}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              setSearchFocused(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && globalSearch.trim()) {
                handleNavigate('inventory', globalSearch.trim());
                setSearchFocused(false);
              }
            }}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-100"
          />

          {searchFocused && globalSearch.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#17263B]">
              {globalSearchMatches.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  No matching medicines found.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {globalSearchMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        handleNavigate('inventory', m.name);
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-[#1E314B] cursor-pointer"
                    >
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.genericName} · Batch {m.batchNumber}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {m.quantity} units
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Notification Center, Theme Toggle, Profile Menu */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notification Bell */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileOpen(false);
              }}
              className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-300 dark:hover:bg-[#17263B] cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                  {alerts.length > 99 ? '99+' : alerts.length}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Alert Center
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {criticalCount} critical · {alerts.length} total active warnings
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate('alerts')}
                    className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                  >
                    View all
                  </button>
                </div>

                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {alerts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500">
                      All batches and stock levels look healthy.
                    </div>
                  ) : (
                    alerts.slice(0, 8).map((alert) => {
                      const Icon =
                        alert.category === 'expired' || alert.category === 'out_of_stock'
                          ? AlertOctagon
                          : alert.category === 'low_stock'
                            ? TrendingDown
                            : Clock;
                      return (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => {
                            setStockMedIdHint(alert.medicineId);
                            handleNavigate('alerts', alert.category);
                          }}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1E314B] cursor-pointer"
                        >
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              alert.severity === 'critical'
                                ? 'text-red-500'
                                : alert.severity === 'warning'
                                  ? 'text-amber-500'
                                  : 'text-cyan-400'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                              {alert.title}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {alert.detail}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                theme: prev.theme === 'dark' ? 'light' : 'dark',
              }))
            }
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-300 dark:hover:bg-[#17263B] cursor-pointer"
            aria-label={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to Midnight Clinical theme'}
            title={settings.theme === 'dark' ? 'Light Mode' : 'Midnight Clinical Mode'}
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </button>

          {/* Profile Menu */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-1.5 pr-2.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#111C2E] dark:hover:bg-[#17263B] cursor-pointer"
            >
              {!avatarFailed ? (
                <img
                  src={PHARMACIST_AVATAR}
                  alt={settings.pharmacistName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-7 w-7 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-semibold text-white">
                  ST
                </div>
              )}
              <div className="hidden sm:block max-w-[125px]">
                <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                  {settings.pharmacistName}
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-68 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
                <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {settings.pharmacyName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {sessionUser ? `${sessionUser.username} · ` : ''}{settings.city}
                  </div>
                  {aiQuota && (
                    <div className="mt-1 text-[11px] font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                      AI Quota: {aiQuota.remaining}/{aiQuota.limit} left today
                    </div>
                  )}
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setAuthError(null);
                      setAuthModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#1E314B] cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {sessionUser?.isGuest ? 'Sign In / Create Account' : 'Switch Account'}
                  </button>
                  {sessionUser && !sessionUser.isGuest && (
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out to Guest Workspace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      handleNavigate('settings');
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#1E314B] cursor-pointer"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    Pharmacy Settings & Language
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      handleNavigate('reports');
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#1E314B] cursor-pointer"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Export Audit Reports
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace: Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar & Mobile Collapsible Drawer */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs lg:hidden"
          />
        )}

        <aside
          className={`${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white pt-4 transition-transform duration-200 dark:border-slate-800/80 dark:bg-[#111C2E] lg:static lg:z-auto no-print`}
        >
          <div className="px-4 pb-3 lg:hidden flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <MediQLogoMark className="h-7 w-7" />
              <span className="font-display font-bold text-slate-900 dark:text-slate-50">
                MediQ AI
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-1 text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#17263B] dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Compact Pharmacy Footer Summary */}
          <div className="border-t border-slate-200 p-4 dark:border-slate-800/80">
            <div className="text-xs font-medium text-slate-900 dark:text-slate-200 truncate">
              {settings.pharmacyName}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {medicines.length} SKUs · PKR · Asia/Karachi
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1280px]">
            {activeSection === 'dashboard' && (
              <DashboardView
                medicines={medicines}
                movements={movements}
                theme={settings.theme}
                onNavigate={handleNavigate}
                onOpenAddMedicine={handleOpenAddMedicine}
                onAskAiPrompt={handleAskAiPrompt}
              />
            )}

            {activeSection === 'chatbot' && (
              <ChatbotView
                medicines={medicines}
                movements={movements}
                suppliers={suppliers}
                sessions={sessions}
                activeSessionId={activeSessionId}
                aiMode={settings.aiMode}
                chatbotLanguage={settings.chatbotLanguage}
                aiQuota={aiQuota}
                pendingPrompt={pendingAiPrompt}
                onConsumePendingPrompt={() => setPendingAiPrompt(null)}
                onUpdateSessions={setSessions}
                onSelectSession={setActiveSessionId}
                onChangeAiMode={(mode) => setSettings((p) => ({ ...p, aiMode: mode }))}
                onChangeChatbotLanguage={(lang) =>
                  setSettings((p) => ({ ...p, chatbotLanguage: lang }))
                }
                onUpdateAiQuota={setAiQuota}
              />
            )}

            {activeSection === 'inventory' && (
              <InventoryView
                medicines={medicines}
                suppliers={suppliers}
                initialSearch={inventorySearchHint}
                showAddModalSignal={addMedicineSignal}
                onSaveMedicine={handleSaveMedicine}
                onDeleteMedicine={handleDeleteMedicine}
                onRemoveDemoData={handleRemoveDemoData}
              />
            )}

            {activeSection === 'stock' && (
              <StockManagementView
                medicines={medicines}
                movements={movements}
                preselectedMedicineId={stockMedIdHint}
                onRecordMovement={handleRecordMovement}
              />
            )}

            {activeSection === 'alerts' && (
              <ExpiryAlertsView
                medicines={medicines}
                initialCategory={alertCategoryHint}
                onJumpToStock={(medId) => {
                  setStockMedIdHint(medId);
                  handleNavigate('stock');
                }}
                onAskAi={handleAskAiPrompt}
              />
            )}

            {activeSection === 'suppliers' && (
              <SuppliersView
                suppliers={suppliers}
                medicines={medicines}
                onSaveSupplier={handleSaveSupplier}
                onDeleteSupplier={handleDeleteSupplier}
                onInspectSupplierMedicines={(supplierName) =>
                  handleNavigate('inventory', supplierName)
                }
              />
            )}

            {activeSection === 'reports' && (
              <ReportsView
                medicines={medicines}
                movements={movements}
                pharmacyName={settings.pharmacyName}
              />
            )}

            {activeSection === 'settings' && (
              <SettingsView
                settings={settings}
                medicines={medicines}
                onUpdateSettings={setSettings}
                onRemoveDemoData={handleRemoveDemoData}
                onRestoreDemoData={handleRestoreDemoData}
                onClearChats={() => {
                  setSessions([]);
                  setActiveSessionId(null);
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Floating AI Assistant Launcher (hidden on Chatbot page & print) */}
      {activeSection !== 'chatbot' && (
        <button
          type="button"
          onClick={() => handleNavigate('chatbot')}
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-2xl border border-cyan-500/40 bg-[#111C2E] px-4 py-3 text-xs font-semibold text-cyan-300 shadow-xl transition-transform duration-150 hover:scale-[1.03] hover:border-cyan-400 cursor-pointer no-print"
          aria-label="Open MediQ AI Chatbot"
        >
          <Bot className="h-4 w-4 text-cyan-400" />
          <span>MediQ AI</span>
        </button>
      )}

      {/* Account Sign-In / Registration Modal for Isolated Workspaces */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#17263B]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Pharmacist Workspace Account
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Each account accesses only its own isolated pharmacy data and daily AI quota.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex rounded-xl bg-slate-100 p-1 dark:bg-[#111C2E]">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setAuthError(null);
                }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium cursor-pointer ${
                  authTab === 'login'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-slate-50'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  setAuthError(null);
                }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium cursor-pointer ${
                  authTab === 'register'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-slate-50'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleAuthSubmit(e)} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="e.g., dr_sarah"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Passcode (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  {authBusy
                    ? 'Please wait…'
                    : authTab === 'login'
                      ? 'Sign In'
                      : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
