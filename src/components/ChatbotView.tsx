import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Plus,
  Copy,
  Check,
  Trash2,
  History,
  X,
  AlertTriangle,
  ShieldCheck,
  Cpu,
  Globe,
} from 'lucide-react';
import type {
  AiModePreference,
  ChatbotLanguage,
  ChatMessage,
  ChatSession,
  Medicine,
  StockMovement,
  Supplier,
} from '../types/pharmacy';
import {
  buildVerifiedInventorySnapshot,
  formatKarachiTime,
} from '../utils/inventoryEngine';
import {
  containsUrduScript,
  runLocalInventoryChatbot,
} from '../utils/localChatbot';
import { MediQAssistantAvatar } from './BrandLogo';

export interface AiQuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  resetDate: string;
}

interface ChatbotViewProps {
  medicines: Medicine[];
  movements: StockMovement[];
  suppliers: Supplier[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  aiMode: AiModePreference;
  chatbotLanguage: ChatbotLanguage;
  aiQuota: AiQuotaInfo | null;
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
  onUpdateSessions: (sessions: ChatSession[]) => void;
  onSelectSession: (id: string | null) => void;
  onChangeAiMode: (mode: AiModePreference) => void;
  onChangeChatbotLanguage: (lang: ChatbotLanguage) => void;
  onUpdateAiQuota: (quota: AiQuotaInfo) => void;
}

const SUGGESTED_PROMPTS = [
  {
    label: 'Daily Summary',
    prompt: "Give me today's pharmacy summary.",
  },
  {
    label: 'Expiring Next Month',
    prompt: 'Which medicines are expiring next month?',
  },
  {
    label: 'Low Stock (<10)',
    prompt: 'Show medicines with stock below 10.',
  },
  {
    label: 'Inventory Value',
    prompt: 'What is the total inventory value?',
  },
  {
    label: 'Reorder Plan',
    prompt: 'Which products should I reorder?',
  },
  {
    label: 'Expired Batches',
    prompt: 'Show expired medicines.',
  },
  {
    label: 'Paracetamol Check',
    prompt: 'How much Paracetamol is available?',
  },
  {
    label: 'Roman Urdu',
    prompt: 'Aglay mahine konsi dawaiyan expire hongi?',
  },
  {
    label: 'اردو سوال',
    prompt: 'کم اسٹاک والی ادویات دکھائیں',
  },
];

export function ChatbotView({
  medicines,
  movements,
  suppliers,
  sessions,
  activeSessionId,
  aiMode,
  chatbotLanguage,
  aiQuota,
  pendingPrompt,
  onConsumePendingPrompt,
  onUpdateSessions,
  onSelectSession,
  onChangeAiMode,
  onChangeChatbotLanguage,
  onUpdateAiQuota,
}: ChatbotViewProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [serverGeminiReady, setServerGeminiReady] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setServerGeminiReady(Boolean(data?.geminiConfigured));
        if (data?.aiQuota) {
          onUpdateAiQuota(data.aiQuota as AiQuotaInfo);
        }
      })
      .catch(() => {
        setServerGeminiReady(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isSending]);

  useEffect(() => {
    if (pendingPrompt) {
      onConsumePendingPrompt();
      void handleSend(pendingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  const handleNewChat = () => {
    onSelectSession(null);
    setApiNotice(null);
    setShowHistoryMobile(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    onUpdateSessions(updated);
    if (activeSessionId === id) {
      onSelectSession(updated[0]?.id ?? null);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSend = async (overrideText?: string) => {
    const query = (overrideText ?? input).trim();
    if (!query || isSending) return;

    if (!overrideText) setInput('');
    setApiNotice(null);

    const nowIso = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: query,
      timestamp: nowIso,
    };

    let targetSessionId = activeSessionId;
    let workingSessions = [...sessions];

    if (!targetSessionId) {
      targetSessionId = `chat-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: query.length > 42 ? `${query.slice(0, 40)}…` : query,
        createdAt: nowIso,
        updatedAt: nowIso,
        messages: [userMsg],
      };
      workingSessions = [newSession, ...workingSessions];
      onUpdateSessions(workingSessions);
      onSelectSession(targetSessionId);
    } else {
      workingSessions = workingSessions.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              updatedAt: nowIso,
              messages: [...s.messages, userMsg],
            }
          : s
      );
      onUpdateSessions(workingSessions);
    }

    setIsSending(true);

    const currentHistory =
      workingSessions
        .find((s) => s.id === targetSessionId)
        ?.messages.slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content })) ?? [];

    let assistantMsg: ChatMessage;

    if (aiMode === 'local') {
      const localRes = runLocalInventoryChatbot(
        query,
        medicines,
        movements,
        suppliers,
        chatbotLanguage
      );
      assistantMsg = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: localRes.reply,
        timestamp: new Date().toISOString(),
        mode: 'local',
        suggestedFollowUps: localRes.suggestedFollowUps,
      };
    } else {
      try {
        const snapshot = buildVerifiedInventorySnapshot(medicines, movements);
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: query,
            language: chatbotLanguage,
            history: currentHistory,
            inventorySnapshot: snapshot,
          }),
        });

        const data = await res.json();
        if (data?.aiQuota) {
          onUpdateAiQuota(data.aiQuota as AiQuotaInfo);
        }

        if (!res.ok) {
          const reason =
            data?.message ||
            'Gemini AI is currently unavailable. Falling back to Local Inventory Search mode.';
          setApiNotice(reason);
          const localFallback = runLocalInventoryChatbot(
            query,
            medicines,
            movements,
            suppliers,
            chatbotLanguage
          );
          assistantMsg = {
            id: `msg-${Date.now()}-a`,
            role: 'assistant',
            content: localFallback.reply,
            timestamp: new Date().toISOString(),
            mode: 'local',
            isErrorNotice: true,
            suggestedFollowUps: localFallback.suggestedFollowUps,
          };
        } else {
          assistantMsg = {
            id: `msg-${Date.now()}-a`,
            role: 'assistant',
            content: data.reply,
            timestamp: new Date().toISOString(),
            mode: 'gemini',
            model: data.model || 'gemini-4-hydrogen',
          };
        }
      } catch {
        setApiNotice(
          'Network connection to AI server failed. Answered using Local Inventory Search mode.'
        );
        const localFallback = runLocalInventoryChatbot(
          query,
          medicines,
          movements,
          suppliers,
          chatbotLanguage
        );
        assistantMsg = {
          id: `msg-${Date.now()}-a`,
          role: 'assistant',
          content: localFallback.reply,
          timestamp: new Date().toISOString(),
          mode: 'local',
          isErrorNotice: true,
          suggestedFollowUps: localFallback.suggestedFollowUps,
        };
      }
    }

    const finalSessions = workingSessions.map((s) =>
      s.id === targetSessionId
        ? {
            ...s,
            updatedAt: assistantMsg.timestamp,
            messages: [...s.messages, assistantMsg],
          }
        : s
    );

    onUpdateSessions(finalSessions);
    setIsSending(false);
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#17263B]">
      {/* Left Conversation History Drawer (Desktop) + Mobile Overlay */}
      <aside
        className={`${
          showHistoryMobile
            ? 'fixed inset-y-0 left-0 z-40 flex w-72 shadow-xl'
            : 'hidden lg:flex lg:w-68'
        } flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-[#111C2E] shrink-0`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800/80">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
          {showHistoryMobile && (
            <button
              type="button"
              onClick={() => setShowHistoryMobile(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          <div className="px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Conversation History ({sessions.length})
          </div>
          {sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Your pharmacy queries will appear here.
            </p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    setShowHistoryMobile(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSelectSession(session.id);
                      setShowHistoryMobile(false);
                    }
                  }}
                  className={`group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-slate-50'
                      : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-[#17263B]/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{session.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                      {formatKarachiTime(session.updatedAt)} · {session.messages.length} msgs
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 cursor-pointer"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Panel */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setShowHistoryMobile(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open conversation history"
            >
              <History className="h-4 w-4" />
            </button>
            <MediQAssistantAvatar className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                MediQ AI Pharmacy Assistant
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                {aiMode === 'local'
                  ? 'Local Inventory Search Mode (Non-Generative · Zero API usage)'
                  : serverGeminiReady
                    ? `Gemini Free-Tier${aiQuota ? ` · ${aiQuota.remaining}/${aiQuota.limit} daily AI calls left` : ''}`
                    : 'Auto Mode (Local Inventory Fallback Active)'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switch */}
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-[#111C2E]">
              <button
                type="button"
                onClick={() => onChangeAiMode('auto')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  aiMode === 'auto'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-cyan-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Gemini AI
              </button>
              <button
                type="button"
                onClick={() => onChangeAiMode('local')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  aiMode === 'local'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-[#17263B] dark:text-emerald-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Local Search
              </button>
            </div>

            {/* Language Selector */}
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-200">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={chatbotLanguage}
                onChange={(e) => onChangeChatbotLanguage(e.target.value as ChatbotLanguage)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
                aria-label="Chatbot response language"
              >
                <option value="auto" className="dark:bg-[#111C2E]">Auto Detect</option>
                <option value="en" className="dark:bg-[#111C2E]">English</option>
                <option value="ur" className="dark:bg-[#111C2E]">اردو (Urdu)</option>
                <option value="roman-ur" className="dark:bg-[#111C2E]">Roman Urdu</option>
              </select>
            </label>
          </div>
        </div>

        {/* Friendly API / Quota Notice Banner */}
        {apiNotice && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>{apiNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setApiNotice(null)}
              className="rounded p-1 hover:bg-amber-500/20 cursor-pointer"
              aria-label="Dismiss notice"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-6 text-center">
              <MediQAssistantAvatar className="h-14 w-14" />
              <h3 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-50 text-balance">
                Ask MediQ AI about your pharmacy inventory
              </h3>
              <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
                Query live stock levels, expiring batches, PKR valuation, and reorder priorities in English, Urdu (اردو), or Roman Urdu. Every number is calculated directly from your stored inventory.
              </p>

              <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {SUGGESTED_PROMPTS.map((item) => {
                  const isUrdu = containsUrduScript(item.prompt);
                  return (
                    <button
                      key={item.prompt}
                      type="button"
                      onClick={() => void handleSend(item.prompt)}
                      className="flex flex-col items-start rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-left transition-all hover:border-cyan-500/40 hover:bg-white dark:border-slate-800 dark:bg-[#111C2E]/70 dark:hover:border-cyan-400/40 dark:hover:bg-[#111C2E] cursor-pointer"
                    >
                      <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                        {item.label}
                      </span>
                      <span
                        dir={isUrdu ? 'rtl' : 'ltr'}
                        className={`mt-1 w-full text-xs font-medium text-slate-800 dark:text-slate-200 ${
                          isUrdu ? 'font-urdu text-right' : ''
                        }`}
                      >
                        {item.prompt}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  Operational & educational assistance only — never diagnoses, prescribes, or substitutes medications.
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {activeSession.messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isUrdu = containsUrduScript(msg.content);

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && <MediQAssistantAvatar className="h-8 w-8 shrink-0 mt-1" />}

                    <div
                      className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-100'
                      }`}
                    >
                      {!isUser && (
                        <div className="mb-1.5 flex items-center justify-between gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            {msg.mode === 'gemini'
                              ? `Gemini AI (${msg.model ?? 'gemini-4-hydrogen'})`
                              : 'Local Inventory Search (Non-Generative)'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopy(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div
                        dir={isUrdu ? 'rtl' : 'ltr'}
                        className={`whitespace-pre-wrap text-sm leading-relaxed ${
                          isUrdu ? 'font-urdu text-right' : ''
                        }`}
                      >
                        {msg.content}
                      </div>

                      <div
                        className={`mt-2 text-[11px] tabular-nums ${
                          isUser ? 'text-emerald-100/80 text-right' : 'text-slate-400'
                        }`}
                      >
                        {formatKarachiTime(msg.timestamp)}
                      </div>

                      {!isUser && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                          {msg.suggestedFollowUps.map((followUp) => (
                            <button
                              key={followUp}
                              type="button"
                              onClick={() => void handleSend(followUp)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-cyan-500/40 hover:text-cyan-700 dark:border-slate-700 dark:bg-[#17263B] dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-start gap-3">
                  <MediQAssistantAvatar className="h-8 w-8 shrink-0" />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-400">
                    Analyzing live inventory records…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Composer */}
        <div className="border-t border-slate-200 p-3 sm:p-4 dark:border-slate-800/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="mx-auto flex max-w-3xl items-center gap-2"
          >
            <input
              type="text"
              maxLength={2000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              dir={containsUrduScript(input) ? 'rtl' : 'ltr'}
              placeholder="Ask in English, اردو, or Roman Urdu (e.g., How much Paracetamol is available?)…"
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
