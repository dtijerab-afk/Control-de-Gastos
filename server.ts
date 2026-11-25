import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'gemini-4-hydrogen';
const PORT = Number(process.env.PORT) || 3000;

function verifyFirebaseToken() {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authorization = req.headers.authorization || '';
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        res.status(401).json({ error: 'Tu sesión no está autorizada. Inicia sesión nuevamente.' });
        return;
      }
      const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!rawServiceAccount) {
        res.status(503).json({ error: 'El servidor aún no tiene configurada la verificación segura de Firebase.' });
        return;
      }
      let adminApp = getApps()[0];
      if (!adminApp) {
        const serviceAccount = JSON.parse(rawServiceAccount);
        serviceAccount.private_key = String(serviceAccount.private_key || '').replace(/\\n/g, '\n');
        adminApp = initializeApp({ credential: cert(serviceAccount) });
      }
      const decoded = await getAdminAuth(adminApp).verifyIdToken(match[1]);
      (req as express.Request & { firebaseUid?: string }).firebaseUid = decoded.uid;
      next();
    } catch {
      res.status(401).json({ error: 'La sesión no es válida o ha vencido. Vuelve a iniciar sesión.' });
    }
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(
      new Error(
        'Falta configurar GEMINI_API_KEY en el servidor (en AI Studio revísalo en Settings > Secrets).'
      ),
      { statusCode: 500 }
    );
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

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /503|500|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed/i.test(msg);
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  throw lastError;
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const customStatus =
    typeof err === 'object' && err !== null && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode)
      : 0;

  if (customStatus >= 400 && customStatus < 600) {
    return { status: customStatus, message: raw };
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(raw)) {
    return {
      status: 403,
      message:
        'La clave de Gemini API no es válida o no tiene permisos. Verifica tu clave en Settings > Secrets.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
    return {
      status: 429,
      message:
        'Se alcanzó el límite temporal de solicitudes de la API de Gemini. Intenta de nuevo en unos momentos o revisa tu plan en Settings > Secrets.',
    };
  }
  if (/NOT_FOUND|404/i.test(raw)) {
    return {
      status: 404,
      message: 'El modelo de IA configurado no está disponible en este momento.',
    };
  }
  return {
    status: 500,
    message: raw || 'Ocurrió un error al consultar el servicio de IA.',
  };
}

interface ParseStatementRequest {
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  currency?: string;
  defaultMonthKey?: string;
  categories?: { id: string; name: string; type: 'ingreso' | 'gasto' }[];
}

interface FinancialSnapshot {
  selectedMonth: string;
  currency: string;
  monthIncome: number;
  monthExpense: number;
  netBalance: number;
  q1Income: number;
  q1Expense: number;
  q2Income: number;
  q2Expense: number;
  globalBudget: number;
  topExpenseCategories: { name: string; spent: number; budget: number }[];
  debts: {
    name: string;
    institution: string;
    remainingAmount: number;
    monthlyPayment: number;
    interestRate: number;
    dueDay: number;
    nextDueDate: string;
    status: string;
  }[];
  savingsPlan: {
    monthlyTarget: number;
    effectiveMonthlySaved: number;
    goalsCount: number;
    totalGoalRemaining: number;
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // CORS cerrado: solo se permite el frontend oficial y el origen adicional configurado.
  const allowedOrigins = new Set([
    'https://dtijerab-afk.github.io',
    ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : []),
  ]);
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'Origen no autorizado.' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Las rutas de IA requieren token Firebase válido y límite básico por usuario.
  const requestWindows = new Map<string, { count: number; resetAt: number }>();
  app.use('/api/ai', verifyFirebaseToken(), (req, res, next) => {
    const uid = (req as express.Request & { firebaseUid?: string }).firebaseUid || req.ip || 'unknown';
    const now = Date.now();
    const windowState = requestWindows.get(uid);
    if (!windowState || now >= windowState.resetAt) {
      requestWindows.set(uid, { count: 1, resetAt: now + 15 * 60 * 1000 });
      next();
      return;
    }
    if (windowState.count >= 20) {
      res.status(429).json({ error: 'Alcanzaste el límite temporal de consultas de IA. Intenta más tarde.' });
      return;
    }
    windowState.count += 1;
    next();
  });

