import React, { useState } from 'react';
import { Moon, Sun, RotateCcw, Trash2, Download, ShieldCheck } from 'lucide-react';
import type {
  AiModePreference,
  AppLanguage,
  ChatbotLanguage,
  Medicine,
  PharmacySettings,
} from '../types/pharmacy';

interface SettingsViewProps {
  settings: PharmacySettings;
  medicines: Medicine[];
  onUpdateSettings: (next: PharmacySettings) => void;
  onRemoveDemoData: () => void;
  onRestoreDemoData: () => void;
  onClearChats: () => void;
}

export function SettingsView({
  settings,
  medicines,
  onUpdateSettings,
  onRemoveDemoData,
  onRestoreDemoData,
  onClearChats,
}: SettingsViewProps) {
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const demoCount = medicines.filter((m) => m.isDemo).length;

  const update = (partial: Partial<PharmacySettings>) => {
    onUpdateSettings({ ...settings, ...partial });
    setSavedNotice('Settings saved locally.');
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const handleDownloadBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      timezone: 'Asia/Karachi',
      settings,
      medicines,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Settings & Preferences
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Configure pharmacy profile, Midnight Clinical / Light theme, multilingual support, and demo data.
          </p>
        </div>
        {savedNotice && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {savedNotice}
          </span>
        )}
      </div>

      {/* Pharmacy Profile */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-[#17263B]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Pharmacy Profile
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Pharmacy Name
            </label>
            <input
              type="text"
              value={settings.pharmacyName}
              onChange={(e) => update({ pharmacyName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Lead Pharmacist
            </label>
            <input
              type="text"
              value={settings.pharmacistName}
              onChange={(e) => update({ pharmacistName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              City / Region
            </label>
            <input
              type="text"
              value={settings.city}
              onChange={(e) => update({ city: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Timezone & Currency
            </label>
            <input
              type="text"
              readOnly
              value="Asia/Karachi · Pakistani Rupee (PKR)"
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-[#111C2E]/60 dark:text-slate-400"
            />
          </div>
        </div>
      </section>

      {/* Appearance & Language */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-[#17263B]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Theme & Multilingual Settings
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Visual Theme
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update({ theme: 'dark' })}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-300'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Midnight
              </button>
              <button
                type="button"
                onClick={() => update({ theme: 'light' })}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer ${
                  settings.theme === 'light'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-300'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Interface Language
            </label>
            <select
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as AppLanguage })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            >
              <option value="en">English</option>
              <option value="ur">اردو (Urdu)</option>
              <option value="roman-ur">Roman Urdu</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Chatbot Default Language
            </label>
            <select
              value={settings.chatbotLanguage}
              onChange={(e) => update({ chatbotLanguage: e.target.value as ChatbotLanguage })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            >
              <option value="auto">Auto Detect</option>
              <option value="en">English</option>
              <option value="ur">اردو (Urdu)</option>
              <option value="roman-ur">Roman Urdu</option>
            </select>
          </div>
        </div>
      </section>

      {/* AI Engine & Cost Guardrail */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-[#17263B]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              AI Assistant Engine (100% Free-Tier Safe)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              MediQ AI uses only the free-tier-eligible Gemini model on the server side when configured via environment secrets, and automatically switches to the local non-generative inventory search engine whenever offline or quota-limited. No paid APIs or billing-required services are enabled.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ aiMode: 'auto' as AiModePreference })}
            className={`rounded-xl border px-4 py-2 text-xs font-medium cursor-pointer ${
              settings.aiMode === 'auto'
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-300'
            }`}
          >
            Auto (Gemini Free Tier + Local Fallback)
          </button>
          <button
            type="button"
            onClick={() => update({ aiMode: 'local' as AiModePreference })}
            className={`rounded-xl border px-4 py-2 text-xs font-medium cursor-pointer ${
              settings.aiMode === 'local'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-300'
            }`}
          >
            Local Inventory Search Only (Zero API Calls)
          </button>
        </div>
      </section>

      {/* Demo Data & Local Storage Management */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-[#17263B]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Demo Data & Local Storage
        </h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Currently storing {medicines.length} medicine records in browser localStorage ({demoCount} marked as DEMO DATA).
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onRemoveDemoData}
            disabled={demoCount === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-40 dark:text-red-300 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Demo Data ({demoCount})
          </button>
          <button
            type="button"
            onClick={onRestoreDemoData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore 30 Sample Records
          </button>
          <button
            type="button"
            onClick={onClearChats}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            Clear Chat History
          </button>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON Backup
          </button>
        </div>
      </section>
    </div>
  );
}
