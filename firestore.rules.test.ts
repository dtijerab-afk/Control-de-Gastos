/**
 * Security Rules Specification Verification Harness (Dirty Dozen Adversarial Suite)
 * Mirrors the exact constraints enforced in firestore.rules and firebase-blueprint.json.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  enforcedBy: string;
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Transaction Write',
    operation: 'create',
    path: '/users/u1/transactions/t1',
    auth: null,
    payload: { ownerId: 'u1', type: 'gasto', amount: 150 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isSignedIn() && isOwner(userId)',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    operation: 'create',
    path: '/users/u1',
    auth: { uid: 'u1', email_verified: false },
    payload: { uid: 'u1', displayName: 'Spoof', currency: 'MXN', seededDefaults: false },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Cross-Tenant Read',
    operation: 'get',
    path: '/users/u1/transactions/t1',
    auth: { uid: 'u2', email_verified: true },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) && hasValidParentUser(userId)',
  },
  {
    id: 4,
    name: 'Cross-Tenant OwnerId Spoof',
    operation: 'create',
    path: '/users/u1/transactions/t1',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u2', type: 'gasto', amount: 200 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidTransaction(): data.ownerId == request.auth.uid',
  },
  {
    id: 5,
    name: 'Shadow Field Injection',
    operation: 'create',
    path: '/users/u1/categories/c1',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1', name: 'Food', type: 'gasto', color: '#15803D', monthlyBudget: 0, isAdmin: true },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().keys().hasOnly([...])',
  },
  {
    id: 6,
    name: 'Oversized / Malformed Path ID Poisoning',
    operation: 'create',
    path: '/users/u1/transactions/' + 'x$'.repeat(100),
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidId(transactionId)',
  },
  {
    id: 7,
    name: 'Orphan Transaction Without Existing Category',
    operation: 'create',
    path: '/users/u1/transactions/t2',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1', categoryId: 'nonexistent_cat' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'exists(/databases/$(database)/documents/users/$(userId)/categories/$(incoming().categoryId))',
  },
  {
    id: 8,
    name: 'Negative Amount Injection',
    operation: 'create',
    path: '/users/u1/transactions/t3',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1', amount: -500 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidTransaction(): data.amount > 0',
  },
  {
    id: 9,
    name: 'Invalid Quincena Index (3)',
    operation: 'create',
    path: '/users/u1/transactions/t4',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1', quincena: 3 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidTransaction(): data.quincena in [1, 2]',
  },
  {
    id: 10,
    name: 'Client-Forged Timestamp',
    operation: 'create',
    path: '/users/u1/transactions/t5',
    auth: { uid: 'u1', email_verified: true },
    payload: { ownerId: 'u1', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == request.time',
  },
  {
    id: 11,
    name: 'Immutable CreatedAt Tampering on Update',
    operation: 'update',
    path: '/users/u1/transactions/t1',
    auth: { uid: 'u1', email_verified: true },
    payload: { createdAt: 'request.time' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == existing().createdAt && affectedKeys().hasOnly([...])',
  },
  {
    id: 12,
    name: 'Value Poisoning on Update (Oversized Description / Invalid Hex Color)',
    operation: 'update',
    path: '/users/u1/categories/c1',
    auth: { uid: 'u1', email_verified: true },
    payload: { color: 'javascript:alert(1)', name: 'A'.repeat(500) },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidCategory(incoming(), userId) in allow update',
  },
];
