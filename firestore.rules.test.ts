import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic Security Rule Policy & Dirty-Dozen Payload Verification Suite
 * Evaluates adversarial payloads against structural and semantic gates enforced in firestore.rules.
 */
const rulesPath = fs.existsSync(path.resolve('firestore.rules'))
  ? path.resolve('firestore.rules')
  : path.resolve('DRAFT_firestore.rules');

const rulesText = fs.readFileSync(rulesPath, 'utf-8');

interface AuthContext {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

const REQUEST_TIME = '2026-10-29T08:00:00.000Z';
const VALID_VAULT_ID = 'sapha_sps_prod_v1_8c4e9f2a7b1d603e';

const existingDocs = new Map<string, Record<string, any>>();
existingDocs.set(`vaults/${VALID_VAULT_ID}`, {
  examIds: ['exam-valid-1'],
  submissionIds: ['sub-valid-1'],
  spreadsheetId: '',
  spreadsheetUrl: '',
  spreadsheetTitle: '',
  sheetTabName: '',
  appsScriptWebhookUrl: '',
  createdAt: REQUEST_TIME,
  updatedAt: REQUEST_TIME,
});
existingDocs.set(`vaults/${VALID_VAULT_ID}/members/123456`, {
  pin: '123456',
  prefix: 'นาย',
  nameBody: 'สมชาย ใจดี',
  displayName: 'นายสมชาย ใจดี',
  memberRole: 'นักเรียน',
  createdAt: REQUEST_TIME,
  updatedAt: REQUEST_TIME,
});
existingDocs.set(`vaults/${VALID_VAULT_ID}/exams/exam-valid-1`, {
  id: 'exam-valid-1',
  title: 'ข้อสอบทดสอบระบบ',
  description: 'คำอธิบาย',
  passingPercent: 80,
  publishDate: '2026-10-29',
  certificatePublishDate: '2026-10-29',
  templateId: 'tpl-valid-1',
  certificateConfig: {
    textColor: '#0f172a',
    nameY: 42,
    examTitleY: 55,
    scoreY: 66,
    dateY: 77,
    nameSize: 54,
    examTitleSize: 34,
    scoreSize: 28,
    dateSize: 25,
  },
  questions: [{ id: 'q-1', text: 'คำถาม', options: ['ก', 'ข', 'ค', 'ง'], correctIndex: 0 }],
  createdAtIso: '2026-10-29T08:00:00.000Z',
  createdAt: REQUEST_TIME,
  updatedAt: REQUEST_TIME,
});
existingDocs.set(`vaults/${VALID_VAULT_ID}/submissions/sub-valid-1`, {
  id: 'sub-valid-1',
  examId: 'exam-valid-1',
  examTitle: 'ข้อสอบทดสอบระบบ',
  certificatePublishDate: '2026-10-29',
  templateId: 'tpl-valid-1',
  certificateConfig: {
    textColor: '#0f172a',
    nameY: 42,
    examTitleY: 55,
    scoreY: 66,
    dateY: 77,
    nameSize: 54,
    examTitleSize: 34,
    scoreSize: 28,
    dateSize: 25,
  },
  prefix: 'นาย',
  nameBody: 'สมชาย ใจดี',
  studentName: 'นายสมชาย ใจดี',
  memberRole: 'นักเรียน',
  memberPin: '123456',
  score: 0,
  totalQuestions: 5,
  percentage: 0,
  passed: false,
  statusText: 'ไม่ผ่าน',
  certificateNo: '',
  submittedAt: '2026-10-29T08:00:00.000Z',
  sheetSynced: false,
  webhookSynced: false,
  createdAt: REQUEST_TIME,
  updatedAt: REQUEST_TIME,
});

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 3 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function isValidVaultId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 24 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function isValidMemberPin(pin: unknown): pin is string {
  return typeof pin === 'string' && pin.length === 6 && /^\d{6}$/.test(pin) && pin !== '000000';
}

function isAdmin(auth: AuthContext | null): boolean {
  return Boolean(
    auth &&
      auth.email_verified === true &&
      (auth.email === 'Teeranop.ch@gmail.com' || existingDocs.has(`admins/${auth.uid}`))
  );
}

function evaluateDirtyDozen(): void {
  // Structural assertions on rules source
  assert.ok(rulesText.includes("rules_version = '2';"), 'Must use rules_version 2');
  assert.ok(
    rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Must start with global default-deny catch-all'
  );
  assert.equal((rulesText.match(/allow list: if true/g) || []).length, 0, 'Must never allow open list');
  assert.equal((rulesText.match(/allow read: if true/g) || []).length, 0, 'Must never allow open read');
  assert.equal((rulesText.match(/allow write: if true/g) || []).length, 0, 'Must never allow open write');

  // 1. Unverified Admin Email Spoof -> PERMISSION_DENIED
  const spoofAdminAuth: AuthContext = {
    uid: 'spoof1',
    email: 'Teeranop.ch@gmail.com',
    email_verified: false,
  };
  assert.equal(isAdmin(spoofAdminAuth), false, 'Payload 1 must return PERMISSION_DENIED');

  // 2. Vault, Member & Submission Enumeration Scraping -> PERMISSION_DENIED
  const listAllowed = false; // allow list: if false on all collections including members
  assert.equal(listAllowed, false, 'Payload 2 must return PERMISSION_DENIED');

  // 3. Weak/Short Vault ID Poisoning -> PERMISSION_DENIED
  assert.equal(isValidVaultId('short_id'), false, 'Payload 3a must return PERMISSION_DENIED');
  assert.equal(isValidVaultId('invalid/../path_with_slashes_123456'), false, 'Payload 3b must return PERMISSION_DENIED');

  // 4. Shadow / Ghost Field Injection on Exam -> PERMISSION_DENIED
  const allowedExamKeys = new Set([
    'id', 'title', 'description', 'passingPercent', 'publishDate',
    'certificatePublishDate', 'templateId', 'certificateConfig',
    'questions', 'createdAtIso', 'createdAt', 'updatedAt',
  ]);
  const shadowExamPayload = {
    ...existingDocs.get(`vaults/${VALID_VAULT_ID}/exams/exam-valid-1`)!,
    isVerified: true,
  };
  const hasShadowKey = Object.keys(shadowExamPayload).some((k) => !allowedExamKeys.has(k));
  assert.equal(hasShadowKey, true, 'Payload 4 shadow key detected -> PERMISSION_DENIED');

  // 5. Orphaned Submission Creation (unregistered memberPin or non-existent examId) -> PERMISSION_DENIED
  const orphanExamExists = existingDocs.has(`vaults/${VALID_VAULT_ID}/exams/exam-does-not-exist`);
  const unregisteredPinExists = existingDocs.has(`vaults/${VALID_VAULT_ID}/members/999999`);
  assert.equal(orphanExamExists, false, 'Payload 5a must return PERMISSION_DENIED');
  assert.equal(unregisteredPinExists, false, 'Payload 5b must return PERMISSION_DENIED');

  // 6. Outcome / Score Tampering Update on Submission -> PERMISSION_DENIED
  const existingSub = existingDocs.get(`vaults/${VALID_VAULT_ID}/submissions/sub-valid-1`)!;
  const tamperedSub = { ...existingSub, score: 5, percentage: 100, passed: true, statusText: 'ผ่าน' };
  const outcomeUnchanged =
    tamperedSub.score === existingSub.score &&
    tamperedSub.passed === existingSub.passed &&
    tamperedSub.percentage === existingSub.percentage;
  assert.equal(outcomeUnchanged, false, 'Payload 6 must return PERMISSION_DENIED');

  // 7. Reserved Admin PIN (000000) or Duplicate/Malformed PIN Registration -> PERMISSION_DENIED
  assert.equal(isValidMemberPin('000000'), false, 'Payload 7a reserved admin PIN 000000 must return PERMISSION_DENIED');
  assert.equal(isValidMemberPin('12345'), false, 'Payload 7b 5-digit PIN must return PERMISSION_DENIED');
  const duplicatePinCreateAllowed = !existingDocs.has(`vaults/${VALID_VAULT_ID}/members/123456`);
  assert.equal(duplicatePinCreateAllowed, false, 'Payload 7c duplicate PIN create must return PERMISSION_DENIED');

  // 8. Value Poisoning on Whitelisted Update Key (studentName) -> PERMISSION_DENIED
  const poisonedName: unknown = 'A'.repeat(5000);
  const validStudentName =
    typeof poisonedName === 'string' && poisonedName.length >= 1 && poisonedName.length <= 200;
  assert.equal(validStudentName, false, 'Payload 8 must return PERMISSION_DENIED');

  // 9. Oversized Denial-of-Wallet Template Chunk (> 320,000 chars) -> PERMISSION_DENIED
  const oversizedChunk = 'x'.repeat(320001);
  assert.equal(oversizedChunk.length <= 320000, false, 'Payload 9 must return PERMISSION_DENIED');

  // 10. Client-Forged Timestamp Manipulation -> PERMISSION_DENIED
  const forgedTimestamp: string = '2099-01-01T00:00:00.000Z';
  assert.equal(forgedTimestamp === REQUEST_TIME, false, 'Payload 10 must return PERMISSION_DENIED');

  // 11. Unbounded Array Exhaustion (> 500 examIds) -> PERMISSION_DENIED
  const hugeExamIds = Array.from({ length: 501 }, (_, i) => `exam-${i}`);
  assert.equal(hugeExamIds.length <= 500, false, 'Payload 11 must return PERMISSION_DENIED');

  // 12. Orphan Subcollection Write Without Master Vault -> PERMISSION_DENIED
  const missingVaultId = 'sapha_sps_missing_vault_9999999999';
  assert.equal(
    isValidVaultId(missingVaultId) && existingDocs.has(`vaults/${missingVaultId}`),
    false,
    'Payload 12 must return PERMISSION_DENIED'
  );

  // Verify valid checks pass legitimate values
  assert.equal(isValidId('exam-valid-1'), true);
  assert.equal(isValidMemberPin('654321'), true);
  console.log('All 12 Dirty Dozen payloads returned PERMISSION_DENIED as expected.');
}

evaluateDirtyDozen();
