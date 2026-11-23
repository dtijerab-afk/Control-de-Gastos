import type { Timestamp } from 'firebase/firestore';

export type CurrencyCode = 'MXN' | 'USD' | 'EUR' | 'COP' | 'ARS' | 'PEN' | 'CLP';
export type TransactionType = 'ingreso' | 'gasto';
export type QuincenaNumber = 1 | 2;
export type QuincenaFilter = 'all' | 1 | 2;
export type PaymentMethod = 'transferencia' | 'debito' | 'credito' | 'efectivo' | 'otro';
export type NavSection =
  | 'resumen'
  | 'movimientos'
  | 'deudas'
  | 'ahorro'
  | 'ia'
  | 'graficas'
  | 'categorias';

export interface UserProfile {
  uid: string;
  displayName: string;
  currency: CurrencyCode;
  seededDefaults: boolean;
  monthlyBudget?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Category {
  id: string;
  ownerId: string;
  name: string;
  type: TransactionType;
  color: string;
  monthlyBudget: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Transaction {
  id: string;
  ownerId: string;
  type: TransactionType;
  amount: number;
  description: string;
  categoryId: string;
  categoryName: string;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  quincena: QuincenaNumber;
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CategoryInput {
  name: string;
  type: TransactionType;
  color: string;
  monthlyBudget: number;
}

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  description: string;
  categoryId: string;
  categoryName: string;
  date: string;
  quincena: QuincenaNumber;
  paymentMethod: PaymentMethod;
  notes: string;
}

// Verbatim validation constraints synchronized with firebase-blueprint.json & firestore.rules
export const VALIDATION_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  DISPLAY_NAME_MAX: 100,
  CATEGORY_NAME_MAX: 60,
  HEX_COLOR_PATTERN: /^#[0-9A-Fa-f]{6}$/,
  DESCRIPTION_MAX: 140,
  NOTES_MAX: 300,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  MONTH_KEY_PATTERN: /^[0-9]{4}-[0-9]{2}$/,
  AMOUNT_MAX: 1000000000,
} as const;

export const CURRENCIES: { code: CurrencyCode; label: string; locale: string }[] = [
  { code: 'MXN', label: 'Peso mexicano (MXN)', locale: 'es-MX' },
  { code: 'USD', label: 'Dólar estadounidense (USD)', locale: 'es-US' },
  { code: 'COP', label: 'Peso colombiano (COP)', locale: 'es-CO' },
  { code: 'EUR', label: 'Euro (EUR)', locale: 'es-ES' },
  { code: 'ARS', label: 'Peso argentino (ARS)', locale: 'es-AR' },
  { code: 'PEN', label: 'Sol peruano (PEN)', locale: 'es-PE' },
  { code: 'CLP', label: 'Peso chileno (CLP)', locale: 'es-CL' },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Tarjeta débito' },
  { value: 'credito', label: 'Tarjeta crédito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'otro', label: 'Otro' },
];

export const CATEGORY_COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#0F5132', name: 'Bosque' },
  { hex: '#15803D', name: 'Esmeralda' },
  { hex: '#0D9488', name: 'Turquesa' },
  { hex: '#0369A1', name: 'Cobalto' },
  { hex: '#1D4ED8', name: 'Azul' },
  { hex: '#4338CA', name: 'Índigo' },
  { hex: '#6D28D9', name: 'Ciruela' },
  { hex: '#BE123C', name: 'Carmesí' },
  { hex: '#C2410C', name: 'Terracota' },
  { hex: '#B45309', name: 'Ámbar' },
  { hex: '#475569', name: 'Pizarra' },
  { hex: '#334155', name: 'Grafito' },
];

export const DEFAULT_CATEGORIES: CategoryInput[] = [
  { name: 'Nómina quincenal', type: 'ingreso', color: '#0F5132', monthlyBudget: 0 },
  { name: 'Honorarios y proyectos', type: 'ingreso', color: '#0D9488', monthlyBudget: 0 },
  { name: 'Otros ingresos', type: 'ingreso', color: '#0369A1', monthlyBudget: 0 },
  { name: 'Vivienda y renta', type: 'gasto', color: '#334155', monthlyBudget: 0 },
  { name: 'Supermercado y despensa', type: 'gasto', color: '#15803D', monthlyBudget: 0 },
  { name: 'Servicios del hogar', type: 'gasto', color: '#0369A1', monthlyBudget: 0 },
  { name: 'Transporte y movilidad', type: 'gasto', color: '#B45309', monthlyBudget: 0 },
  { name: 'Salud y bienestar', type: 'gasto', color: '#BE123C', monthlyBudget: 0 },
  { name: 'Restaurantes y ocio', type: 'gasto', color: '#C2410C', monthlyBudget: 0 },
  { name: 'Ahorro e inversión', type: 'gasto', color: '#4338CA', monthlyBudget: 0 },
];
