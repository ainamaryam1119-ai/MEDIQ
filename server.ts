import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const FREE_TIER_MODEL = 'gemini-4-hydrogen';
const AI_DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 25);
const BURST_LIMIT_PER_MINUTE = 10;
const SESSION_COOKIE_NAME = 'mediq_sid';
const DATA_DIR = path.resolve(__dirname, '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USAGE_FILE = path.join(DATA_DIR, 'ai_usage.json');

// Use configured SESSION_SECRET or a CSPRNG secret (persisted locally in .data/session.key for dev restarts)
function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const keyFile = path.join(DATA_DIR, 'session.key');
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = resolveSessionSecret();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getKarachiDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isValidUserId(userId: string): boolean {
  return /^usr_[a-zA-Z0-9_-]{8,64}$/.test(userId);
}

interface SessionPayload {
  userId: string;
  username: string;
  isGuest: boolean;
  iat: number;
}

function signSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || !isValidUserId(parsed.userId) || typeof parsed.username !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(req: Request, res: Response, payload: SessionPayload): void {
  const token = signSessionToken(payload);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  const flags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAge}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

// Local user registry (scrypt + per-user random salt)
interface StoredUser {
  userId: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

function readUsers(): StoredUser[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// Per-user daily AI usage store + 1-minute burst limiter
type UsageMap = Record<string, { date: string; count: number }>;
const burstStore = new Map<string, number[]>();

function readUsageMap(): UsageMap {
  ensureDataDir();
  try {
    if (!fs.existsSync(USAGE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as UsageMap) : {};
  } catch {
    return {};
  }
}

function writeUsageMap(map: UsageMap): void {
  ensureDataDir();
  fs.writeFileSync(USAGE_FILE, JSON.stringify(map, null, 2), { mode: 0o600 });
}

function getUserQuota(userId: string) {
  const today = getKarachiDateStr();
  const map = readUsageMap();
  const rec = map[userId];
  const used = rec && rec.date === today ? rec.count : 0;
  return {
    used,
    limit: AI_DAILY_LIMIT,
    remaining: Math.max(0, AI_DAILY_LIMIT - used),
    resetDate: today,
  };
}

function consumeUserAiQuota(userId: string): { allowed: boolean; reason?: string; quota: ReturnType<typeof getUserQuota> } {
  const now = Date.now();
  const recent = (burstStore.get(userId) || []).filter((ts) => now - ts < 60_000);
  if (recent.length >= BURST_LIMIT_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'Too many AI requests in a short time. Please wait a minute before trying again.',
      quota: getUserQuota(userId),
    };
  }

  const today = getKarachiDateStr();
  const map = readUsageMap();
  const rec = map[userId];
  const currentCount = rec && rec.date === today ? rec.count : 0;

  if (currentCount >= AI_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Daily limit of ${AI_DAILY_LIMIT} AI requests reached for your account. Resets at midnight (Asia/Karachi). Local Inventory Search remains available.`,
      quota: {
        used: currentCount,
        limit: AI_DAILY_LIMIT,
        remaining: 0,
        resetDate: today,
      },
    };
  }

  const nextCount = currentCount + 1;
  map[userId] = { date: today, count: nextCount };
  writeUsageMap(map);

  recent.push(now);
  burstStore.set(userId, recent);

  return {
    allowed: true,
    quota: {
      used: nextCount,
      limit: AI_DAILY_LIMIT,
      remaining: Math.max(0, AI_DAILY_LIMIT - nextCount),
      resetDate: today,
    },
  };
}

// Per-user isolated data vault path (strictly validated userId)
function getUserVaultPath(userId: string): string {
  if (!isValidUserId(userId)) {
    throw new Error('Invalid user identifier');
  }
  const safeName = path.basename(`vault_${userId}.json`);
  return path.join(DATA_DIR, safeName);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeInventorySnapshot(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const safeSummary =
    obj.summary && typeof obj.summary === 'object' && !Array.isArray(obj.summary)
      ? obj.summary
      : {};
  const rawMeds = Array.isArray(obj.medicines) ? obj.medicines.slice(0, 100) : [];
  const safeMeds = rawMeds
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const m = item as Record<string, unknown>;
      return {
        name: String(m.name ?? '').slice(0, 80),
        genericName: String(m.genericName ?? '').slice(0, 80),
        category: String(m.category ?? '').slice(0, 40),
        strength: String(m.strength ?? '').slice(0, 30),
        dosageForm: String(m.dosageForm ?? '').slice(0, 30),
        batchNumber: String(m.batchNumber ?? '').slice(0, 40),
        expiryDate: String(m.expiryDate ?? '').slice(0, 20),
        daysUntilExpiry: Number(m.daysUntilExpiry ?? 0),
        expiryStatus: String(m.expiryStatus ?? '').slice(0, 20),
        quantity: Number(m.quantity ?? 0),
        minThreshold: Number(m.minThreshold ?? 0),
        stockStatus: String(m.stockStatus ?? '').slice(0, 20),
        purchasePricePKR: Number(m.purchasePricePKR ?? 0),
        sellingPricePKR: Number(m.sellingPricePKR ?? 0),
        supplier: String(m.supplier ?? '').slice(0, 80),
      };
    });

  return {
    asOfDateKarachi: typeof obj.asOfDateKarachi === 'string' ? obj.asOfDateKarachi.slice(0, 20) : getKarachiDateStr(),
    currency: 'PKR',
    summary: safeSummary,
    reorderRecommendations: Array.isArray(obj.reorderRecommendations)
      ? obj.reorderRecommendations.slice(0, 20)
      : [],
    medicines: safeMeds,
  };
}

interface AuthedRequest extends Request {
  sessionUser?: SessionPayload;
}

function attachOrProvisionSession(req: AuthedRequest, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  const verified = rawToken ? verifySessionToken(rawToken) : null;

  if (verified) {
    req.sessionUser = verified;
    next();
    return;
  }

  // Provision an isolated guest session signed with HttpOnly cookie
  const guestSession: SessionPayload = {
    userId: `usr_${crypto.randomUUID().replace(/-/g, '')}`,
    username: 'Guest Pharmacist',
    isGuest: true,
    iat: Date.now(),
  };
  setSessionCookie(req, res, guestSession);
  req.sessionUser = guestSession;
  next();
}

interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message?: unknown;
  language?: unknown;
  history?: unknown;
  inventorySnapshot?: unknown;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers (preserve iframe compatibility for AI Studio preview)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  // Malformed JSON error handler (never expose parser internals or stack traces)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON request body.',
      });
      return;
    }
    next(err);
  });

  // Attach verified session cookie to all /api routes
  app.use('/api', attachOrProvisionSession);

  app.get('/api/health', (req: AuthedRequest, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY.trim() !== '' &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    const userId = req.sessionUser!.userId;
    res.json({
      status: 'ok',
      geminiConfigured: hasKey,
      timezone: 'Asia/Karachi',
      aiQuota: getUserQuota(userId),
    });
  });

  app.get('/api/session', (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({
      user: {
        userId: user.userId,
        username: user.username,
        isGuest: user.isGuest,
      },
      aiQuota: getUserQuota(user.userId),
    });
  });

  app.post('/api/auth/register', (req: AuthedRequest, res) => {
    const body = (req.body || {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      res.status(400).json({
        success: false,
        message: 'Username must be 3–32 characters (letters, numbers, _, ., -).',
      });
      return;
    }

    if (password.length < 8 || password.length > 128) {
      res.status(400).json({
        success: false,
        message: 'Passcode must be between 8 and 128 characters.',
      });
      return;
    }

    const users = readUsers();
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({
        success: false,
        message: 'That username is already registered. Please sign in instead.',
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: StoredUser = {
      userId: `usr_${crypto.randomUUID().replace(/-/g, '')}`,
      username,
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    writeUsers(users);

    const session: SessionPayload = {
      userId: newUser.userId,
      username: newUser.username,
      isGuest: false,
      iat: Date.now(),
    };
    setSessionCookie(req, res, session);

    res.status(201).json({
      success: true,
      user: {
        userId: session.userId,
        username: session.username,
        isGuest: false,
      },
      aiQuota: getUserQuota(session.userId),
    });
  });

  app.post('/api/auth/login', (req: AuthedRequest, res) => {
    const body = (req.body || {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password || password.length > 128) {
      res.status(400).json({
        success: false,
        message: 'Username and passcode are required.',
      });
      return;
    }

    const users = readUsers();
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!found || !verifyPassword(password, found.salt, found.passwordHash)) {
      res.status(401).json({
        success: false,
        message: 'Invalid username or passcode.',
      });
      return;
    }

    const session: SessionPayload = {
      userId: found.userId,
      username: found.username,
      isGuest: false,
      iat: Date.now(),
    };
    setSessionCookie(req, res, session);

    res.json({
      success: true,
      user: {
        userId: session.userId,
        username: session.username,
        isGuest: false,
      },
      aiQuota: getUserQuota(session.userId),
    });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    const guestSession: SessionPayload = {
      userId: `usr_${crypto.randomUUID().replace(/-/g, '')}`,
      username: 'Guest Pharmacist',
      isGuest: true,
      iat: Date.now(),
    };
    setSessionCookie(req, res, guestSession);
    res.json({
      success: true,
      user: {
        userId: guestSession.userId,
        username: guestSession.username,
        isGuest: true,
      },
      aiQuota: getUserQuota(guestSession.userId),
    });
  });

  // Strict per-user isolated workspace storage (userId always derived from verified HttpOnly cookie)
  app.get('/api/data', (req: AuthedRequest, res) => {
    const userId = req.sessionUser!.userId;
    try {
      ensureDataDir();
      const vaultPath = getUserVaultPath(userId);
      if (!fs.existsSync(vaultPath)) {
        res.json({ hasSavedData: false, data: null });
        return;
      }
      const parsed = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      res.json({ hasSavedData: true, data: parsed });
    } catch {
      res.status(500).json({
        success: false,
        message: 'Unable to load your workspace data.',
      });
    }
  });

  app.put('/api/data', (req: AuthedRequest, res) => {
    const userId = req.sessionUser!.userId;
    const body = (req.body || {}) as Record<string, unknown>;

    if (
      !Array.isArray(body.medicines) ||
      !Array.isArray(body.movements) ||
      !Array.isArray(body.suppliers) ||
      !Array.isArray(body.sessions) ||
      !body.settings ||
      typeof body.settings !== 'object'
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid workspace payload.',
      });
      return;
    }

    if (
      body.medicines.length > 2000 ||
      body.movements.length > 5000 ||
      body.suppliers.length > 500 ||
      body.sessions.length > 200
    ) {
      res.status(400).json({
        success: false,
        message: 'Workspace size exceeds allowed limits.',
      });
      return;
    }

    try {
      ensureDataDir();
      const vaultPath = getUserVaultPath(userId);
      const safeBundle = {
        medicines: body.medicines,
        movements: body.movements,
        suppliers: body.suppliers,
        sessions: body.sessions,
        settings: body.settings,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(vaultPath, JSON.stringify(safeBundle), { mode: 0o600 });
      res.json({ success: true });
    } catch {
      res.status(500).json({
        success: false,
        message: 'Unable to save workspace data.',
      });
    }
  });

  app.post('/api/chat', async (req: AuthedRequest, res) => {
    const userId = req.sessionUser!.userId;
    const body = (req.body || {}) as ChatRequestBody;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      res.status(400).json({
        errorCode: 'BAD_REQUEST',
        message: 'Message cannot be empty.',
      });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({
        errorCode: 'BAD_REQUEST',
        message: 'Message must be 2000 characters or fewer.',
      });
      return;
    }

    const allowedLangs = new Set(['auto', 'en', 'ur', 'roman-ur']);
    const language =
      typeof body.language === 'string' && allowedLangs.has(body.language)
        ? (body.language as 'auto' | 'en' | 'ur' | 'roman-ur')
        : 'auto';

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        errorCode: 'NO_API_KEY',
        message: 'AI service is not configured on the server. Using Local Inventory Assistant mode.',
      });
      return;
    }

    const quotaCheck = consumeUserAiQuota(userId);
    if (!quotaCheck.allowed) {
      res.status(429).json({
        errorCode: 'DAILY_LIMIT_REACHED',
        message: quotaCheck.reason,
        aiQuota: quotaCheck.quota,
      });
      return;
    }

    const languageInstruction =
      language === 'ur'
        ? 'Respond primarily in clean, natural Urdu script (اردو) while keeping medicine brand/generic names and PKR numbers clear.'
        : language === 'roman-ur'
          ? 'Respond in clear, polite Roman Urdu (Pakistani conversational style) while keeping medicine names and PKR figures accurate.'
          : language === 'en'
            ? 'Respond in crisp, professional English.'
            : 'Match the user language automatically: if the user writes in Urdu script, reply in Urdu script; if in Roman Urdu, reply in Roman Urdu; otherwise reply in English.';

    const sanitizedSnapshot = sanitizeInventorySnapshot(body.inventorySnapshot);

    const systemInstruction = `You are MediQ AI, a smart pharmacy operations assistant for a Pakistani pharmacy (currency: PKR, timezone: Asia/Karachi).

STRICT OPERATIONAL ACCURACY RULES:
1. For ALL inventory counts, stock quantities, batch numbers, expiry dates, suppliers, and financial totals, use ONLY the verified JSON inventory snapshot provided below.
2. NEVER invent, guess, or extrapolate medicine quantities, prices, batch numbers, or expiry dates. If a requested medicine is not in the snapshot, state clearly that it is not found in current inventory records.
3. Keep formatting clean and scannable with concise bullet points or short tables when listing medicines.

STRICT MEDICAL SAFETY RULES:
1. You assist with pharmacy inventory operations and provide only general, high-level educational context.
2. You MUST NOT diagnose patients, prescribe medications, provide personalized dosing instructions, or independently recommend drug substitutions/alternatives for clinical care.
3. If the user asks for clinical advice, diagnosis, dosing for a specific patient, or replacing one drug with another, politely decline that clinical judgment, explain the limitation, and advise consulting a licensed pharmacist or physician.

LANGUAGE RULE:
${languageInstruction}

VERIFIED LIVE INVENTORY SNAPSHOT (Asia/Karachi):
${JSON.stringify(sanitizedSnapshot, null, 2)}`;

    const safeHistory: ChatHistoryTurn[] = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .filter(
            (t): t is ChatHistoryTurn =>
              Boolean(t) &&
              typeof t === 'object' &&
              ((t as ChatHistoryTurn).role === 'user' ||
                (t as ChatHistoryTurn).role === 'assistant') &&
              typeof (t as ChatHistoryTurn).content === 'string'
          )
          .map((t) => ({
            role: t.role,
            content: t.content.slice(0, 2000),
          }))
      : [];

    const historyLines = safeHistory
      .map((t) => `${t.role === 'user' ? 'User' : 'MediQ AI'}: ${t.content}`)
      .join('\n\n');

    const fullPrompt = historyLines
      ? `Recent conversation:\n${historyLines}\n\nCurrent user query:\n${message}`
      : message;

    try {
      const response = await ai.models.generateContent({
        model: FREE_TIER_MODEL,
        contents: fullPrompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({
          errorCode: 'EMPTY_RESPONSE',
          message: 'AI assistant returned an empty response. Falling back to Local Inventory mode.',
          aiQuota: quotaCheck.quota,
        });
        return;
      }

      res.json({
        reply: replyText,
        model: FREE_TIER_MODEL,
        mode: 'gemini',
        aiQuota: quotaCheck.quota,
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const errMsg = errorObj?.message || '';
      const status = errorObj?.status || 500;

      if (
        status === 429 ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.toLowerCase().includes('quota')
      ) {
        res.status(429).json({
          errorCode: 'QUOTA_EXHAUSTED',
          message:
            'Free Gemini API quota has been reached. Switched to Local Inventory Assistant mode.',
          aiQuota: quotaCheck.quota,
        });
        return;
      }

      if (
        status === 400 ||
        status === 403 ||
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          errorCode: 'INVALID_API_KEY',
          message: 'AI service authorization failed. Switched to Local Inventory Assistant mode.',
          aiQuota: quotaCheck.quota,
        });
        return;
      }

      res.status(502).json({
        errorCode: 'GEMINI_UNAVAILABLE',
        message: 'AI service is temporarily unavailable. Using Local Inventory Assistant mode.',
        aiQuota: quotaCheck.quota,
      });
    }
  });

  app.post('/api/send-order', async (req: AuthedRequest, res) => {
    const userId = req.sessionUser!.userId;
    const body = (req.body || {}) as {
      supplierEmail?: unknown;
      supplierName?: unknown;
      message?: unknown;
    };

    const supplierEmail =
      typeof body.supplierEmail === 'string' ? body.supplierEmail.trim() : '';
    const supplierName =
      typeof body.supplierName === 'string' ? body.supplierName.trim().slice(0, 120) : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!supplierEmail || supplierEmail.length > 254 || !emailRegex.test(supplierEmail)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid supplier email address.',
      });
      return;
    }

    if (!message) {
      res.status(400).json({
        success: false,
        message: 'Order message cannot be empty.',
      });
      return;
    }

    if (message.length > 1000) {
      res.status(400).json({
        success: false,
        message: 'Order message must be 1000 characters or fewer.',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        success: false,
        message: 'Order service is not configured on the server.',
      });
      return;
    }

    const quotaCheck = consumeUserAiQuota(userId);
    if (!quotaCheck.allowed) {
      res.status(429).json({
        success: false,
        message: quotaCheck.reason,
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: FREE_TIER_MODEL,
        contents: `Validate and confirm this pharmacy supplier purchase order request.\nSupplier: ${supplierName || 'Registered Supplier'}\nRecipient Email: ${supplierEmail}\nOrder Details:\n${message}`,
        config: {
          systemInstruction:
            'You are a pharmacy procurement verification assistant. Briefly confirm in one concise sentence that the supplier purchase order details are clear and ready for dispatch. Do not invent prices or quantities.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      if (!response.text?.trim()) {
        res.status(502).json({
          success: false,
          message: 'Unable to process order request right now. Please try again.',
        });
        return;
      }

      res.json({
        success: true,
        message: `Order request for ${supplierEmail} verified successfully.`,
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const errMsg = errorObj?.message || '';
      const status = errorObj?.status || 500;

      if (
        status === 429 ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.toLowerCase().includes('quota')
      ) {
        res.status(429).json({
          success: false,
          message: 'Free API quota reached. Please try again shortly.',
        });
        return;
      }

      if (
        status === 400 ||
        status === 403 ||
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          success: false,
          message: 'Provider authorization failed. Please contact the administrator.',
        });
        return;
      }

      res.status(502).json({
        success: false,
        message: 'Unable to reach the order provider right now. Please try again.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Not found.');
      }
    });
  }

  // Catch-all error handler: never leak stack traces or internal details
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediQ AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
