import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileImage,
  FileText,
  History,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  analyzeStatementWithAi,
  type ParsedStatementResult,
} from '../lib/aiClient';
import {
  addMonthsToDateStr,
} from '../lib/savingsPlan';
import {
  buildDueDateForMonth,
  computeDebtStatus,
  DEBT_CATEGORY_OPTIONS,
  DEBT_TEMPLATES,
  findDefaultDebtPaymentCategory,
  getDebtCategoryLabel,
  getSuggestedQuincenaForDebt,
  loadDebtsState,
  saveDebtsState,
  suggestNextDueDate,
  type DebtCategory,
  type DebtItem,
  type DebtPayQuincena,
  type DebtsState,
} from '../lib/debtsStore';
import {
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  formatShortMonthLabel,
  getQuincenaFromDate,
  getQuincenaRangeLabel,
  getTodayDateStr,
} from '../lib/financeUtils';
import {
  deleteBankStatement,
  formatFileSize,
  listBankStatements,
  saveBankStatement,
  unlinkDebtFromStatements,
  type BankStatementRecord,
} from '../lib/statementsDb';
import { createTransaction } from '../services/financeService';
import {
  CATEGORY_COLOR_SWATCHES,
  VALIDATION_LIMITS,
  type QuincenaNumber,
} from '../types/finance';

interface DebtsViewProps {
  selectedMonth: string;
}

type DebtFilterTab = 'all' | 'active' | 'urgent' | 'paid';
type StatementScopeTab = 'month' | 'all';