  // 1. Parse Bank Statement (PDF or Image) into structured transactions & optional debt details
  app.post('/api/ai/parse-statement', async (req, res) => {
    try {
      const body = (req.body ?? {}) as ParseStatementRequest;
      const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
      const currency = typeof body.currency === 'string' ? body.currency : 'MXN';
      const defaultMonthKey =
        typeof body.defaultMonthKey === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(body.defaultMonthKey)
          ? body.defaultMonthKey
          : new Date().toISOString().slice(0, 7);
      const categories = Array.isArray(body.categories) ? body.categories.slice(0, 50) : [];

      if (!fileBase64) {
        res.status(400).json({ error: 'No se recibió el archivo para analizar.' });
        return;
      }

      const allowedMime =
        mimeType === 'application/pdf' || mimeType.startsWith('image/');
      if (!allowedMime) {
        res
          .status(400)
          .json({ error: 'Formato no compatible. Sube un PDF o una foto (JPG, PNG, WEBP).' });
        return;
      }

      const ai = getGeminiClient();

      const catListText =
        categories.length > 0
          ? categories.map((c) => `- ${c.name} (${c.type})`).join('\n')
          : '- Nómina quincenal (ingreso)\n- Supermercado y despensa (gasto)\n- Servicios del hogar (gasto)\n- Restaurantes y ocio (gasto)';

      const prompt = [
        `Analiza este extracto bancario, estado de cuenta o comprobante (archivo: "${body.fileName || 'extracto'}").`,
        `Moneda principal del usuario: ${currency}. Mes de referencia si no aparece año/mes explícito: ${defaultMonthKey}.`,
        'Categorías disponibles del usuario (asigna exactamente uno de estos nombres cuando encaje mejor):',
        catListText,
        '',
        'Instrucciones estrictas:',
        '1. Extrae los movimientos reales visibles (máximo 40 movimientos más relevantes). No inventes movimientos.',
        '2. Cada monto debe ser un número positivo (sin signo negativo). Usa type="ingreso" para abonos/depósitos/pagos recibidos y type="gasto" para compras/cargos/retiros/cuotas.',
        '3. Formato de fecha obligatorio YYYY-MM-DD. Si solo aparece día y mes, usa el año de referencia.',
        '4. Si el documento corresponde a una tarjeta de crédito, préstamo o deuda y muestra saldo total, pago mínimo/cuota mensual, fecha límite de pago, día de corte o tasa de interés, llena detectedDebt con hasDebtInfo=true.',
        '5. Responde en español claro y conciso.',
      ].join('\n');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: fileBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            systemInstruction:
              'Eres un extractor contable preciso para una app de finanzas personales en español. Extrae únicamente datos visibles en el documento bancario sin inventar cifras.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bankName: {
                  type: Type.STRING,
                  description: 'Nombre del banco o entidad detectada.',
                },
                statementPeriod: {
                  type: Type.STRING,
                  description: 'Periodo del extracto si aparece (ej. Noviembre 2026).',
                },
                summary: {
                  type: Type.STRING,
                  description: 'Resumen breve en 1-2 frases de lo encontrado en el documento.',
                },
                detectedDebt: {
                  type: Type.OBJECT,
                  properties: {
                    hasDebtInfo: { type: Type.BOOLEAN },
                    name: { type: Type.STRING },
                    institution: { type: Type.STRING },
                    totalBalance: { type: Type.NUMBER },
                    minimumPayment: { type: Type.NUMBER },
                    dueDate: {
                      type: Type.STRING,
                      description: 'Fecha límite YYYY-MM-DD si aparece, o cadena vacía.',
                    },
                    cutoffDay: {
                      type: Type.INTEGER,
                      description: 'Día de corte (1-31) o 0 si no aparece.',
                    },
                    interestRate: {
                      type: Type.NUMBER,
                      description: 'Tasa anual en % o 0 si no aparece.',
                    },
                  },
                },
                transactions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date: {
                        type: Type.STRING,
                        description: 'Fecha YYYY-MM-DD.',
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Concepto o comercio limpio.',
                      },
                      amount: {
                        type: Type.NUMBER,
                        description: 'Monto positivo numérico.',
                      },
                      type: {
                        type: Type.STRING,
                        description: 'ingreso o gasto',
                      },
                      suggestedCategoryName: {
                        type: Type.STRING,
                        description: 'Nombre exacto de la categoría sugerida.',
                      },
                      paymentMethod: {
                        type: Type.STRING,
                        description: 'transferencia, debito, credito, efectivo u otro',
                      },
                    },
                  },
                },
              },
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Structured Financial Insights for current month, quincenas, debts & savings
  app.post('/api/ai/financial-insights', async (req, res) => {
    try {
      const snapshot = (req.body?.snapshot ?? null) as FinancialSnapshot | null;
      if (!snapshot || typeof snapshot !== 'object') {
        res.status(400).json({ error: 'Faltan los datos financieros para generar el análisis.' });
        return;
      }

      const ai = getGeminiClient();

      const prompt = [
        'Analiza la situación financiera personal real de este usuario y genera recomendaciones accionables y directas en español.',
        'Recuerda el calendario de quincenas del usuario: 1ª Quincena es el pago del 15–16 del mes; 2ª Quincena es el pago del 30 al 1.',
        '',
        'Resumen financiero real (JSON):',
        JSON.stringify(snapshot, null, 2),
      ].join('\n');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Eres un asesor de finanzas personales claro, práctico y empático en español. Basa cada observación estrictamente en las cifras recibidas. Evita rodeos y clichés.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: {
                  type: Type.STRING,
                  description: 'Titular ejecutivo corto de 1 oración sobre el estado financiero actual.',
                },
                healthSummary: {
                  type: Type.STRING,
                  description: 'Diagnóstico claro en 2 a 3 oraciones usando cifras concretas del mes.',
                },
                priorityActions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING },
                      impactLabel: {
                        type: Type.STRING,
                        description: 'Impacto concreto breve (ej. Ahorro potencial o Reducción de intereses).',
                      },
                      area: {
                        type: Type.STRING,
                        description: 'deudas, gastos, ahorro o quincenas',
                      },
                    },
                  },
                },
                debtStrategy: {
                  type: Type.STRING,
                  description:
                    'Plan breve y concreto para priorizar pagos de deudas según tasas y fechas de pago (o felicitación si no tiene deudas).',
                },
                quincenaTip: {
                  type: Type.STRING,
                  description:
                    'Recomendación práctica para equilibrar la 1ª Quincena (15–16) y la 2ª Quincena (30–1).',
                },
              },
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Contextual Financial Q&A
  app.post('/api/ai/ask', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      const snapshot = (req.body?.snapshot ?? null) as FinancialSnapshot | null;
      const history = Array.isArray(req.body?.history)
        ? (req.body.history as { role: string; text: string }[]).slice(-6)
        : [];

      if (!question) {
        res.status(400).json({ error: 'Escribe una pregunta para consultar.' });
        return;
      }

      const ai = getGeminiClient();

      const historyText =
        history.length > 0
          ? history
              .map((h) => `${h.role === 'user' ? 'Usuario' : 'Asesor'}: ${h.text.slice(0, 600)}`)
              .join('\n')
          : 'Sin mensajes previos.';

      const prompt = [
        'Contexto financiero actual del usuario (JSON):',
        JSON.stringify(snapshot ?? {}, null, 2),
        '',
        'Conversación reciente:',
        historyText,
        '',
        `Pregunta actual del usuario: ${question.slice(0, 600)}`,
        '',
        'Responde en español en máximo 160 palabras, con pasos prácticos y cifras reales del usuario cuando apliquen. Usa texto limpio sin exceso de símbolos.',
      ].join('\n');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Eres el asesor financiero integrado de MoneyFlow. Responde de forma directa, precisa y útil en español usando los datos reales de ingresos, gastos, quincenas (1ª Q pago 15–16, 2ª Q pago 30–1), deudas y ahorro del usuario.',
          },
        })
      );

      res.json({ answer: (response.text ?? '').trim() });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoneyFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

// Vercel importa createApp() desde api/[...path].ts. En local seguimos iniciando el servidor normalmente.
if (process.env.VERCEL !== '1') {
  void startServer();
}
