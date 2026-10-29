# Security Specification — SAPHA SPS Firestore Rules

## 1. Data Invariants
1. **Default-Deny Catch-All**: All unspecified paths (`/{document=**}`) deny all `read` and `write` operations unconditionally.
2. **Zero Enumeration (`allow list: if false`)**: Listing is forbidden across `/admins`, `/vaults`, `/vaults/{vaultId}/exams`, `/vaults/{vaultId}/templates`, and `/vaults/{vaultId}/submissions`. Records can only be accessed via exact document IDs under a high-entropy `vaultId` (`>= 24` chars).
3. **Master Gate Relational Sync**: Every subcollection document (`exams`, `templates`, `submissions`) requires its parent `/vaults/{vaultId}` document to exist (`exists(...) || existsAfter(...)`).
4. **Referential Integrity on Submissions**: A `SubmissionDocument` can only be created if `/vaults/{vaultId}/exams/{examId}` exists, preventing orphaned submissions.
5. **Terminal Grading Outcome Immutability**: Once a `SubmissionDocument` is created, grading fields (`score`, `totalQuestions`, `percentage`, `passed`, `statusText`, `certificateNo`, `examId`, `studentCode`, `submittedAt`, `createdAt`) are locked and cannot be altered by standard update actions.
6. **Strict Schema, Key Allowlists & Volumetric Bounds**: Every `create` and `update` invokes `isValid[Entity](incoming())` checking `.keys().hasAll(...)`, `.keys().hasOnly(...)`, regex formats, bounded list sizes, and `.size() <= MAX` on every string.
7. **Temporal Integrity**: `createdAt` and `updatedAt` must equal server `request.time` on creation; `createdAt` is immutable on update and `updatedAt` must equal `request.time`.
8. **Verified Admin Bootstrap**: `isAdmin()` requires `request.auth != null && request.auth.token.email_verified == true` before evaluating email or `/admins/{uid}` existence.

## 2. The "Dirty Dozen" Attack Payloads
1. **Payload 1 — Unverified Admin Email Spoof**: `{ auth: { uid: 'spoof1', email: 'Teeranop.ch@gmail.com', email_verified: false } }` attempting write to `/admins/spoof1` -> `PERMISSION_DENIED`.
2. **Payload 2 — Vault Enumeration Scraping**: `list` query on `/vaults` or `/vaults/{vaultId}/submissions` -> `PERMISSION_DENIED`.
3. **Payload 3 — Weak/Short Vault ID Poisoning**: Creating `/vaults/short_id` (`< 24` chars) or ID with illegal characters `../etc` -> `PERMISSION_DENIED`.
4. **Payload 4 — Shadow / Ghost Field Injection on Exam**: Creating an `ExamDocument` with extra field `isVerified: true` -> `PERMISSION_DENIED` (`hasOnly` rejection).
5. **Payload 5 — Orphaned Submission Creation**: Creating a `SubmissionDocument` referencing a non-existent `examId` -> `PERMISSION_DENIED`.
6. **Payload 6 — Outcome / Score Tampering Update**: Updating `SubmissionDocument` to change `score: 5`, `percentage: 100`, `passed: true` -> `PERMISSION_DENIED` (terminal outcome lock + `affectedKeys().hasOnly`).
7. **Payload 7 — Student Code Format Violation**: Creating a `SubmissionDocument` with `studentCode: "123456"` (6 digits instead of 5 digits `^\d{5}$`) -> `PERMISSION_DENIED`.
8. **Payload 8 — Value Poisoning on Whitelisted Update Key**: Updating `studentName` on `SubmissionDocument` with a boolean `true` or 5,000-char string -> `PERMISSION_DENIED` (`isValidSubmission` wrapper blocks invalid type/size).
9. **Payload 9 — Oversized Denial-of-Wallet Template Chunk**: Creating `CertificateTemplate` with `part0` exceeding `320,000` chars -> `PERMISSION_DENIED`.
10. **Payload 10 — Client-Forged Timestamp Manipulation**: Creating or updating an `ExamDocument` where `updatedAt != request.time` or mutating `createdAt` on update -> `PERMISSION_DENIED`.
11. **Payload 11 — Unbounded Array Exhaustion**: Updating `VaultIndex` with `examIds` exceeding `500` items or non-string first element -> `PERMISSION_DENIED`.
12. **Payload 12 — Orphan Subcollection Write Without Master Vault**: Creating `/vaults/{randomVaultId}/exams/exam-1` when `/vaults/{randomVaultId}` does not exist -> `PERMISSION_DENIED`.
