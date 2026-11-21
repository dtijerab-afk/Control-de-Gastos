# Security Specification — Quincena Personal Finance

## 1. Data Invariants
1. **Master User Ownership**: Every `Category` and `Transaction` lives under `/users/{userId}/...` and requires the parent `/users/{userId}` document to exist with `uid == request.auth.uid` on single-document operations.
2. **Verified Identity**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Referential Integrity**: Creating a `Transaction` requires that `/users/{userId}/categories/{categoryId}` exists.
4. **Immutable Ownership & Timestamps**: `uid`, `ownerId`, and `createdAt` can never change after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **Strict Volumetric & Schema Bounds**: Every string enforces `.size()` limits matching `firebase-blueprint.json`; `amount > 0 && amount <= 1000000000`; `quincena in [1, 2]`; no shadow fields permitted.
6. **Zero PII & No Blanket Lists**: `/users` cannot be listed; subcollection `list` queries strictly enforce `resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/users/u1/transactions/t1` with `auth = null`. -> `PERMISSION_DENIED`
2. **Unverified Email Spoof**: Creating `/users/u1` with `auth.uid = 'u1'`, `email_verified = false`. -> `PERMISSION_DENIED`
3. **Cross-Tenant Read**: User `u2` reading `/users/u1/transactions/t1`. -> `PERMISSION_DENIED`
4. **Cross-Tenant Ownership Spoof**: User `u1` creating `/users/u1/transactions/t1` with `ownerId: 'u2'`. -> `PERMISSION_DENIED`
5. **Shadow Field Injection**: Creating a category with an extra ghost field `{ isAdmin: true }`. -> `PERMISSION_DENIED`
6. **Oversized Document ID Poisoning**: Creating `/users/u1/transactions/<200-char-invalid-id>` with special characters. -> `PERMISSION_DENIED`
7. **Orphan Transaction (Missing Category)**: Creating a transaction referencing nonexistent `categoryId: 'fake_cat'`. -> `PERMISSION_DENIED`
8. **Negative or Zero Amount**: Creating a transaction with `amount: -500` or `amount: 0`. -> `PERMISSION_DENIED`
9. **Invalid Quincena Value**: Creating a transaction with `quincena: 3`. -> `PERMISSION_DENIED`
10. **Client-Forged Timestamp**: Creating a transaction with `createdAt: Timestamp(2020-01-01)` instead of `request.time`. -> `PERMISSION_DENIED`
11. **Immutable Field Tampering on Update**: Updating `createdAt` or `ownerId` on an existing transaction. -> `PERMISSION_DENIED`
12. **Value Poisoning on Update**: Updating `description` to a 500-char string or changing `color` to `'not-a-hex'`. -> `PERMISSION_DENIED`