export function DebtsView({ selectedMonth }: DebtsViewProps) {
  const { user, categories, currency } = useFinance();

  // Debts state (persisted per user)
  const [debtsState, setDebtsState] = useState<DebtsState>(() =>
    user ? loadDebtsState(user.uid) : { debts: [], updatedAt: '' }
  );

  // Bank statements state (IndexedDB)
  const [statements, setStatements] = useState<BankStatementRecord[]>([]);
  const [loadingStatements, setLoadingStatements] = useState(true);
  const [statementUrls, setStatementUrls] = useState<Record<string, string>>({});

  // Debt filters
  const [debtFilter, setDebtFilter] = useState<DebtFilterTab>('all');
  const [debtSearch, setDebtSearch] = useState('');

  // Debt create/edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [category, setCategory] = useState<DebtCategory>('tarjeta_credito');
  const [totalAmount, setTotalAmount] = useState('');
  const [remainingAmount, setRemainingAmount] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [cutoffDay, setCutoffDay] = useState('');
  const [dueDay, setDueDay] = useState('16');
  const [nextDueDate, setNextDueDate] = useState(() => suggestNextDueDate(16));
  const [payQuincena, setPayQuincena] = useState<DebtPayQuincena>(1);
  const [color, setColor] = useState('#BE123C');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Debt payment inline drawer
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => getTodayDateStr());
  const [payQuincenaChoice, setPayQuincenaChoice] = useState<QuincenaNumber>(() =>
    getQuincenaFromDate(getTodayDateStr())
  );
  const [payNote, setPayNote] = useState('');
  const [payRecordTx, setPayRecordTx] = useState(true);
  const [payCategoryId, setPayCategoryId] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Debt expanded history & delete confirmation
  const [historyDebtId, setHistoryDebtId] = useState<string | null>(null);
  const [confirmDeleteDebtId, setConfirmDeleteDebtId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Bank statements upload & filters
  const statementsSectionRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [stmtTitle, setStmtTitle] = useState('');
  const [stmtBank, setStmtBank] = useState('');
  const [stmtMonth, setStmtMonth] = useState(selectedMonth);
  const [stmtDebtId, setStmtDebtId] = useState('');
  const [stmtNotes, setStmtNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadingStmt, setUploadingStmt] = useState(false);
  const [stmtError, setStmtError] = useState<string | null>(null);
  const [stmtScope, setStmtScope] = useState<StatementScopeTab>('all');
  const [stmtDebtFilter, setStmtDebtFilter] = useState<string>('all');
  const [stmtSearch, setStmtSearch] = useState('');
  const [confirmDeleteStmtId, setConfirmDeleteStmtId] = useState<string | null>(null);

  // Statement Preview Modal
  const [previewStmt, setPreviewStmt] = useState<BankStatementRecord | null>(null);

  // AI Statement Parser Modal state
  const [analyzingStmtId, setAnalyzingStmtId] = useState<string | null>(null);
  const [aiTargetStmt, setAiTargetStmt] = useState<BankStatementRecord | null>(null);
  const [aiResult, setAiResult] = useState<ParsedStatementResult | null>(null);
  const [aiSelectedIdx, setAiSelectedIdx] = useState<Record<number, boolean>>({});
  const [aiCategoryIds, setAiCategoryIds] = useState<Record<number, string>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [importingAiTxs, setImportingAiTxs] = useState(false);

  // Sync month selector default for new statement uploads
  useEffect(() => {
    setStmtMonth(selectedMonth);
  }, [selectedMonth]);

  // Sync user data when user changes
  useEffect(() => {
    if (!user) return;
    setDebtsState(loadDebtsState(user.uid));
    let cancelled = false;
    setLoadingStatements(true);
    listBankStatements(user.uid)
      .then((rows) => {
        if (!cancelled) setStatements(rows);
      })
      .catch(() => {
        if (!cancelled) setStatements([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStatements(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Manage Blob object URLs cleanly
  useEffect(() => {
    const nextUrls: Record<string, string> = {};
    for (const st of statements) {
      try {
        nextUrls[st.id] = URL.createObjectURL(st.blob);
      } catch {
        // Ignore broken blob
      }
    }
    setStatementUrls(nextUrls);
    return () => {
      for (const url of Object.values(nextUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [statements]);

  const updateDebts = (updater: (prev: DebtItem[]) => DebtItem[]) => {
    setDebtsState((prev) => {
      const next: DebtsState = {
        debts: updater(prev.debts),
        updatedAt: new Date().toISOString(),
      };
      if (user) saveDebtsState(user.uid, next);
      return next;
    });
  };

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'gasto'),
    [categories]
  );

  const enrichedDebts = useMemo(() => {
    return debtsState.debts
      .map((debt) => ({
        debt,
        schedule: computeDebtStatus(debt, selectedMonth),
      }))
      .sort((a, b) => {
        // Active urgent debts first, then by due date, then paid off
        const rank = (s: string) =>
          s === 'overdue' ? 0 : s === 'due_soon' ? 1 : s === 'scheduled' ? 2 : s === 'paid_month' ? 3 : 4;
        const rDiff = rank(a.schedule.status) - rank(b.schedule.status);
        if (rDiff !== 0) return rDiff;
        return a.schedule.dueDateForMonth.localeCompare(b.schedule.dueDateForMonth);
      });
  }, [debtsState.debts, selectedMonth]);

  const kpis = useMemo(() => {
    let totalRemaining = 0;
    let totalInitial = 0;
    let totalMonthly = 0;
    let q1Monthly = 0;
    let q2Monthly = 0;
    let activeCount = 0;
    let urgentCount = 0;

    for (const { debt, schedule } of enrichedDebts) {
      totalInitial += Math.max(debt.totalAmount, debt.remainingAmount);
      if (debt.remainingAmount > 0) {
        activeCount += 1;
        totalRemaining += debt.remainingAmount;
        totalMonthly += debt.monthlyPayment;
        if (debt.payQuincena === 1) q1Monthly += debt.monthlyPayment;
        else if (debt.payQuincena === 2) q2Monthly += debt.monthlyPayment;
        else {
          q1Monthly += debt.monthlyPayment / 2;
          q2Monthly += debt.monthlyPayment / 2;
        }
        if (schedule.status === 'overdue' || schedule.status === 'due_soon') {
          urgentCount += 1;
        }
      }
    }

    const nextUpcoming = enrichedDebts.find(
      ({ debt, schedule }) =>
        debt.remainingAmount > 0 && schedule.status !== 'paid_month'
    );

    const overallPaidPct =
      totalInitial > 0
        ? Math.min(100, Math.max(0, ((totalInitial - totalRemaining) / totalInitial) * 100))
        : 0;

    return {
      totalRemaining,
      totalInitial,
      totalMonthly,
      q1Monthly,
      q2Monthly,
      activeCount,
      urgentCount,
      nextUpcoming: nextUpcoming ?? null,
      overallPaidPct,
    };
  }, [enrichedDebts]);

  const filteredDebts = useMemo(() => {
    const q = debtSearch.trim().toLowerCase();
    return enrichedDebts.filter(({ debt, schedule }) => {
      if (debtFilter === 'active' && debt.remainingAmount <= 0) return false;
      if (
        debtFilter === 'urgent' &&
        schedule.status !== 'overdue' &&
        schedule.status !== 'due_soon'
      ) {
        return false;
      }
      if (debtFilter === 'paid' && debt.remainingAmount > 0 && schedule.status !== 'paid_month') {
        return false;
      }
      if (q) {
        const hay = `${debt.name} ${debt.institution} ${getDebtCategoryLabel(debt.category)} ${debt.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedDebts, debtFilter, debtSearch]);

  const statementsCountByDebt = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of statements) {
      if (st.debtId) {
        map.set(st.debtId, (map.get(st.debtId) ?? 0) + 1);
      }
    }
    return map;
  }, [statements]);

  const debtNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of debtsState.debts) {
      map.set(d.id, d.name);
    }
    return map;
  }, [debtsState.debts]);

  const filteredStatements = useMemo(() => {
    const q = stmtSearch.trim().toLowerCase();
    return statements.filter((st) => {
      if (stmtScope === 'month' && st.monthKey !== selectedMonth) return false;
      if (stmtDebtFilter !== 'all') {
        if (stmtDebtFilter === 'unlinked' && st.debtId !== '') return false;
        if (stmtDebtFilter !== 'unlinked' && st.debtId !== stmtDebtFilter) return false;
      }
      if (q) {
        const linkedName = st.debtId ? debtNameMap.get(st.debtId) ?? '' : '';
        const hay = `${st.title} ${st.bankName} ${st.fileName} ${st.notes} ${linkedName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [statements, stmtScope, selectedMonth, stmtDebtFilter, stmtSearch, debtNameMap]);

  const pdfCount = useMemo(
    () => statements.filter((s) => s.fileKind === 'pdf').length,
    [statements]
  );
  const imageCount = statements.length - pdfCount;

  // Debt Form Handlers
  const openNewDebtForm = (template?: (typeof DEBT_TEMPLATES)[number]) => {
    setEditingDebtId(null);
    setName(template?.name ?? '');
    setInstitution(template?.institution ?? '');
    setCategory(template?.category ?? 'tarjeta_credito');
    setTotalAmount('');
    setRemainingAmount('');
    setMonthlyPayment('');
    setInterestRate('');
    setCutoffDay(template?.cutoffDay ? String(template.cutoffDay) : '');
    const initialDue = template?.dueDay ?? 16;
    setDueDay(String(initialDue));
    setNextDueDate(suggestNextDueDate(initialDue));
    setPayQuincena(template?.payQuincena ?? 1);
    setColor(template?.color ?? '#BE123C');
    setNotes(template?.notes ?? '');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditDebtForm = (debt: DebtItem) => {
    setEditingDebtId(debt.id);
    setName(debt.name);
    setInstitution(debt.institution);
    setCategory(debt.category);
    setTotalAmount(String(debt.totalAmount));
    setRemainingAmount(String(debt.remainingAmount));
    setMonthlyPayment(debt.monthlyPayment > 0 ? String(debt.monthlyPayment) : '');
    setInterestRate(debt.interestRate > 0 ? String(debt.interestRate) : '');
    setCutoffDay(debt.cutoffDay > 0 ? String(debt.cutoffDay) : '');
    setDueDay(String(debt.dueDay));
    setNextDueDate(debt.nextDueDate || buildDueDateForMonth(selectedMonth, debt.dueDay));
    setPayQuincena(debt.payQuincena);
    setColor(debt.color);
    setNotes(debt.notes);
    setFormError(null);
    setFormOpen(true);
  };

  const handleDueDayChange = (val: string) => {
    setDueDay(val);
    const num = Number(val);
    if (Number.isFinite(num) && num >= 1 && num <= 31) {
      setNextDueDate(suggestNextDueDate(num));
      setPayQuincena(num >= 15 && num < 30 ? 1 : 2);
    }
  };

  const handleSaveDebt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) {
      setFormError('Ingresa un nombre para identificar esta deuda.');
      return;
    }

    const parsedRemaining = Number(remainingAmount.replace(',', '.'));
    if (
      !Number.isFinite(parsedRemaining) ||
      parsedRemaining < 0 ||
      parsedRemaining > VALIDATION_LIMITS.AMOUNT_MAX
    ) {
      setFormError('Ingresa un saldo pendiente válido.');
      return;
    }

    const parsedTotalRaw =
      totalAmount.trim() === '' ? parsedRemaining : Number(totalAmount.replace(',', '.'));
    if (
      !Number.isFinite(parsedTotalRaw) ||
      parsedTotalRaw < 0 ||
      parsedTotalRaw > VALIDATION_LIMITS.AMOUNT_MAX
    ) {
      setFormError('Ingresa un monto inicial válido.');
      return;
    }
    const finalTotal = Math.max(parsedTotalRaw, parsedRemaining);

    const parsedMonthly =
      monthlyPayment.trim() === '' ? 0 : Number(monthlyPayment.replace(',', '.'));
    if (
      !Number.isFinite(parsedMonthly) ||
      parsedMonthly < 0 ||
      parsedMonthly > VALIDATION_LIMITS.AMOUNT_MAX
    ) {
      setFormError('Ingresa una cuota mensual válida.');
      return;
    }

    const parsedRate = interestRate.trim() === '' ? 0 : Number(interestRate.replace(',', '.'));
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 500) {
      setFormError('La tasa de interés debe estar entre 0% y 500%.');
      return;
    }

    const parsedDueDay = Number(dueDay);
    if (!Number.isFinite(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setFormError('El día de pago debe estar entre 1 y 31.');
      return;
    }

    const parsedCutoff = cutoffDay.trim() === '' ? 0 : Number(cutoffDay);
    if (parsedCutoff !== 0 && (!Number.isFinite(parsedCutoff) || parsedCutoff < 1 || parsedCutoff > 31)) {
      setFormError('El día de corte debe estar entre 1 y 31.');
      return;
    }

    const validNextDue = VALIDATION_LIMITS.DATE_PATTERN.test(nextDueDate)
      ? nextDueDate
      : suggestNextDueDate(parsedDueDay);

    const nowIso = new Date().toISOString();

    if (editingDebtId) {
      updateDebts((prev) =>
        prev.map((d) =>
          d.id === editingDebtId
            ? {
                ...d,
                name: cleanName,
                institution: institution.trim().slice(0, 80),
                category,
                totalAmount: Math.round(finalTotal * 100) / 100,
                remainingAmount: Math.round(parsedRemaining * 100) / 100,
                monthlyPayment: Math.round(parsedMonthly * 100) / 100,
                interestRate: Math.round(parsedRate * 100) / 100,
                cutoffDay: Math.round(parsedCutoff),
                dueDay: Math.round(parsedDueDay),
                nextDueDate: validNextDue,
                payQuincena,
                color,
                notes: notes.trim().slice(0, 300),
                updatedAt: nowIso,
              }
            : d
        )
      );
      setFeedback(`Se actualizó la deuda "${cleanName}".`);
    } else {
      const newDebt: DebtItem = {
        id: `debt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        institution: institution.trim().slice(0, 80),
        category,
        totalAmount: Math.round(finalTotal * 100) / 100,
        remainingAmount: Math.round(parsedRemaining * 100) / 100,
        monthlyPayment: Math.round(parsedMonthly * 100) / 100,
        interestRate: Math.round(parsedRate * 100) / 100,
        cutoffDay: Math.round(parsedCutoff),
        dueDay: Math.round(parsedDueDay),
        nextDueDate: validNextDue,
        payQuincena,
        paidMonths: [],
        payments: [],
        color,
        notes: notes.trim().slice(0, 300),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updateDebts((prev) => [newDebt, ...prev]);
      setFeedback(`Se agregó "${cleanName}" a tu control de deudas.`);
    }

    setFormOpen(false);
    setEditingDebtId(null);
  };

  const handleDeleteDebt = async (debtId: string) => {
    const target = debtsState.debts.find((d) => d.id === debtId);
    updateDebts((prev) => prev.filter((d) => d.id !== debtId));
    if (user) {
      try {
        await unlinkDebtFromStatements(user.uid, debtId);
        const refreshed = await listBankStatements(user.uid);
        setStatements(refreshed);
      } catch {
        // Non-blocking
      }
    }
    setConfirmDeleteDebtId(null);
    if (target) {
      setFeedback(`Se eliminó "${target.name}" de tus deudas.`);
    }
  };

  // Payment Drawer Handlers
  const openPaymentDrawer = (debt: DebtItem) => {
    const suggested =
      debt.monthlyPayment > 0
        ? Math.min(debt.monthlyPayment, debt.remainingAmount)
        : debt.remainingAmount;
    const today = getTodayDateStr();
    setPayingDebtId(debt.id);
    setPayAmount(suggested > 0 ? String(Math.round(suggested * 100) / 100) : '');
    setPayDate(today);
    setPayQuincenaChoice(getSuggestedQuincenaForDebt(debt));
    setPayNote('');
    const defaultCat = findDefaultDebtPaymentCategory(categories);
    setPayCategoryId(defaultCat?.id ?? '');
    setPayRecordTx(Boolean(defaultCat));
    setPayError(null);
  };

  const handleRegisterPayment = async (e: React.FormEvent, debt: DebtItem) => {
    e.preventDefault();
    if (!user) return;
    setPayError(null);

    const parsedAmount = Number(payAmount.replace(',', '.'));
    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > VALIDATION_LIMITS.AMOUNT_MAX
    ) {
      setPayError('Ingresa un monto de pago mayor a cero.');
      return;
    }

    if (!VALIDATION_LIMITS.DATE_PATTERN.test(payDate)) {
      setPayError('Selecciona una fecha válida.');
      return;
    }

    const roundedPay = Math.round(parsedAmount * 100) / 100;
    const payMonthKey = payDate.slice(0, 7);

    setPayBusy(true);
    try {
      let recordedTx = false;
      if (payRecordTx) {
        const chosenCat = expenseCategories.find((c) => c.id === payCategoryId);
        if (!chosenCat) {
          setPayError('Selecciona una categoría de gasto o desmarca el registro en Movimientos.');
          setPayBusy(false);
          return;
        }
        await createTransaction(user.uid, {
          type: 'gasto',
          amount: roundedPay,
          description: `Pago deuda: ${debt.name}`.slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX),
          categoryId: chosenCat.id,
          categoryName: chosenCat.name,
          date: payDate,
          quincena: payQuincenaChoice,
          paymentMethod: 'transferencia',
          notes:
            payNote.trim() ||
            `Abono a ${debt.institution ? `${debt.name} (${debt.institution})` : debt.name}`,
        });
        recordedTx = true;
      }

      const nextRemaining = Math.max(0, Math.round((debt.remainingAmount - roundedPay) * 100) / 100);
      const nextDueBase =
        debt.nextDueDate && VALIDATION_LIMITS.DATE_PATTERN.test(debt.nextDueDate)
          ? debt.nextDueDate
          : buildDueDateForMonth(payMonthKey, debt.dueDay);
      const advancedDue = addMonthsToDateStr(nextDueBase, 1);

      const newPayment = {
        id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: payDate,
        amount: roundedPay,
        note: payNote.trim().slice(0, 160),
        recordedAsTx: recordedTx,
      };

      updateDebts((prev) =>
        prev.map((d) => {
          if (d.id !== debt.id) return d;
          const paidMonthsSet = new Set(d.paidMonths);
          paidMonthsSet.add(payMonthKey);
          paidMonthsSet.add(selectedMonth);
          return {
            ...d,
            remainingAmount: nextRemaining,
            nextDueDate: nextRemaining > 0 ? advancedDue : d.nextDueDate,
            paidMonths: Array.from(paidMonthsSet),
            payments: [newPayment, ...d.payments].slice(0, 200),
            updatedAt: new Date().toISOString(),
          };
        })
      );

      setPayingDebtId(null);
      setFeedback(
        recordedTx
          ? `Pago de ${formatCurrency(roundedPay, currency)} registrado en "${debt.name}" y agregado a Movimientos.`
          : `Pago de ${formatCurrency(roundedPay, currency)} registrado en "${debt.name}".`
      );
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setPayBusy(false);
    }
  };

  // Bank Statements Upload Handlers
  const handleAddFilesToQueue = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setStmtError(null);
    const incoming = Array.from(fileList);
    setPendingFiles((prev) => [...prev, ...incoming].slice(0, 10));
    if (!stmtTitle.trim() && incoming.length === 1) {
      const base = incoming[0].name.replace(/\.[^.]+$/, '').slice(0, 80);
      setStmtTitle(base);
    }
  };

  const handleSaveStatements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStmtError(null);

    if (pendingFiles.length === 0) {
      setStmtError('Selecciona al menos un archivo PDF o una foto de tu extracto bancario.');
      return;
    }

    const cleanBank = stmtBank.trim();
    const linkedDebt = debtsState.debts.find((d) => d.id === stmtDebtId);
    const resolvedBank = cleanBank || linkedDebt?.institution || 'Banco';

    setUploadingStmt(true);
    try {
      const created: BankStatementRecord[] = [];
      for (const file of pendingFiles) {
        const titleForFile =
          pendingFiles.length === 1 && stmtTitle.trim()
            ? stmtTitle.trim()
            : file.name.replace(/\.[^.]+$/, '') || stmtTitle.trim() || 'Extracto bancario';
        const saved = await saveBankStatement({
          ownerId: user.uid,
          title: titleForFile,
          bankName: resolvedBank,
          monthKey: VALIDATION_LIMITS.MONTH_KEY_PATTERN.test(stmtMonth) ? stmtMonth : selectedMonth,
          debtId: stmtDebtId,
          notes: stmtNotes,
          file,
        });
        created.push(saved);
      }

      setStatements((prev) => [...created, ...prev]);
      setPendingFiles([]);
      setStmtTitle('');
      setStmtNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      setFeedback(
        created.length === 1
          ? `Extracto "${created[0].title}" guardado correctamente.`
          : `Se guardaron ${created.length} extractos bancarios.`
      );
    } catch (err) {
      setStmtError(err instanceof Error ? err.message : 'No se pudieron guardar los archivos.');
    } finally {
      setUploadingStmt(false);
    }
  };

  const handleDeleteStatement = async (stmtId: string) => {
    try {
      await deleteBankStatement(stmtId);
      setStatements((prev) => prev.filter((s) => s.id !== stmtId));
      setConfirmDeleteStmtId(null);
      if (previewStmt?.id === stmtId) setPreviewStmt(null);
      setFeedback('Extracto eliminado.');
    } catch (err) {
      setStmtError(err instanceof Error ? err.message : 'No se pudo eliminar el extracto.');
    }
  };

  const handleDownloadStatement = (stmt: BankStatementRecord) => {
    const url = statementUrls[stmt.id] ?? URL.createObjectURL(stmt.blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', stmt.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (!statementUrls[stmt.id]) {
      URL.revokeObjectURL(url);
    }
  };

  const jumpToAttachStatementForDebt = (debt: DebtItem) => {
    setStmtDebtId(debt.id);
    if (debt.institution) setStmtBank(debt.institution);
    setStmtTitle(`Extracto ${debt.name} - ${formatShortMonthLabel(selectedMonth)}`);
    statementsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const matchCategoryForAiTx = (suggestedName: string, txType: 'ingreso' | 'gasto'): string => {
    const byType = categories.filter((c) => c.type === txType);
    if (byType.length === 0) return categories[0]?.id ?? '';
    const norm = suggestedName.trim().toLowerCase();
    if (norm) {
      const exact = byType.find((c) => c.name.trim().toLowerCase() === norm);
      if (exact) return exact.id;
      const partial = byType.find(
        (c) =>
          c.name.trim().toLowerCase().includes(norm) ||
          norm.includes(c.name.trim().toLowerCase())
      );
      if (partial) return partial.id;
    }
    return byType[0].id;
  };

  const handleAnalyzeStatementWithAi = async (stmt: BankStatementRecord) => {
    setAnalyzingStmtId(stmt.id);
    setAiTargetStmt(stmt);
    setAiResult(null);
    setAiError(null);
    setPreviewStmt(null);

    try {
      const parsed = await analyzeStatementWithAi({
        blob: stmt.blob,
        mimeType: stmt.mimeType,
        fileName: stmt.fileName,
        currency,
        defaultMonthKey: stmt.monthKey || selectedMonth,
        categories,
      });
      const initialSelected: Record<number, boolean> = {};
      const initialCats: Record<number, string> = {};
      parsed.transactions.forEach((tx, idx) => {
        initialSelected[idx] = true;
        initialCats[idx] = matchCategoryForAiTx(tx.suggestedCategoryName, tx.type);
      });
      setAiSelectedIdx(initialSelected);
      setAiCategoryIds(initialCats);
      setAiResult(parsed);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'No se pudo analizar el extracto. Intenta de nuevo.'
      );
    } finally {
      setAnalyzingStmtId(null);
    }
  };

  const handleApplyDetectedDebtFromAi = () => {
    const d = aiResult?.detectedDebt;
    if (!d) return;
    setEditingDebtId(null);
    setName(d.name || `Tarjeta ${d.institution || aiResult?.bankName || ''}`.trim());
    setInstitution(d.institution || aiResult?.bankName || aiTargetStmt?.bankName || '');
    setCategory('tarjeta_credito');
    const bal = d.totalBalance > 0 ? String(Math.round(d.totalBalance * 100) / 100) : '';
    setRemainingAmount(bal);
    setTotalAmount(bal);
    setMonthlyPayment(
      d.minimumPayment > 0 ? String(Math.round(d.minimumPayment * 100) / 100) : ''
    );
    setInterestRate(d.interestRate > 0 ? String(d.interestRate) : '');
    setCutoffDay(d.cutoffDay >= 1 && d.cutoffDay <= 31 ? String(d.cutoffDay) : '');
    if (d.dueDate && VALIDATION_LIMITS.DATE_PATTERN.test(d.dueDate)) {
      setNextDueDate(d.dueDate);
      const dayNum = Number(d.dueDate.slice(8, 10)) || 16;
      setDueDay(String(dayNum));
      setPayQuincena(dayNum >= 15 && dayNum < 30 ? 1 : 2);
    }
    setNotes(
      aiResult?.statementPeriod
        ? `Detectado del extracto ${aiResult.statementPeriod}`
        : 'Detectado automáticamente desde extracto bancario'
    );
    setFormError(null);
    setAiTargetStmt(null);
    setAiResult(null);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImportAiTransactions = async () => {
    if (!user || !aiResult) return;
    const chosen = aiResult.transactions
      .map((tx, idx) => ({ tx, idx }))
      .filter(({ idx }) => aiSelectedIdx[idx]);
    if (chosen.length === 0) return;

    setImportingAiTxs(true);
    setAiError(null);
    try {
      let importedCount = 0;
      for (const { tx, idx } of chosen) {
        const catId = aiCategoryIds[idx] || matchCategoryForAiTx(tx.suggestedCategoryName, tx.type);
        const catObj = categories.find((c) => c.id === catId);
        if (!catObj) continue;
        await createTransaction(user.uid, {
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          categoryId: catObj.id,
          categoryName: catObj.name,
          date: tx.date,
          quincena: getQuincenaFromDate(tx.date),
          paymentMethod: tx.paymentMethod,
          notes: `Importado desde ${aiTargetStmt?.title || 'extracto bancario'}`.slice(
            0,
            VALIDATION_LIMITS.NOTES_MAX
          ),
        });
        importedCount += 1;
      }
      setAiTargetStmt(null);
      setAiResult(null);
      setFeedback(
        importedCount === 1
          ? 'Se importó 1 movimiento a MoneyFlow desde el extracto.'
          : `Se importaron ${importedCount} movimientos a MoneyFlow desde el extracto.`
      );
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Ocurrió un error al importar los movimientos.'
      );
    } finally {
      setImportingAiTxs(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Feedback Banner */}
      {feedback && (
        <div className="px-4 py-2.5 text-[13px] sm:text-xs font-semibold text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-400/25 rounded-xl shadow-xs flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold hover:underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 4-Column Unified KPI Strip */}
      <section
        aria-label="Resumen de deudas y extractos"
        className="mf-card grid grid-cols-2 lg:grid-cols-4 overflow-hidden"
      >
        <div className="p-3 sm:p-4 lg:p-5 border-b border-r border-emerald-950/[0.08] dark:border-emerald-400/12 lg:border-b-0 bg-gradient-to-b from-rose-50/40 dark:from-rose-500/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Deuda pendiente
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-100/80 dark:bg-rose-500/15 border border-rose-200/70 dark:border-rose-400/25 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <p className="text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold tracking-tight text-rose-700 dark:text-rose-400 tabular-nums mt-1 sm:mt-1.5 truncate">
            {formatCurrency(kpis.totalRemaining, currency)}
          </p>
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            {kpis.activeCount} {kpis.activeCount === 1 ? 'activa' : 'activas'} ·{' '}
            {Math.round(kpis.overallPaidPct)}% amortizado
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-b lg:border-b-0 lg:border-r border-emerald-950/[0.08] dark:border-emerald-400/12 bg-gradient-to-b from-amber-50/35 dark:from-amber-500/[0.06] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Cuota mensual
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-100/80 dark:bg-amber-500/15 border border-amber-200/70 dark:border-amber-400/25 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <p className="text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums mt-1 sm:mt-1.5 truncate">
            {formatCurrency(kpis.totalMonthly, currency)}
          </p>
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            1ª Q {formatCurrency(kpis.q1Monthly, currency)} · 2ª Q{' '}
            {formatCurrency(kpis.q2Monthly, currency)}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-r border-emerald-950/[0.08] dark:border-emerald-400/12">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Próximo pago
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <CalendarClock className="w-4 h-4" />
            </span>
          </div>
          {kpis.nextUpcoming ? (
            <>
              <p className="text-[15px] min-[400px]:text-base sm:text-xl font-bold sm:font-semibold text-slate-900 dark:text-slate-100 mt-1 sm:mt-1.5 truncate">
                {formatShortDate(kpis.nextUpcoming.schedule.dueDateForMonth)}
              </p>
              <p
                className={`text-xs font-semibold mt-0.5 sm:mt-1 truncate ${
                  kpis.nextUpcoming.schedule.daysUntilDue < 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : kpis.nextUpcoming.schedule.daysUntilDue <= 5
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {kpis.nextUpcoming.debt.name} ·{' '}
                {kpis.nextUpcoming.schedule.daysUntilDue < 0
                  ? `Vencida hace ${Math.abs(kpis.nextUpcoming.schedule.daysUntilDue)} d`
                  : kpis.nextUpcoming.schedule.daysUntilDue === 0
                    ? 'Vence hoy'
                    : `En ${kpis.nextUpcoming.schedule.daysUntilDue} días`}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] sm:text-xl font-bold sm:font-semibold text-emerald-700 dark:text-emerald-400 mt-1 sm:mt-1.5">
                Al día
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
                Sin pagos pendientes
              </p>
            </>
          )}
        </div>

        <div className="p-3 sm:p-4 lg:p-5 bg-gradient-to-b from-emerald-50/35 dark:from-emerald-500/[0.06] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Extractos
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100/80 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-400/25 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <p className="text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1 sm:mt-1.5">
            {statements.length}
          </p>
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            {pdfCount} PDF · {imageCount} {imageCount === 1 ? 'foto' : 'fotos'}
          </p>
        </div>
      </section>

      {/* Urgent Due-Date Alert Strip */}
      {kpis.urgentCount > 0 && (
        <div className="mf-card px-4 py-3 bg-amber-50/70 dark:bg-amber-950/35 border border-amber-300/70 dark:border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                Tienes {kpis.urgentCount}{' '}
                {kpis.urgentCount === 1
                  ? 'deuda vencida o próxima a vencer'
                  : 'deudas vencidas o próximas a vencer'}
              </p>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                Revisa tus fechas límite para evitar cargos o intereses moratorios.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDebtFilter('urgent')}
            className="px-3.5 py-1.5 text-xs font-bold text-amber-950 dark:text-amber-100 bg-white dark:bg-amber-900/40 border border-amber-300 dark:border-amber-500/40 rounded-lg hover:bg-amber-100/60 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Ver próximas
          </button>
        </div>
      )}

      {/* BLOCK 1: Debts & Payment Dates */}
      <section className="mf-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-emerald-950/[0.08] dark:border-emerald-400/12 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200/80 dark:border-rose-400/25 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display leading-tight">
                Control de deudas y fechas de pago
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Lleva el saldo, día de corte, fecha límite y abonos de tus tarjetas y créditos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => (formOpen && !editingDebtId ? setFormOpen(false) : openNewDebtForm())}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {formOpen && !editingDebtId ? 'Ocultar formulario' : 'Agregar deuda'}
          </button>
        </div>

        {/* Create / Edit Debt Form */}
        {formOpen && (
          <form
            onSubmit={handleSaveDebt}
            className="px-4 sm:px-5 py-4 bg-[#F6FAF7] dark:bg-[#0D2118] border-b border-emerald-950/[0.08] dark:border-emerald-400/12 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingDebtId ? 'Editar deuda' : 'Nueva deuda o compromiso de pago'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingDebtId(null);
                  setFormError(null);
                }}
                className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg"
                aria-label="Cerrar formulario"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="px-3.5 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de la deuda *
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Tarjeta Visa, Préstamo auto"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Banco o entidad
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Ej. Bancolombia, BBVA, Nu, Santander"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de deuda
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DebtCategory)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                >
                  {DEBT_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Saldo pendiente actual ({currency}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={remainingAmount}
                  onChange={(e) => setRemainingAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Monto inicial / total ({currency})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Igual al saldo si se deja vacío"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cuota o pago mensual ({currency})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Día de pago mensual (1–31) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={dueDay}
                  onChange={(e) => handleDueDayChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Próxima fecha límite *
                </label>
                <input
                  type="date"
                  required
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Día de corte
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={cutoffDay}
                    onChange={(e) => setCutoffDay(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Interés % anual
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="500"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quincena en la que pagas esta deuda
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl">
                  {(
                    [
                      { value: 1 as const, label: '1ª Q (15–16)' },
                      { value: 2 as const, label: '2ª Q (30–1)' },
                      { value: 'both' as const, label: 'Ambas' },
                    ]
                  ).map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setPayQuincena(opt.value)}
                      className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        payQuincena === opt.value
                          ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Color identificador
                </label>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {CATEGORY_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => setColor(swatch.hex)}
                      title={swatch.name}
                      aria-label={`Color ${swatch.name}`}
                      className={`w-6 h-6 rounded-lg transition-transform ${
                        color.toUpperCase() === swatch.hex.toUpperCase()
                          ? 'ring-2 ring-offset-2 ring-[#0B3B24] dark:ring-emerald-400 dark:ring-offset-[#0D2118] scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notas (número de referencia, cuenta, condiciones)
              </label>
              <input
                type="text"
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Pago automático o transferencia desde cuenta nómina"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingDebtId(null);
                  setFormError(null);
                }}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] rounded-xl shadow-xs transition-all"
              >
                {editingDebtId ? 'Guardar cambios' : 'Guardar deuda'}
              </button>
            </div>
          </form>
        )}

        {/* Filter & Search Toolbar */}
        {debtsState.debts.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-emerald-950/[0.06] dark:border-emerald-400/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 bg-[#EFF5F1] dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 rounded-xl">
              {(
                [
                  { id: 'all' as const, label: 'Todas' },
                  { id: 'active' as const, label: 'Activas' },
                  { id: 'urgent' as const, label: 'Próximas' },
                  { id: 'paid' as const, label: 'Al día' },
                ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDebtFilter(tab.id)}
                  className={`px-2 sm:px-3 py-1.5 text-xs font-bold sm:font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
                    debtFilter === tab.id
                      ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-[#0B3B24] dark:hover:text-emerald-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={debtSearch}
                onChange={(e) => setDebtSearch(e.target.value)}
                placeholder="Buscar deuda o banco..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F6FAF7] dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/15 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          </div>
        )}

        {/* Debts List or Empty State */}
        {debtsState.debts.length === 0 ? (
          <div className="p-5 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Aún no tienes deudas registradas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Agrega tus tarjetas de crédito, préstamos o compras a cuotas para ver fechas de
                corte, días de pago por quincena y adjuntar sus extractos bancarios.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {DEBT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => openNewDebtForm(tpl)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#0B3B24] dark:text-emerald-200 bg-[#F2F7F4] dark:bg-[#0F261B] hover:bg-emerald-100/70 dark:hover:bg-emerald-500/15 border border-emerald-900/12 dark:border-emerald-400/20 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        ) : filteredDebts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No hay deudas que coincidan con este filtro.
          </div>
        ) : (
          <div className="divide-y divide-emerald-950/[0.07] dark:divide-emerald-400/10">
            {filteredDebts.map(({ debt, schedule }) => {
              const linkedStmtCount = statementsCountByDebt.get(debt.id) ?? 0;
              const isPaying = payingDebtId === debt.id;
              const showHistory = historyDebtId === debt.id;

              const statusText =
                schedule.status === 'paid_off'
                  ? 'Liquidada'
                  : schedule.status === 'paid_month'
                    ? `Pagada en ${formatShortMonthLabel(selectedMonth)}`
                    : schedule.status === 'overdue'
                      ? `Vencida hace ${Math.abs(schedule.daysUntilDue)} ${Math.abs(schedule.daysUntilDue) === 1 ? 'día' : 'días'}`
                      : schedule.daysUntilDue === 0
                        ? 'Vence hoy'
                        : schedule.status === 'due_soon'
                          ? `Vence en ${schedule.daysUntilDue} días`
                          : `Próximo pago: ${formatShortDate(schedule.dueDateForMonth)}`;

              const statusColorClass =
                schedule.status === 'paid_off' || schedule.status === 'paid_month'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : schedule.status === 'overdue'
                    ? 'text-rose-700 dark:text-rose-400'
                    : schedule.status === 'due_soon'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-600 dark:text-slate-300';

              const quincenaText =
                debt.payQuincena === 1
                  ? '1ª Q (15–16)'
                  : debt.payQuincena === 2
                    ? '2ª Q (30–1)'
                    : 'Ambas quincenas';

              return (
                <div key={debt.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs mt-0.5"
                        style={{ backgroundColor: debt.color }}
                      >
                        <CreditCard className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-slate-100 truncate">
                            {debt.name}
                          </h3>
                          <span className={`text-xs font-bold ${statusColorClass}`}>
                            {statusText}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {debt.institution && (
                            <>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {debt.institution}
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>{getDebtCategoryLabel(debt.category)}</span>
                          <span aria-hidden="true">·</span>
                          <span>Pago día {debt.dueDay}</span>
                          {debt.cutoffDay > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Corte día {debt.cutoffDay}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{quincenaText}</span>
                          {debt.interestRate > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{debt.interestRate}% anual</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-1 shrink-0 pl-12 sm:pl-0">
                      <p className="text-base sm:text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(debt.remainingAmount, currency)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {debt.monthlyPayment > 0
                          ? `Cuota ${formatCurrency(debt.monthlyPayment, currency)}/mes`
                          : `Inicial ${formatCurrency(debt.totalAmount, currency)}`}
                      </p>
                    </div>
                  </div>

                  {/* Amortization Progress Bar */}
                  <div className="space-y-1.5 pl-0 sm:pl-12">
                    <div className="h-2 w-full rounded-full bg-emerald-950/[0.07] dark:bg-emerald-400/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(schedule.paidPct, schedule.paidPct > 0 ? 4 : 0)}%`,
                          backgroundColor:
                            schedule.status === 'paid_off' ? '#15803D' : debt.color,
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        Pagado {formatCurrency(schedule.paidAmount, currency)} de{' '}
                        {formatCurrency(Math.max(debt.totalAmount, debt.remainingAmount), currency)} (
                        {Math.round(schedule.paidPct)}%)
                      </span>
                      <span className="font-mono tabular-nums">
                        Fecha límite: {formatShortDate(schedule.dueDateForMonth)}
                        {schedule.estimatedMonthsLeft && schedule.estimatedMonthsLeft > 0
                          ? ` · ~${schedule.estimatedMonthsLeft} ${schedule.estimatedMonthsLeft === 1 ? 'cuota' : 'cuotas'}`
                          : ''}
                      </span>
                    </div>
                    {debt.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                        {debt.notes}
                      </p>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pl-0 sm:pl-12">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {debt.remainingAmount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            isPaying ? setPayingDebtId(null) : openPaymentDrawer(debt)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] rounded-lg transition-all whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isPaying ? 'Cerrar abono' : 'Registrar pago'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => jumpToAttachStatementForDebt(debt)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#0B3B24] dark:text-emerald-200 bg-[#F2F7F4] dark:bg-[#0F261B] hover:bg-emerald-100/70 dark:hover:bg-emerald-500/15 border border-emerald-900/12 dark:border-emerald-400/20 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {linkedStmtCount > 0
                          ? `Extractos (${linkedStmtCount})`
                          : 'Adjuntar extracto'}
                      </button>

                      {debt.payments.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryDebtId(showHistory ? null : debt.id)
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/15 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <History className="w-3.5 h-3.5" />
                          Pagos ({debt.payments.length})
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditDebtForm(debt)}
                        className="p-1.5 text-slate-500 hover:text-[#0B3B24] dark:text-slate-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                        aria-label={`Editar ${debt.name}`}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteDebtId === debt.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteDebt(debt.id)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDebtId(null)}
                            className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDebtId(debt.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                          aria-label={`Eliminar ${debt.name}`}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Register Payment Drawer */}
                  {isPaying && (
                    <form
                      onSubmit={(e) => handleRegisterPayment(e, debt)}
                      className="sm:ml-12 p-3.5 rounded-xl bg-[#F4F9F5] dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/20 space-y-3"
                    >
                      <p className="text-xs font-bold text-[#0B3B24] dark:text-emerald-200">
                        Registrar pago o abono para {debt.name}
                      </p>

                      {payError && (
                        <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                          {payError}
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Monto pagado ({currency})
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            required
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Fecha del pago
                          </label>
                          <input
                            type="date"
                            required
                            value={payDate}
                            onChange={(e) => {
                              setPayDate(e.target.value);
                              if (VALIDATION_LIMITS.DATE_PATTERN.test(e.target.value)) {
                                setPayQuincenaChoice(getQuincenaFromDate(e.target.value));
                              }
                            }}
                            className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Quincena
                          </label>
                          <select
                            value={payQuincenaChoice}
                            onChange={(e) =>
                              setPayQuincenaChoice(Number(e.target.value) === 2 ? 2 : 1)
                            }
                            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-900 dark:text-slate-100"
                          >
                            <option value={1}>
                              1ª Quincena ({getQuincenaRangeLabel(payDate.slice(0, 7) || selectedMonth, 1)})
                            </option>
                            <option value={2}>
                              2ª Quincena ({getQuincenaRangeLabel(payDate.slice(0, 7) || selectedMonth, 2)})
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={payRecordTx}
                            onChange={(e) => setPayRecordTx(e.target.checked)}
                            className="rounded border-emerald-900/30 text-[#0F5A36] focus:ring-emerald-600/40"
                          />
                          Registrar también como gasto en Movimientos
                        </label>

                        {payRecordTx && (
                          <select
                            value={payCategoryId}
                            onChange={(e) => setPayCategoryId(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-900 dark:text-slate-100"
                          >
                            {expenseCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                Categoría: {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <input
                          type="text"
                          maxLength={160}
                          value={payNote}
                          onChange={(e) => setPayNote(e.target.value)}
                          placeholder="Nota opcional (ej. Pago cuota #4)"
                          className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                        <div className="flex items-center justify-end gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPayingDebtId(null)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={payBusy}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-60 rounded-lg whitespace-nowrap"
                          >
                            {payBusy ? 'Guardando...' : 'Confirmar pago'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* Payment History Drawer */}
                  {showHistory && debt.payments.length > 0 && (
                    <div className="sm:ml-12 pt-2 border-t border-emerald-950/[0.06] dark:border-emerald-400/10 space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        Historial de pagos registrados
                      </p>
                      <div className="divide-y divide-emerald-950/[0.05] dark:divide-emerald-400/10">
                        {debt.payments.slice(0, 8).map((p) => (
                          <div
                            key={p.id}
                            className="py-1.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                {formatShortDate(p.date)}
                              </span>
                              {p.note && (
                                <span className="text-slate-500 dark:text-slate-400 ml-2 truncate">
                                  · {p.note}
                                </span>
                              )}
                              {p.recordedAsTx && (
                                <span className="text-emerald-700 dark:text-emerald-400 ml-2">
                                  · En Movimientos
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                              {formatCurrency(p.amount, currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* BLOCK 2: Bank Statements Vault (PDF & Photos) */}
      <section ref={statementsSectionRef} className="mf-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-emerald-950/[0.08] dark:border-emerald-400/12 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display leading-tight">
                Extractos bancarios (PDF y fotos)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Guarda tus estados de cuenta, comprobantes y extractos por mes o vinculados a una
                deuda. Se almacenan en privado en tu dispositivo.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        <form
          onSubmit={handleSaveStatements}
          className="p-4 sm:p-5 bg-[#F6FAF7] dark:bg-[#0D2118] border-b border-emerald-950/[0.08] dark:border-emerald-400/12 space-y-3.5"
        >
          {stmtError && (
            <div className="px-3.5 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{stmtError}</span>
            </div>
          )}

          {/* Drag & Drop + File / Camera Inputs */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDraggingFiles(true);
            }}
            onDragLeave={() => setDraggingFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingFiles(false);
              handleAddFilesToQueue(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed p-4 sm:p-5 text-center transition-colors ${
              draggingFiles
                ? 'border-[#157548] bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-500/15'
                : 'border-emerald-900/20 dark:border-emerald-400/25 bg-white/80 dark:bg-[#0B1D15]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              onChange={(e) => handleAddFilesToQueue(e.target.files)}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleAddFilesToQueue(e.target.files)}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Sube tu extracto en PDF o agrega fotos
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Arrastra archivos aquí o elige desde tu equipo / cámara (PDF, JPG, PNG, WEBP · máx.
                  15 MB c/u)
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#0B3B24] dark:text-emerald-100 bg-[#EFF5F1] dark:bg-[#122D20] hover:bg-emerald-100/80 dark:hover:bg-[#193C2B] border border-emerald-900/15 dark:border-emerald-400/25 rounded-xl transition-colors whitespace-nowrap"
                >
                  <FileText className="w-4 h-4" />
                  Elegir PDF o fotos
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#0B3B24] dark:text-emerald-100 bg-white dark:bg-[#0D2118] hover:bg-emerald-50 dark:hover:bg-[#153425] border border-emerald-900/15 dark:border-emerald-400/25 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Camera className="w-4 h-4" />
                  Tomar foto
                </button>
              </div>
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-4 pt-3 border-t border-emerald-950/[0.08] dark:border-emerald-400/15 text-left space-y-1.5">
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Archivos listos para guardar ({pendingFiles.length}):
                </p>
                {pendingFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#F2F7F4] dark:bg-[#0F261B] text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
                        <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      ) : (
                        <FileImage className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {file.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={`Quitar ${file.name}`}
                      className="p-1 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Statement Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Banco o entidad
              </label>
              <input
                type="text"
                maxLength={70}
                value={stmtBank}
                onChange={(e) => setStmtBank(e.target.value)}
                placeholder="Ej. Bancolombia, BBVA, Nu"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Título del extracto
              </label>
              <input
                type="text"
                maxLength={90}
                value={stmtTitle}
                onChange={(e) => setStmtTitle(e.target.value)}
                placeholder="Opcional (usa el nombre del archivo)"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mes del extracto
              </label>
              <input
                type="month"
                value={stmtMonth}
                onChange={(e) => setStmtMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Vincular a una deuda (opcional)
              </label>
              <select
                value={stmtDebtId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setStmtDebtId(nextId);
                  const found = debtsState.debts.find((d) => d.id === nextId);
                  if (found?.institution && !stmtBank.trim()) {
                    setStmtBank(found.institution);
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                <option value="">Extracto general (sin deuda)</option>
                {debtsState.debts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.institution ? ` · ${d.institution}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <input
              type="text"
              maxLength={240}
              value={stmtNotes}
              onChange={(e) => setStmtNotes(e.target.value)}
              placeholder="Nota opcional (ej. Extracto tarjeta terminada en 4821)"
              className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#0B1D15] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
            <button
              type="submit"
              disabled={uploadingStmt || pendingFiles.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-50 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingStmt
                ? 'Guardando...'
                : pendingFiles.length > 1
                  ? `Guardar ${pendingFiles.length} extractos`
                  : 'Guardar extracto'}
            </button>
          </div>
        </form>

        {/* Statements Filter Bar */}
        {statements.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-emerald-950/[0.06] dark:border-emerald-400/10 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-[#EFF5F1] dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStmtScope('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    stmtScope === 'all'
                      ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Todos ({statements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStmtScope('month')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    stmtScope === 'month'
                      ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {formatShortMonthLabel(selectedMonth)}
                </button>
              </div>

              {debtsState.debts.length > 0 && (
                <select
                  value={stmtDebtFilter}
                  onChange={(e) => setStmtDebtFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#F6FAF7] dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/15 rounded-xl text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Todas las deudas</option>
                  <option value="unlinked">Extractos generales</option>
                  {debtsState.debts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={stmtSearch}
                onChange={(e) => setStmtSearch(e.target.value)}
                placeholder="Buscar extracto o banco..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F6FAF7] dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/15 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          </div>
        )}

        {/* Statements Gallery / List */}
        {loadingStatements ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Cargando extractos guardados...
          </div>
        ) : statements.length === 0 ? (
          <div className="p-6 sm:p-8 text-center space-y-1.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No hay extractos guardados todavía
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Usa los botones de arriba para subir PDFs de tu banco o tomar fotos de tus estados de
              cuenta y comprobantes de pago.
            </p>
          </div>
        ) : filteredStatements.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No se encontraron extractos para este filtro.
          </div>
        ) : (
          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredStatements.map((stmt) => {
              const url = statementUrls[stmt.id];
              const linkedDebtName = stmt.debtId ? debtNameMap.get(stmt.debtId) : undefined;

              return (
                <div
                  key={stmt.id}
                  className="rounded-2xl border border-emerald-950/[0.09] dark:border-emerald-400/15 bg-white dark:bg-[#0D2118] overflow-hidden flex flex-col"
                >
                  {/* Preview Thumbnail */}
                  <button
                    type="button"
                    onClick={() => setPreviewStmt(stmt)}
                    className="relative h-36 w-full bg-[#EFF5F1] dark:bg-[#091810] flex items-center justify-center overflow-hidden group text-left"
                  >
                    {stmt.fileKind === 'image' && url ? (
                      <img
                        src={url}
                        alt={stmt.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                        <span className="w-11 h-11 rounded-2xl bg-rose-100/90 dark:bg-rose-500/15 border border-rose-200/80 dark:border-rose-400/25 text-rose-700 dark:text-rose-300 flex items-center justify-center">
                          <FileText className="w-5 h-5" />
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                          Documento PDF
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatFileSize(stmt.sizeBytes)}
                        </span>
                      </div>
                    )}
                    <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-xl bg-white/95 dark:bg-[#0B1D15]/95 text-xs font-bold text-[#0B3B24] dark:text-emerald-200 shadow-sm inline-flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        Ver extracto
                      </span>
                    </span>
                  </button>

                  {/* Card Details */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {stmt.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Building2 className="w-3 h-3 shrink-0" />
                          {stmt.bankName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatMonthLabel(stmt.monthKey)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {stmt.fileKind === 'pdf' ? 'PDF' : 'Foto'} ·{' '}
                          {formatFileSize(stmt.sizeBytes)}
                        </span>
                      </p>
                      {linkedDebtName && (
                        <p className="text-xs font-semibold text-[#12663F] dark:text-emerald-400 truncate">
                          Deuda: {linkedDebtName}
                        </p>
                      )}
                      {stmt.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {stmt.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-950/[0.06] dark:border-emerald-400/10">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={analyzingStmtId === stmt.id}
                          onClick={() => void handleAnalyzeStatementWithAi(stmt)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-60 rounded-lg transition-all whitespace-nowrap"
                        >
                          {analyzingStmtId === stmt.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <BrainCircuit className="w-3.5 h-3.5" />
                          )}
                          Analizar
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewStmt(stmt)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#0B3B24] dark:text-emerald-200 bg-[#F2F7F4] dark:bg-[#122D20] hover:bg-emerald-100/80 dark:hover:bg-[#193C2B] rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadStatement(stmt)}
                          aria-label={`Descargar ${stmt.title}`}
                          title="Descargar"
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-[#0B1D15] hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {confirmDeleteStmtId === stmt.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteStatement(stmt.id)}
                            className="px-2 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStmtId(null)}
                            className="px-1.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteStmtId(stmt.id)}
                          aria-label={`Eliminar ${stmt.title}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Statement Preview Modal (PDF & Photo Lightbox) */}
      {previewStmt && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewStmt(null);
          }}
        >
          <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#0B1D15] border border-emerald-950/15 dark:border-emerald-400/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-emerald-950/[0.08] dark:border-emerald-400/15 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {previewStmt.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {previewStmt.bankName} · {formatMonthLabel(previewStmt.monthKey)} ·{' '}
                  {previewStmt.fileName} ({formatFileSize(previewStmt.sizeBytes)})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleAnalyzeStatementWithAi(previewStmt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B3B24] dark:text-emerald-200 bg-[#EFF5F1] dark:bg-[#122D20] hover:bg-emerald-100 dark:hover:bg-[#193C2B] border border-emerald-900/15 dark:border-emerald-400/25 rounded-xl whitespace-nowrap"
                >
                  <BrainCircuit className="w-3.5 h-3.5" />
                  Analizar
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadStatement(previewStmt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] rounded-xl whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewStmt(null)}
                  aria-label="Cerrar vista previa"
                  className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#EEF5F0] dark:bg-[#06130D] p-3 sm:p-4 flex items-center justify-center min-h-[320px]">
              {previewStmt.fileKind === 'image' && statementUrls[previewStmt.id] ? (
                <img
                  src={statementUrls[previewStmt.id]}
                  alt={previewStmt.title}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-md"
                />
              ) : statementUrls[previewStmt.id] ? (
                <div className="w-full h-[70vh] flex flex-col gap-2">
                  <iframe
                    src={statementUrls[previewStmt.id]}
                    title={previewStmt.title}
                    className="w-full flex-1 rounded-xl border border-emerald-950/10 dark:border-emerald-400/20 bg-white"
                  />
                  <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                    Si tu navegador móvil no muestra el PDF incrustado, usa el botón{' '}
                    <span className="font-semibold">Descargar</span> arriba para abrirlo completo.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No se pudo generar la vista previa. Usa Descargar para abrir el archivo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Statement Extraction Review Modal */}
      {aiTargetStmt && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget && !analyzingStmtId && !importingAiTxs) {
              setAiTargetStmt(null);
              setAiResult(null);
              setAiError(null);
            }
          }}
        >
          <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#0B1D15] border border-emerald-950/15 dark:border-emerald-400/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-emerald-950/[0.08] dark:border-emerald-400/15 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    Análisis: {aiTargetStmt.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {aiTargetStmt.bankName} · {aiTargetStmt.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(analyzingStmtId) || importingAiTxs}
                onClick={() => {
                  setAiTargetStmt(null);
                  setAiResult(null);
                  setAiError(null);
                }}
                aria-label="Cerrar análisis"
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {analyzingStmtId && (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 mx-auto text-[#157548] dark:text-emerald-400 animate-spin" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Analizando extracto...
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Estamos extrayendo fechas, conceptos, montos y datos de pago de tu documento.
                  </p>
                </div>
              )}

              {aiError && !analyzingStmtId && (
                <div className="px-4 py-3 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiResult && !analyzingStmtId && (
                <>
                  {/* Extracted Summary */}
                  <div className="p-3.5 rounded-xl bg-[#F4F9F5] dark:bg-[#0D2118] border border-emerald-900/12 dark:border-emerald-400/20 space-y-1">
                    <p className="text-xs font-bold text-[#0B3B24] dark:text-emerald-200">
                      {aiResult.bankName || aiTargetStmt.bankName}
                      {aiResult.statementPeriod ? ` · ${aiResult.statementPeriod}` : ''}
                    </p>
                    {aiResult.summary && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {aiResult.summary}
                      </p>
                    )}
                  </div>

                  {/* Detected Debt Card */}
                  {aiResult.detectedDebt?.hasDebtInfo && (
                    <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
                          Datos de deuda detectados en el extracto
                        </p>
                        <p className="text-xs text-amber-900/85 dark:text-amber-200/85 font-mono tabular-nums flex flex-wrap gap-x-2 gap-y-0.5">
                          {aiResult.detectedDebt.totalBalance > 0 && (
                            <span>
                              Saldo: {formatCurrency(aiResult.detectedDebt.totalBalance, currency)}
                            </span>
                          )}
                          {aiResult.detectedDebt.minimumPayment > 0 && (
                            <span>
                              · Cuota/Mín:{' '}
                              {formatCurrency(aiResult.detectedDebt.minimumPayment, currency)}
                            </span>
                          )}
                          {aiResult.detectedDebt.dueDate && (
                            <span>· Límite: {aiResult.detectedDebt.dueDate}</span>
                          )}
                          {aiResult.detectedDebt.cutoffDay > 0 && (
                            <span>· Corte día {aiResult.detectedDebt.cutoffDay}</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyDetectedDebtFromAi}
                        className="px-3.5 py-2 text-xs font-bold text-amber-950 dark:text-amber-100 bg-white dark:bg-amber-900/50 border border-amber-300 dark:border-amber-500/40 rounded-xl hover:bg-amber-100/70 transition-colors whitespace-nowrap shrink-0"
                      >
                        Cargar en nueva deuda
                      </button>
                    </div>
                  )}

                  {/* Extracted Transactions List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Movimientos detectados ({aiResult.transactions.length})
                      </p>
                      {aiResult.transactions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = aiResult.transactions.every(
                              (_, i) => aiSelectedIdx[i]
                            );
                            const next: Record<number, boolean> = {};
                            aiResult.transactions.forEach((_, i) => {
                              next[i] = !allSelected;
                            });
                            setAiSelectedIdx(next);
                          }}
                          className="text-xs font-bold text-[#12663F] dark:text-emerald-400 hover:underline"
                        >
                          {aiResult.transactions.every((_, i) => aiSelectedIdx[i])
                            ? 'Deseleccionar todos'
                            : 'Seleccionar todos'}
                        </button>
                      )}
                    </div>

                    {aiResult.transactions.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                        No se detectaron movimientos individuales en este archivo.
                      </p>
                    ) : (
                      <div className="divide-y divide-emerald-950/[0.07] dark:divide-emerald-400/10 border border-emerald-950/[0.08] dark:border-emerald-400/15 rounded-xl overflow-hidden">
                        {aiResult.transactions.map((tx, idx) => {
                          const checked = Boolean(aiSelectedIdx[idx]);
                          const matchingCats = categories.filter((c) => c.type === tx.type);
                          const catList = matchingCats.length > 0 ? matchingCats : categories;
                          const q = getQuincenaFromDate(tx.date);

                          return (
                            <div
                              key={`${tx.date}-${tx.description}-${idx}`}
                              className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                                checked
                                  ? 'bg-white dark:bg-[#0B1D15]'
                                  : 'bg-slate-50/70 dark:bg-[#07140E] opacity-60'
                              }`}
                            >
                              <label className="flex items-start gap-2.5 min-w-0 cursor-pointer flex-1">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setAiSelectedIdx((prev) => ({
                                      ...prev,
                                      [idx]: e.target.checked,
                                    }))
                                  }
                                  className="mt-1 rounded border-emerald-900/30 text-[#0F5A36] focus:ring-emerald-600/40 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {tx.description}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                    {formatShortDate(tx.date)} · {q === 1 ? '1ª Q' : '2ª Q'} ·{' '}
                                    {tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
                                  </p>
                                </div>
                              </label>

                              <div className="flex items-center justify-between sm:justify-end gap-2.5 pl-6 sm:pl-0 shrink-0">
                                <select
                                  value={aiCategoryIds[idx] ?? ''}
                                  onChange={(e) =>
                                    setAiCategoryIds((prev) => ({
                                      ...prev,
                                      [idx]: e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 text-xs bg-[#F6FAF7] dark:bg-[#0D2118] border border-emerald-900/15 dark:border-emerald-400/20 rounded-lg text-slate-800 dark:text-slate-200 max-w-[165px]"
                                >
                                  {catList.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <span
                                  className={`text-xs sm:text-sm font-mono font-bold tabular-nums whitespace-nowrap ${
                                    tx.type === 'ingreso'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-rose-700 dark:text-rose-400'
                                  }`}
                                >
                                  {tx.type === 'ingreso' ? '+' : '−'}
                                  {formatCurrency(tx.amount, currency)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {aiResult && !analyzingStmtId && aiResult.transactions.length > 0 && (
              <div className="px-4 sm:px-5 py-3.5 border-t border-emerald-950/[0.08] dark:border-emerald-400/15 bg-[#F6FAF7] dark:bg-[#0D2118] flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {Object.values(aiSelectedIdx).filter(Boolean).length} seleccionados para importar
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={importingAiTxs}
                    onClick={() => {
                      setAiTargetStmt(null);
                      setAiResult(null);
                    }}
                    className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    disabled={
                      importingAiTxs ||
                      Object.values(aiSelectedIdx).filter(Boolean).length === 0
                    }
                    onClick={() => void handleImportAiTransactions()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-50 rounded-xl shadow-xs whitespace-nowrap"
                  >
                    {importingAiTxs ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {importingAiTxs
                      ? 'Importando...'
                      : `Importar ${Object.values(aiSelectedIdx).filter(Boolean).length} movimientos`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
