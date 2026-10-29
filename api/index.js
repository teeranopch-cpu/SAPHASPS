import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore/lite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0821174441',
  appId: '1:101829149860:web:b76e49ba27fde5a6575231',
  apiKey: 'AIzaSyDqwnur7evvigXhn4F76SesRetMSWoccU8',
  authDomain: 'gen-lang-client-0821174441.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-certiexam-7124decc-9b8d-46f0-b8ee-24d255306798',
  storageBucket: 'gen-lang-client-0821174441.firebasestorage.app',
  messagingSenderId: '101829149860',
};

function loadFirebaseConfig() {
  const candidates = [
    path.resolve(__dirname, '..', 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const cfgPath of candidates) {
    try {
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (parsed && parsed.projectId && parsed.apiKey) {
          return parsed;
        }
      }
    } catch {
      // Fallback to embedded public client config
    }
  }
  return FALLBACK_FIREBASE_CONFIG;
}

const firebaseConfig = loadFirebaseConfig();
const SERVER_APP_NAME = 'sapha-sps-server-lite';

function getServerDb() {
  const existing = getApps().find((a) => a.name === SERVER_APP_NAME);
  const app = existing || initializeApp(firebaseConfig, SERVER_APP_NAME);
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

const VAULT_ID = process.env.SAPHA_VAULT_ID || 'sapha_sps_prod_v1_8c4e9f2a7b1d603e';
const ADMIN_USER = '00000';
const ADMIN_PASS = '00000';
const ADMIN_TOKEN = 'SAPHA SPS-admin-00000';

/** @type {Map<string, string>} */
const templateMemoryCache = new Map();

const BLANK_CERT_FRAME_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1131" width="1600" height="1131">
      <rect width="1600" height="1131" fill="#fdfcf8"/>
      <rect x="48" y="48" width="1504" height="1035" fill="none" stroke="#0f2942" stroke-width="10"/>
      <rect x="68" y="68" width="1464" height="995" fill="none" stroke="#c59b27" stroke-width="3"/>
      <line x1="560" y1="265" x2="1040" y2="265" stroke="#c59b27" stroke-width="2"/>
      <text x="800" y="230" text-anchor="middle" font-family="Sarabun, sans-serif" font-size="48" font-weight="700" fill="#0f2942">เกียรติบัตร</text>
    </svg>`
  );

const DEFAULT_CERT_CONFIG = {
  textColor: '#0f172a',
  nameY: 42,
  examTitleY: 55,
  scoreY: 66,
  dateY: 77,
  nameSize: 54,
  examTitleSize: 34,
  scoreSize: 28,
  dateSize: 25,
};

/**
 * @param {unknown} error
 * @param {'create' | 'update' | 'delete' | 'list' | 'get' | 'write'} operationType
 * @param {string | null} docPath
 */
function buildFirestoreErrorInfo(error, operationType, docPath) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path: docPath,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function getBangkokTodayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * @param {unknown} input
 * @param {string} fallback
 */
function normalizeDateString(input, fallback) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  if (typeof input === 'string' && input.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    return input.slice(0, 10);
  }
  return fallback;
}

/**
 * @param {Record<string, any> | undefined} cfg
 */
function normalizeCertConfig(cfg) {
  const rawColor =
    typeof cfg?.textColor === 'string' && cfg.textColor.trim().length >= 4
      ? cfg.textColor.trim().slice(0, 32)
      : DEFAULT_CERT_CONFIG.textColor;

  return {
    textColor: rawColor,
    nameY:
      typeof cfg?.nameY === 'number'
        ? Math.min(95, Math.max(5, cfg.nameY))
        : DEFAULT_CERT_CONFIG.nameY,
    examTitleY:
      typeof cfg?.examTitleY === 'number'
        ? Math.min(95, Math.max(5, cfg.examTitleY))
        : DEFAULT_CERT_CONFIG.examTitleY,
    scoreY:
      typeof cfg?.scoreY === 'number'
        ? Math.min(95, Math.max(5, cfg.scoreY))
        : DEFAULT_CERT_CONFIG.scoreY,
    dateY:
      typeof cfg?.dateY === 'number'
        ? Math.min(95, Math.max(5, cfg.dateY))
        : DEFAULT_CERT_CONFIG.dateY,
    nameSize:
      typeof cfg?.nameSize === 'number'
        ? Math.min(120, Math.max(16, cfg.nameSize))
        : DEFAULT_CERT_CONFIG.nameSize,
    examTitleSize:
      typeof cfg?.examTitleSize === 'number'
        ? Math.min(90, Math.max(14, cfg.examTitleSize))
        : DEFAULT_CERT_CONFIG.examTitleSize,
    scoreSize:
      typeof cfg?.scoreSize === 'number'
        ? Math.min(80, Math.max(12, cfg.scoreSize))
        : DEFAULT_CERT_CONFIG.scoreSize,
    dateSize:
      typeof cfg?.dateSize === 'number'
        ? Math.min(75, Math.max(12, cfg.dateSize))
        : DEFAULT_CERT_CONFIG.dateSize,
  };
}

/**
 * Splits a base64 image string into 3 parts <= 320,000 chars each for Firestore storage.
 * @param {string} dataUrl
 */
function splitTemplateParts(dataUrl) {
  const clean = String(dataUrl || '');
  if (clean.length < 20) {
    throw new Error('ไฟล์รูปภาพเกียรติบัตรไม่ถูกต้อง');
  }
  if (clean.length > 960_000) {
    throw new Error('ขนาดรูปภาพเกียรติบัตรใหญ่เกินกำหนด กรุณาอัปโหลดรูปภาพใหม่อีกครั้ง');
  }
  return {
    part0: clean.slice(0, 320_000),
    part1: clean.slice(320_000, 640_000),
    part2: clean.slice(640_000, 960_000),
  };
}

/**
 * @param {any} db
 */
async function ensureVaultIndex(db) {
  const vaultPath = `vaults/${VAULT_ID}`;
  const vaultRef = doc(db, 'vaults', VAULT_ID);
  try {
    const snap = await getDoc(vaultRef);
    if (snap.exists()) {
      const d = snap.data();
      return {
        examIds: Array.isArray(d.examIds) ? d.examIds : [],
        submissionIds: Array.isArray(d.submissionIds) ? d.submissionIds : [],
        spreadsheetId: typeof d.spreadsheetId === 'string' ? d.spreadsheetId : '',
        spreadsheetUrl: typeof d.spreadsheetUrl === 'string' ? d.spreadsheetUrl : '',
        spreadsheetTitle: typeof d.spreadsheetTitle === 'string' ? d.spreadsheetTitle : '',
        sheetTabName: typeof d.sheetTabName === 'string' ? d.sheetTabName : '',
        appsScriptWebhookUrl:
          typeof d.appsScriptWebhookUrl === 'string' ? d.appsScriptWebhookUrl : '',
      };
    }

    const initialVault = {
      examIds: [],
      submissionIds: [],
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      sheetTabName: '',
      appsScriptWebhookUrl: (process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL || '').slice(0, 600),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(vaultRef, initialVault);
    return {
      examIds: [],
      submissionIds: [],
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      sheetTabName: '',
      appsScriptWebhookUrl: (process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL || '').slice(0, 600),
    };
  } catch (err) {
    buildFirestoreErrorInfo(err, 'get', vaultPath);
    throw err;
  }
}

/**
 * @param {any} db
 * @param {string} templateId
 * @returns {Promise<string>}
 */
async function loadTemplateDataUrl(db, templateId) {
  if (!templateId) return BLANK_CERT_FRAME_SVG;
  const cached = templateMemoryCache.get(templateId);
  if (cached) return cached;

  const tplPath = `vaults/${VAULT_ID}/templates/${templateId}`;
  try {
    const snap = await getDoc(doc(db, 'vaults', VAULT_ID, 'templates', templateId));
    if (!snap.exists()) return BLANK_CERT_FRAME_SVG;
    const d = snap.data();
    const combined = `${d.part0 || ''}${d.part1 || ''}${d.part2 || ''}`;
    if (combined) {
      if (templateMemoryCache.size > 60) {
        const firstKey = templateMemoryCache.keys().next().value;
        if (firstKey) templateMemoryCache.delete(firstKey);
      }
      templateMemoryCache.set(templateId, combined);
      return combined;
    }
    return BLANK_CERT_FRAME_SVG;
  } catch (err) {
    buildFirestoreErrorInfo(err, 'get', tplPath);
    return BLANK_CERT_FRAME_SVG;
  }
}

/**
 * @param {express.Request} req
 */
function isAdminAuthorized(req) {
  const token = req.headers['x-admin-token'];
  return token === ADMIN_TOKEN;
}

/**
 * @param {string} webhookUrl
 * @param {Record<string, unknown>} payload
 */
async function forwardToAppsScript(webhookUrl, payload) {
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    return false;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function createApiRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      storage: 'cloud-firestore',
      projectId: firebaseConfig.projectId,
    });
  });

  // Admin Login (00000 / 00000)
  router.post('/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      res.json({ ok: true, adminToken: ADMIN_TOKEN });
      return;
    }
    res.status(401).json({ ok: false, error: 'รหัสผู้ดูแลระบบไม่ถูกต้อง' });
  });

  // List Exam Sets from Cloud Firestore
  router.get('/exams', async (req, res) => {
    try {
      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const isAdmin = isAdminAuthorized(req);
      const today = getBangkokTodayDate();

      if (vault.examIds.length === 0) {
        res.json({ exams: [], serverToday: today });
        return;
      }

      const snaps = await Promise.all(
        vault.examIds.map((id) =>
          getDoc(doc(db, 'vaults', VAULT_ID, 'exams', id)).catch((err) => {
            buildFirestoreErrorInfo(err, 'get', `vaults/${VAULT_ID}/exams/${id}`);
            throw err;
          })
        )
      );

      const rawExams = snaps.filter((s) => s.exists()).map((s) => s.data());
      const uniqueTemplateIds = Array.from(
        new Set(rawExams.map((e) => e.templateId).filter(Boolean))
      );
      const templateEntries = await Promise.all(
        uniqueTemplateIds.map(async (tid) => [tid, await loadTemplateDataUrl(db, tid)])
      );
      const templateMap = new Map(templateEntries);

      const exams = rawExams.map((exam) => {
        const isPublished = exam.publishDate <= today;
        const questionsList = Array.isArray(exam.questions) ? exam.questions : [];
        return {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          passingPercent: exam.passingPercent,
          publishDate: exam.publishDate,
          certificatePublishDate: exam.certificatePublishDate,
          isPublished,
          certificateTemplate: templateMap.get(exam.templateId) || BLANK_CERT_FRAME_SVG,
          certificateConfig: normalizeCertConfig(exam.certificateConfig),
          createdAt: exam.createdAtIso || new Date().toISOString(),
          questionCount: questionsList.length,
          questions:
            isAdmin || isPublished
              ? questionsList.map((q) => ({
                  id: q.id,
                  text: q.text,
                  options: q.options,
                  ...(isAdmin ? { correctIndex: q.correctIndex } : {}),
                }))
              : [],
        };
      });

      res.json({ exams, serverToday: today });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลชุดข้อสอบจากฐานข้อมูลได้',
      });
    }
  });

  // Create New Exam Set permanently in Cloud Firestore (Admin Only)
  router.post('/exams', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    try {
      const {
        title,
        description,
        publishDate,
        certificatePublishDate,
        certificateTemplate,
        certificateConfig,
        questions,
      } = req.body || {};

      const cleanTitle = String(title || '').trim().slice(0, 300);
      if (!cleanTitle) {
        res.status(400).json({ error: 'กรุณาระบุชื่อชุดข้อสอบ' });
        return;
      }

      if (!certificateTemplate || !String(certificateTemplate).startsWith('data:image/')) {
        res
          .status(400)
          .json({ error: 'กรุณาอัปโหลดไฟล์รูปภาพรูปแบบเกียรติบัตรสำหรับชุดข้อสอบนี้' });
        return;
      }

      if (!Array.isArray(questions) || questions.length === 0) {
        res.status(400).json({ error: 'กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ' });
        return;
      }
      if (questions.length > 200) {
        res.status(400).json({ error: 'รองรับคำถามสูงสุดไม่เกิน 200 ข้อต่อชุด' });
        return;
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (
          !q.text?.trim() ||
          !Array.isArray(q.options) ||
          q.options.length !== 4 ||
          q.options.some((opt) => !String(opt).trim()) ||
          typeof q.correctIndex !== 'number' ||
          q.correctIndex < 0 ||
          q.correctIndex > 3
        ) {
          res.status(400).json({
            error: `ข้อมูลคำถามข้อที่ ${i + 1} ไม่ครบถ้วน กรุณากรอกตัวเลือก ก-ง และระบุข้อที่ถูก`,
          });
          return;
        }
      }

      const tplParts = splitTemplateParts(String(certificateTemplate));
      const today = getBangkokTodayDate();
      const resolvedPublishDate = normalizeDateString(publishDate, today);
      const resolvedCertDate = normalizeDateString(certificatePublishDate, resolvedPublishDate);

      const db = getServerDb();
      const vault = await ensureVaultIndex(db);

      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const examId = `exam-${suffix}`;
      const templateId = `tpl-${suffix}`;
      const createdAtIso = new Date().toISOString();
      const cleanDescription = String(
        description || 'แบบทดสอบออนไลน์ประเมินความรู้ เกณฑ์ผ่านร้อยละ 80 ขึ้นไป'
      )
        .trim()
        .slice(0, 1000);
      const normalizedConfig = normalizeCertConfig(certificateConfig);
      const normalizedQuestions = questions.map((q, idx) => ({
        id: `q-${Date.now().toString(36)}-${idx + 1}`,
        text: String(q.text).trim().slice(0, 1000),
        options: [
          String(q.options[0]).trim().slice(0, 500),
          String(q.options[1]).trim().slice(0, 500),
          String(q.options[2]).trim().slice(0, 500),
          String(q.options[3]).trim().slice(0, 500),
        ],
        correctIndex: q.correctIndex,
      }));

      const batch = writeBatch(db);
      batch.set(doc(db, 'vaults', VAULT_ID, 'templates', templateId), {
        id: templateId,
        part0: tplParts.part0,
        part1: tplParts.part1,
        part2: tplParts.part2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'vaults', VAULT_ID, 'exams', examId), {
        id: examId,
        title: cleanTitle,
        description: cleanDescription,
        passingPercent: 80,
        publishDate: resolvedPublishDate,
        certificatePublishDate: resolvedCertDate,
        templateId,
        certificateConfig: normalizedConfig,
        questions: normalizedQuestions,
        createdAtIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'vaults', VAULT_ID), {
        examIds: [examId, ...vault.examIds].slice(0, 500),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        buildFirestoreErrorInfo(err, 'write', `vaults/${VAULT_ID}/exams/${examId}`);
        throw err;
      }

      templateMemoryCache.set(templateId, String(certificateTemplate));

      res.status(201).json({
        exam: {
          id: examId,
          title: cleanTitle,
          description: cleanDescription,
          passingPercent: 80,
          publishDate: resolvedPublishDate,
          certificatePublishDate: resolvedCertDate,
          isPublished: resolvedPublishDate <= today,
          certificateTemplate: String(certificateTemplate),
          certificateConfig: normalizedConfig,
          createdAt: createdAtIso,
          questionCount: normalizedQuestions.length,
          questions: normalizedQuestions,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'บันทึกชุดข้อสอบไม่สำเร็จ',
      });
    }
  });

  // Update Full Exam Set & Certificate in Cloud Firestore (Admin Only)
  router.put('/exams/:id', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    try {
      const examId = req.params.id;
      const {
        title,
        description,
        publishDate,
        certificatePublishDate,
        certificateTemplate,
        certificateConfig,
        questions,
      } = req.body || {};

      const cleanTitle = String(title || '').trim().slice(0, 300);
      if (!cleanTitle) {
        res.status(400).json({ error: 'กรุณาระบุชื่อชุดข้อสอบ' });
        return;
      }

      if (!Array.isArray(questions) || questions.length === 0) {
        res.status(400).json({ error: 'กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ' });
        return;
      }
      if (questions.length > 200) {
        res.status(400).json({ error: 'รองรับคำถามสูงสุดไม่เกิน 200 ข้อต่อชุด' });
        return;
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (
          !q.text?.trim() ||
          !Array.isArray(q.options) ||
          q.options.length !== 4 ||
          q.options.some((opt) => !String(opt).trim()) ||
          typeof q.correctIndex !== 'number' ||
          q.correctIndex < 0 ||
          q.correctIndex > 3
        ) {
          res.status(400).json({
            error: `ข้อมูลคำถามข้อที่ ${i + 1} ไม่ครบถ้วน กรุณากรอกตัวเลือก ก-ง และระบุข้อที่ถูก`,
          });
          return;
        }
      }

      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const examRef = doc(db, 'vaults', VAULT_ID, 'exams', examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        res.status(404).json({ error: 'ไม่พบชุดข้อสอบที่ต้องการแก้ไข' });
        return;
      }

      const exam = examSnap.data();
      const today = getBangkokTodayDate();
      const nextPublishDate = normalizeDateString(publishDate, exam.publishDate);
      const nextCertPublishDate = normalizeDateString(
        certificatePublishDate,
        exam.certificatePublishDate || nextPublishDate
      );
      const cleanDescription = String(
        description ?? exam.description ?? 'แบบทดสอบออนไลน์ประเมินความรู้ เกณฑ์ผ่านร้อยละ 80 ขึ้นไป'
      )
        .trim()
        .slice(0, 1000);
      const nextCertConfig = certificateConfig
        ? normalizeCertConfig({ ...exam.certificateConfig, ...certificateConfig })
        : normalizeCertConfig(exam.certificateConfig);

      const normalizedQuestions = questions.map((q, idx) => ({
        id:
          typeof q.id === 'string' && q.id.trim().length >= 3
            ? q.id.trim().slice(0, 64)
            : `q-${Date.now().toString(36)}-${idx + 1}`,
        text: String(q.text).trim().slice(0, 1000),
        options: [
          String(q.options[0]).trim().slice(0, 500),
          String(q.options[1]).trim().slice(0, 500),
          String(q.options[2]).trim().slice(0, 500),
          String(q.options[3]).trim().slice(0, 500),
        ],
        correctIndex: q.correctIndex,
      }));

      let nextTemplateId = exam.templateId;
      let resolvedTemplateUrl = await loadTemplateDataUrl(db, exam.templateId);

      if (
        certificateTemplate &&
        String(certificateTemplate).startsWith('data:image/') &&
        String(certificateTemplate) !== resolvedTemplateUrl
      ) {
        const tplParts = splitTemplateParts(String(certificateTemplate));
        nextTemplateId = `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'vaults', VAULT_ID, 'templates', nextTemplateId), {
          id: nextTemplateId,
          part0: tplParts.part0,
          part1: tplParts.part1,
          part2: tplParts.part2,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resolvedTemplateUrl = String(certificateTemplate);
        templateMemoryCache.set(nextTemplateId, resolvedTemplateUrl);
      }

      try {
        await updateDoc(examRef, {
          title: cleanTitle,
          description: cleanDescription,
          questions: normalizedQuestions,
          publishDate: nextPublishDate,
          certificatePublishDate: nextCertPublishDate,
          templateId: nextTemplateId,
          certificateConfig: nextCertConfig,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        buildFirestoreErrorInfo(err, 'update', `vaults/${VAULT_ID}/exams/${examId}`);
        throw err;
      }

      if (vault.submissionIds.length > 0) {
        const subSnaps = await Promise.all(
          vault.submissionIds.map((sid) =>
            getDoc(doc(db, 'vaults', VAULT_ID, 'submissions', sid))
          )
        );
        const matchingSubs = subSnaps.filter(
          (s) => s.exists() && s.data().examId === examId
        );
        await Promise.all(
          matchingSubs.map((s) =>
            updateDoc(doc(db, 'vaults', VAULT_ID, 'submissions', s.id), {
              examTitle: cleanTitle,
              certificatePublishDate: nextCertPublishDate,
              templateId: nextTemplateId,
              certificateConfig: nextCertConfig,
              updatedAt: serverTimestamp(),
            })
          )
        );
      }

      res.json({
        ok: true,
        exam: {
          id: examId,
          title: cleanTitle,
          description: cleanDescription,
          passingPercent: exam.passingPercent || 80,
          publishDate: nextPublishDate,
          certificatePublishDate: nextCertPublishDate,
          isPublished: nextPublishDate <= today,
          certificateTemplate: resolvedTemplateUrl,
          certificateConfig: nextCertConfig,
          createdAt: exam.createdAtIso,
          questionCount: normalizedQuestions.length,
          questions: normalizedQuestions,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'แก้ไขชุดข้อสอบไม่สำเร็จ',
      });
    }
  });

  // Update Schedule & Certificate Settings of Existing Exam in Cloud Firestore (Admin Only)
  router.put('/exams/:id/certificate', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    try {
      const examId = req.params.id;
      const { publishDate, certificatePublishDate, certificateTemplate, certificateConfig } =
        req.body || {};

      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const examRef = doc(db, 'vaults', VAULT_ID, 'exams', examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
        return;
      }

      const exam = examSnap.data();
      const nextPublishDate = publishDate
        ? normalizeDateString(publishDate, exam.publishDate)
        : exam.publishDate;
      const nextCertPublishDate = certificatePublishDate
        ? normalizeDateString(certificatePublishDate, exam.certificatePublishDate)
        : exam.certificatePublishDate;
      const nextCertConfig = certificateConfig
        ? normalizeCertConfig({ ...exam.certificateConfig, ...certificateConfig })
        : normalizeCertConfig(exam.certificateConfig);

      let nextTemplateId = exam.templateId;
      let resolvedTemplateUrl = await loadTemplateDataUrl(db, exam.templateId);

      if (
        certificateTemplate &&
        String(certificateTemplate).startsWith('data:image/') &&
        String(certificateTemplate) !== resolvedTemplateUrl
      ) {
        const tplParts = splitTemplateParts(String(certificateTemplate));
        nextTemplateId = `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'vaults', VAULT_ID, 'templates', nextTemplateId), {
          id: nextTemplateId,
          part0: tplParts.part0,
          part1: tplParts.part1,
          part2: tplParts.part2,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resolvedTemplateUrl = String(certificateTemplate);
        templateMemoryCache.set(nextTemplateId, resolvedTemplateUrl);
      }

      try {
        await updateDoc(examRef, {
          publishDate: nextPublishDate,
          certificatePublishDate: nextCertPublishDate,
          templateId: nextTemplateId,
          certificateConfig: nextCertConfig,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        buildFirestoreErrorInfo(err, 'update', `vaults/${VAULT_ID}/exams/${examId}`);
        throw err;
      }

      // Propagate updated certificate settings to existing submissions for this exam
      if (vault.submissionIds.length > 0) {
        const subSnaps = await Promise.all(
          vault.submissionIds.map((sid) =>
            getDoc(doc(db, 'vaults', VAULT_ID, 'submissions', sid))
          )
        );
        const matchingSubs = subSnaps.filter(
          (s) => s.exists() && s.data().examId === examId
        );
        await Promise.all(
          matchingSubs.map((s) =>
            updateDoc(doc(db, 'vaults', VAULT_ID, 'submissions', s.id), {
              certificatePublishDate: nextCertPublishDate,
              templateId: nextTemplateId,
              certificateConfig: nextCertConfig,
              updatedAt: serverTimestamp(),
            })
          )
        );
      }

      res.json({
        ok: true,
        exam: {
          ...exam,
          publishDate: nextPublishDate,
          certificatePublishDate: nextCertPublishDate,
          certificateTemplate: resolvedTemplateUrl,
          certificateConfig: nextCertConfig,
          createdAt: exam.createdAtIso,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'อัปเดตข้อมูลเกียรติบัตรไม่สำเร็จ',
      });
    }
  });

  // Delete Exam Set from Cloud Firestore (Admin Only)
  router.delete('/exams/:id', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    try {
      const examId = req.params.id;
      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const examRef = doc(db, 'vaults', VAULT_ID, 'exams', examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists() && !vault.examIds.includes(examId)) {
        res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
        return;
      }

      const batch = writeBatch(db);
      if (examSnap.exists()) {
        batch.delete(examRef);
      }
      batch.update(doc(db, 'vaults', VAULT_ID), {
        examIds: vault.examIds.filter((id) => id !== examId),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        buildFirestoreErrorInfo(err, 'delete', `vaults/${VAULT_ID}/exams/${examId}`);
        throw err;
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ลบชุดข้อสอบไม่สำเร็จ',
      });
    }
  });

  // Submit Exam Answers & Persist Submission in Cloud Firestore
  router.post('/submissions', async (req, res) => {
    try {
      const { examId, studentName, studentCode, answers } = req.body || {};

      const cleanName = String(studentName || '').trim().slice(0, 200);
      const cleanCode = String(studentCode || '').trim();

      if (!cleanName) {
        res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลของนักเรียน' });
        return;
      }
      if (!/^\d{5}$/.test(cleanCode)) {
        res.status(400).json({ error: 'เลขประจำตัวนักเรียนต้องเป็นตัวเลข 5 หลักเท่านั้น' });
        return;
      }
      if (!examId || typeof examId !== 'string') {
        res.status(400).json({ error: 'ไม่พบชุดข้อสอบที่เลือก' });
        return;
      }

      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const examSnap = await getDoc(doc(db, 'vaults', VAULT_ID, 'exams', examId));
      if (!examSnap.exists()) {
        res.status(404).json({ error: 'ไม่พบชุดข้อสอบที่เลือก' });
        return;
      }

      const exam = examSnap.data();
      const today = getBangkokTodayDate();
      if (exam.publishDate > today) {
        res.status(403).json({
          error: `ชุดข้อสอบนี้ยังไม่ได้เปิดให้เข้าสอบ (กำหนดเผยแพร่วันที่ ${exam.publishDate})`,
        });
        return;
      }

      const questionsList = Array.isArray(exam.questions) ? exam.questions : [];
      let score = 0;
      const answerMap = answers || {};
      for (const q of questionsList) {
        if (typeof answerMap[q.id] === 'number' && answerMap[q.id] === q.correctIndex) {
          score += 1;
        }
      }

      const totalQuestions = questionsList.length;
      const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
      const passed = percentage >= 80;
      const submittedAt = new Date().toISOString();
      const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
      const certificateNo = passed ? `CERT-${new Date().getFullYear()}-${randomSuffix}` : '';

      let webhookSynced = false;
      if (vault.appsScriptWebhookUrl) {
        webhookSynced = await forwardToAppsScript(vault.appsScriptWebhookUrl, {
          submittedAt,
          studentCode: cleanCode,
          studentName: cleanName,
          examTitle: exam.title,
          score: `${score}/${totalQuestions}`,
          percentage,
          status: passed ? 'ผ่าน' : 'ไม่ผ่าน',
          certificateNo: certificateNo || '-',
        });
      }

      const submissionId = `sub-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const normalizedConfig = normalizeCertConfig(exam.certificateConfig);

      const submissionDoc = {
        id: submissionId,
        examId: exam.id,
        examTitle: String(exam.title).slice(0, 300),
        certificatePublishDate: exam.certificatePublishDate,
        templateId: exam.templateId,
        certificateConfig: normalizedConfig,
        studentName: cleanName,
        studentCode: cleanCode,
        score,
        totalQuestions,
        percentage,
        passed,
        statusText: passed ? 'ผ่าน' : 'ไม่ผ่าน',
        certificateNo,
        submittedAt,
        sheetSynced: false,
        webhookSynced,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'vaults', VAULT_ID, 'submissions', submissionId), submissionDoc);
      batch.update(doc(db, 'vaults', VAULT_ID), {
        submissionIds: [submissionId, ...vault.submissionIds].slice(0, 5000),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        buildFirestoreErrorInfo(err, 'create', `vaults/${VAULT_ID}/submissions/${submissionId}`);
        throw err;
      }

      const certificateTemplate = await loadTemplateDataUrl(db, exam.templateId);

      res.status(201).json({
        submission: {
          id: submissionId,
          examId: exam.id,
          examTitle: exam.title,
          certificatePublishDate: exam.certificatePublishDate,
          certificateTemplate,
          certificateConfig: normalizedConfig,
          studentName: cleanName,
          studentCode: cleanCode,
          score,
          totalQuestions,
          percentage,
          passed,
          statusText: passed ? 'ผ่าน' : 'ไม่ผ่าน',
          certificateNo: certificateNo || null,
          submittedAt,
          sheetSynced: false,
          webhookSynced,
        },
        settings: {
          spreadsheetId: vault.spreadsheetId,
          sheetTabName: vault.sheetTabName,
          spreadsheetUrl: vault.spreadsheetUrl,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถบันทึกผลการสอบได้',
      });
    }
  });

  // Update Student Name during Certificate Pre-Download Verification
  router.patch('/submissions/:id/student-name', async (req, res) => {
    try {
      const submissionId = req.params.id;
      const { studentName, studentCode } = req.body || {};
      const cleanName = String(studentName || '').trim().slice(0, 200);
      if (!cleanName) {
        res.status(400).json({ error: 'กรุณาระบุชื่อ-นามสกุลให้ถูกต้อง' });
        return;
      }

      const db = getServerDb();
      const subRef = doc(db, 'vaults', VAULT_ID, 'submissions', submissionId);
      const subSnap = await getDoc(subRef);
      if (!subSnap.exists()) {
        res.status(404).json({ error: 'ไม่พบข้อมูลการสอบ' });
        return;
      }

      const sub = subSnap.data();
      const isAdmin = isAdminAuthorized(req);
      if (!isAdmin && sub.studentCode !== String(studentCode || '').trim()) {
        res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลรายการนี้' });
        return;
      }

      try {
        await updateDoc(subRef, {
          studentName: cleanName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        buildFirestoreErrorInfo(err, 'update', `vaults/${VAULT_ID}/submissions/${submissionId}`);
        throw err;
      }

      const certificateTemplate = await loadTemplateDataUrl(db, sub.templateId);
      res.json({
        ok: true,
        submission: {
          id: sub.id,
          examId: sub.examId,
          examTitle: sub.examTitle,
          certificatePublishDate: sub.certificatePublishDate,
          certificateTemplate,
          certificateConfig: normalizeCertConfig(sub.certificateConfig),
          studentName: cleanName,
          studentCode: sub.studentCode,
          score: sub.score,
          totalQuestions: sub.totalQuestions,
          percentage: sub.percentage,
          passed: sub.passed,
          statusText: sub.statusText,
          certificateNo: sub.certificateNo || null,
          submittedAt: sub.submittedAt,
          sheetSynced: sub.sheetSynced,
          webhookSynced: sub.webhookSynced,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถอัปเดตชื่อ-นามสกุลได้',
      });
    }
  });

  // Mark submissions as synced to Google Sheets
  router.post('/submissions/mark-synced', async (req, res) => {
    try {
      const { submissionIds } = req.body || {};
      if (!Array.isArray(submissionIds)) {
        res.status(400).json({ error: 'รายการไม่ถูกต้อง' });
        return;
      }

      const db = getServerDb();
      await Promise.all(
        submissionIds.slice(0, 500).map((sid) =>
          updateDoc(doc(db, 'vaults', VAULT_ID, 'submissions', String(sid)), {
            sheetSynced: true,
            updatedAt: serverTimestamp(),
          }).catch(() => null)
        )
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'อัปเดตสถานะซิงค์ไม่สำเร็จ',
      });
    }
  });

  // Get Submissions from Cloud Firestore
  router.get('/submissions', async (req, res) => {
    try {
      const studentCode = String(req.query.studentCode || '').trim();
      const isAdmin = isAdminAuthorized(req);

      if (!isAdmin && !studentCode) {
        res.json({ submissions: [] });
        return;
      }

      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      if (vault.submissionIds.length === 0) {
        res.json({ submissions: [] });
        return;
      }

      const snaps = await Promise.all(
        vault.submissionIds.map((sid) =>
          getDoc(doc(db, 'vaults', VAULT_ID, 'submissions', sid))
        )
      );
      let rawSubs = snaps.filter((s) => s.exists()).map((s) => s.data());
      if (studentCode) {
        rawSubs = rawSubs.filter((s) => s.studentCode === studentCode);
      }

      const uniqueTemplateIds = Array.from(
        new Set(rawSubs.map((s) => s.templateId).filter(Boolean))
      );
      const tplEntries = await Promise.all(
        uniqueTemplateIds.map(async (tid) => [tid, await loadTemplateDataUrl(db, tid)])
      );
      const tplMap = new Map(tplEntries);

      const submissions = rawSubs.map((sub) => ({
        id: sub.id,
        examId: sub.examId,
        examTitle: sub.examTitle,
        certificatePublishDate: sub.certificatePublishDate,
        certificateTemplate: tplMap.get(sub.templateId) || BLANK_CERT_FRAME_SVG,
        certificateConfig: normalizeCertConfig(sub.certificateConfig),
        studentName: sub.studentName,
        studentCode: sub.studentCode,
        score: sub.score,
        totalQuestions: sub.totalQuestions,
        percentage: sub.percentage,
        passed: sub.passed,
        statusText: sub.statusText,
        certificateNo: sub.certificateNo || null,
        submittedAt: sub.submittedAt,
        sheetSynced: Boolean(sub.sheetSynced),
        webhookSynced: Boolean(sub.webhookSynced),
      }));

      res.json({ submissions });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถดึงประวัติการสอบได้',
      });
    }
  });

  // Integration Settings from Cloud Firestore
  router.get('/settings', async (_req, res) => {
    try {
      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      res.json({
        settings: {
          spreadsheetId: vault.spreadsheetId,
          spreadsheetUrl: vault.spreadsheetUrl,
          spreadsheetTitle: vault.spreadsheetTitle,
          sheetTabName: vault.sheetTabName,
          appsScriptWebhookUrl: vault.appsScriptWebhookUrl,
        },
        stats: {
          totalExams: vault.examIds.length,
          totalSubmissions: vault.submissionIds.length,
          passedCount: 0,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถดึงการตั้งค่าระบบได้',
      });
    }
  });

  router.put('/settings', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    try {
      const db = getServerDb();
      const vault = await ensureVaultIndex(db);
      const body = req.body || {};

      const nextSettings = {
        spreadsheetId:
          typeof body.spreadsheetId === 'string'
            ? body.spreadsheetId.trim().slice(0, 200)
            : vault.spreadsheetId,
        spreadsheetUrl:
          typeof body.spreadsheetUrl === 'string'
            ? body.spreadsheetUrl.trim().slice(0, 500)
            : vault.spreadsheetUrl,
        spreadsheetTitle:
          typeof body.spreadsheetTitle === 'string'
            ? body.spreadsheetTitle.trim().slice(0, 300)
            : vault.spreadsheetTitle,
        sheetTabName:
          typeof body.sheetTabName === 'string'
            ? body.sheetTabName.trim().slice(0, 200)
            : vault.sheetTabName,
        appsScriptWebhookUrl:
          typeof body.appsScriptWebhookUrl === 'string'
            ? body.appsScriptWebhookUrl.trim().slice(0, 600)
            : vault.appsScriptWebhookUrl,
      };

      try {
        await updateDoc(doc(db, 'vaults', VAULT_ID), {
          ...nextSettings,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        buildFirestoreErrorInfo(err, 'update', `vaults/${VAULT_ID}`);
        throw err;
      }

      res.json({ ok: true, settings: nextSettings });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ',
      });
    }
  });

  return router;
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const router = createApiRouter();
  app.use('/api', router);
  app.use('/', router);
  return app;
}

const vercelApp = createApiApp();
export default vercelApp;
