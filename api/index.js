import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_DATA_DIR = path.resolve(__dirname, '..', 'data');
const REPO_STORE_PATH = path.join(REPO_DATA_DIR, 'store.json');
const TMP_STORE_PATH = path.join(os.tmpdir(), 'sapha-sps-store.json');
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const ADMIN_USER = '00000';
const ADMIN_PASS = '00000';
const ADMIN_TOKEN = 'SAPHA SPS-admin-00000';

/** @type {{ exams: any[]; submissions: any[]; settings: any } | null} */
let memoryStoreCache = null;

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
 * @returns {string}
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

const SEED_EXAMS = [
  {
    id: 'exam-digital-literacy-101',
    title: 'แบบทดสอบวัดสมรรถนะด้านเทคโนโลยีดิจิทัลและวิทยาการคำนวณ',
    description:
      'ประเมินความรู้พื้นฐานด้านอัลกอริทึม เครือข่ายอินเทอร์เน็ต และการใช้เทคโนโลยีสารสนเทศอย่างปลอดภัย (เกณฑ์ผ่าน 80%)',
    passingPercent: 80,
    publishDate: '2026-10-01',
    certificatePublishDate: '2026-10-01',
    certificateTemplate: BLANK_CERT_FRAME_SVG,
    certificateConfig: { ...DEFAULT_CERT_CONFIG },
    createdAt: '2026-10-01T08:00:00.000Z',
    questions: [
      {
        id: 'q-1',
        text: 'แนวคิดเชิงคำนวณ (Computational Thinking) ข้อใดหมายถึงการแบ่งปัญหาใหญ่ออกเป็นปัญหาย่อย ๆ เพื่อให้จัดการได้ง่ายขึ้น?',
        options: [
          'การแยกส่วนประกอบและการย่อยปัญหา (Decomposition)',
          'การหารูปแบบของปัญหา (Pattern Recognition)',
          'การคิดเชิงนามธรรม (Abstraction)',
          'การออกแบบขั้นตอนวิธี (Algorithm Design)',
        ],
        correctIndex: 0,
      },
      {
        id: 'q-2',
        text: 'โปรโตคอลใดทำหน้าที่เข้ารหัสข้อมูลระหว่างเว็บเบราว์เซอร์และเซิร์ฟเวอร์เพื่อความปลอดภัยในการรับส่งข้อมูล?',
        options: ['HTTP', 'HTTPS', 'FTP', 'SMTP'],
        correctIndex: 1,
      },
      {
        id: 'q-3',
        text: 'ข้อใดคือลักษณะของการโจมตีแบบฟิชชิง (Phishing) ที่ควรระมัดระวังมากที่สุด?',
        options: [
          'การอัปเดตระบบปฏิบัติการอัตโนมัติจากผู้ผลิต',
          'การสำรองข้อมูลขึ้นระบบคลาวด์ส่วนตัว',
          'การส่งอีเมลหรือลิงก์ปลอมแอบอ้างเป็นหน่วยงานเพื่อหลอกขอรหัสผ่าน',
          'การตั้งค่าการยืนยันตัวตนแบบสองชั้น (2FA)',
        ],
        correctIndex: 2,
      },
      {
        id: 'q-4',
        text: 'ใน Google Sheets หากต้องการหาค่าเฉลี่ยของคะแนนนักเรียนตั้งแต่เซลล์ C2 ถึง C30 ต้องใช้สูตรใด?',
        options: ['=SUM(C2:C30)', '=COUNT(C2:C30)', '=MAX(C2:C30)', '=AVERAGE(C2:C30)'],
        correctIndex: 3,
      },
      {
        id: 'q-5',
        text: 'รหัสผ่านในข้อใดมีความปลอดภัยสูงที่สุดตามหลักความมั่นคงปลอดภัยทางไซเบอร์?',
        options: ['12345678', 'password2026', 'Tr#9kL!29vQm$4z', '0812345678'],
        correctIndex: 2,
      },
    ],
  },
  {
    id: 'exam-ai-ethics-202',
    title: 'แบบทดสอบความฉลาดรู้ทางดิจิทัลและจริยธรรมปัญญาประดิษฐ์',
    description:
      'วัดความเข้าใจเกี่ยวกับกฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ลิขสิทธิ์ดิจิทัล และการใช้งานเทคโนโลยีอย่างมีความรับผิดชอบ',
    passingPercent: 80,
    publishDate: '2026-10-15',
    certificatePublishDate: '2026-10-15',
    certificateTemplate: BLANK_CERT_FRAME_SVG,
    certificateConfig: { ...DEFAULT_CERT_CONFIG },
    createdAt: '2026-10-15T09:30:00.000Z',
    questions: [
      {
        id: 'q-201',
        text: 'ข้อใดจัดเป็น "ข้อมูลส่วนบุคคล" ตามพระราชบัญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)?',
        options: [
          'จำนวนจังหวัดทั้งหมดในประเทศไทย',
          'ชื่อ-นามสกุล และเลขประจำตัวประชาชนที่ระบุตัวบุคคลได้',
          'สถิติอุณหภูมิเฉลี่ยรายเดือนของกรมอุตุนิยมวิทยา',
          'ราคาสินค้าในแคตตาล็อกสาธารณะของร้านค้า',
        ],
        correctIndex: 1,
      },
      {
        id: 'q-202',
        text: 'สัญญาอนุญาต Creative Commons แบบ "CC BY" อนุญาตให้ผู้อื่นนำผลงานไปใช้ได้ภายใต้เงื่อนไขใด?',
        options: [
          'ห้ามนำไปดัดแปลงหรือเผยแพร่ในทุกกรณี',
          'ต้องจ่ายค่าลิขสิทธิ์ก่อนเปิดอ่านทุกครั้ง',
          'นำไปใช้และเผยแพร่ได้โดยต้องระบุชื่อเจ้าของผลงาน (Attribution)',
          'ใช้ได้เฉพาะในเครือข่ายอินทราเน็ตภายในองค์กรเท่านั้น',
        ],
        correctIndex: 2,
      },
      {
        id: 'q-203',
        text: 'เมื่อได้รับข่าวสารที่ชวนตื่นตระหนกในสื่อสังคมออนไลน์ แนวปฏิบัติข้อใดถูกต้องที่สุดก่อนกดแชร์?',
        options: [
          'รีบส่งต่อให้เพื่อนทันทีเพื่อเตือนภัยให้เร็วที่สุด',
          'ตรวจสอบแหล่งที่มาที่น่าเชื่อถือและเทียบเคียงข้อมูลจากหลายแหล่ง',
          'ดูจากยอดกดถูกใจ หากมียอดสูงแสดงว่าเป็นเรื่องจริงเสมอ',
          'คัดลอกข้อความไปโพสต์ใหม่โดยเป็นชื่อของตนเอง',
        ],
        correctIndex: 1,
      },
      {
        id: 'q-204',
        text: 'การยืนยันตัวตนแบบสองปัจจัย (Two-Factor Authentication: 2FA) ช่วยเพิ่มความปลอดภัยได้อย่างไร?',
        options: [
          'ทำให้ไม่ต้องจำรหัสผ่านอีกต่อไป',
          'ช่วยเพิ่มความเร็วของสัญญาณอินเทอร์เน็ตเป็นสองเท่า',
          'ต้องใช้ทั้งรหัสผ่านและรหัสยืนยันจากอุปกรณ์อีกชิ้นหนึ่งก่อนเข้าถึงบัญชี',
          'ลบประวัติการเข้าชมเว็บไซต์โดยอัตโนมัติทุกชั่วโมง',
        ],
        correctIndex: 2,
      },
      {
        id: 'q-205',
        text: 'ร่องรอยทางดิจิทัล (Digital Footprint) หมายถึงข้อใด?',
        options: [
          'ข้อมูลและประวัติการกระทำต่าง ๆ ของผู้ใช้ที่ถูกบันทึกไว้บนโลกออนไลน์',
          'ขนาดความจุของหน่วยความจำหลักในสมาร์ตโฟน',
          'ความละเอียดของหน้าจอแสดงผลแบบพิกเซล',
          'หมายเลขรุ่นของการ์ดเครือข่ายไร้สาย',
        ],
        correctIndex: 0,
      },
    ],
  },
];

/**
 * @param {Record<string, any> | undefined} cfg
 */
function normalizeCertConfig(cfg) {
  return {
    textColor:
      typeof cfg?.textColor === 'string' && cfg.textColor
        ? cfg.textColor
        : DEFAULT_CERT_CONFIG.textColor,
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

function createDefaultStore() {
  return {
    exams: structuredClone(SEED_EXAMS),
    submissions: [],
    settings: {
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      sheetTabName: '',
      appsScriptWebhookUrl: process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL || '',
    },
  };
}

/**
 * @param {any} parsed
 * @param {string} today
 */
function normalizeParsedStore(parsed, today) {
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultStore();
  }
  if (!Array.isArray(parsed.exams)) {
    parsed.exams = structuredClone(SEED_EXAMS);
  } else {
    parsed.exams = parsed.exams.map((ex) => {
      const pubDate = normalizeDateString(ex.publishDate, normalizeDateString(ex.createdAt, today));
      const certPubDate = normalizeDateString(ex.certificatePublishDate, pubDate);
      return {
        ...ex,
        publishDate: pubDate,
        certificatePublishDate: certPubDate,
        certificateTemplate: ex.certificateTemplate || BLANK_CERT_FRAME_SVG,
        certificateConfig: normalizeCertConfig(ex.certificateConfig),
      };
    });
  }

  const examMap = new Map(parsed.exams.map((e) => [e.id, e]));

  if (!Array.isArray(parsed.submissions)) {
    parsed.submissions = [];
  } else {
    parsed.submissions = parsed.submissions.map((sub) => {
      const linkedExam = examMap.get(sub.examId);
      const fallbackDate = linkedExam
        ? linkedExam.certificatePublishDate
        : normalizeDateString(sub.submittedAt, today);
      return {
        ...sub,
        certificatePublishDate: normalizeDateString(sub.certificatePublishDate, fallbackDate),
        certificateTemplate: sub.certificateTemplate || BLANK_CERT_FRAME_SVG,
        certificateConfig: normalizeCertConfig(sub.certificateConfig),
      };
    });
  }

  if (!parsed.settings) {
    parsed.settings = {
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      sheetTabName: '',
      appsScriptWebhookUrl: process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL || '',
    };
  }
  return parsed;
}

function ensureStore() {
  const today = getBangkokTodayDate();

  if (IS_SERVERLESS) {
    try {
      if (fs.existsSync(TMP_STORE_PATH)) {
        const rawTmp = fs.readFileSync(TMP_STORE_PATH, 'utf-8');
        const store = normalizeParsedStore(JSON.parse(rawTmp), today);
        memoryStoreCache = store;
        return store;
      }
      if (fs.existsSync(REPO_STORE_PATH)) {
        const rawRepo = fs.readFileSync(REPO_STORE_PATH, 'utf-8');
        const store = normalizeParsedStore(JSON.parse(rawRepo), today);
        try {
          fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
        } catch {
          // Ignore write error on read-only tmp edge cases
        }
        memoryStoreCache = store;
        return store;
      }
    } catch {
      if (memoryStoreCache) return memoryStoreCache;
    }

    if (memoryStoreCache) return memoryStoreCache;
    const initial = createDefaultStore();
    try {
      fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    } catch {
      // Fallback to memoryStoreCache
    }
    memoryStoreCache = initial;
    return initial;
  }

  try {
    if (!fs.existsSync(REPO_DATA_DIR)) {
      fs.mkdirSync(REPO_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(REPO_STORE_PATH)) {
      const initial = createDefaultStore();
      fs.writeFileSync(REPO_STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
      memoryStoreCache = initial;
      return initial;
    }
    const raw = fs.readFileSync(REPO_STORE_PATH, 'utf-8');
    const store = normalizeParsedStore(JSON.parse(raw), today);
    memoryStoreCache = store;
    return store;
  } catch {
    if (memoryStoreCache) return memoryStoreCache;
    const fallback = createDefaultStore();
    memoryStoreCache = fallback;
    return fallback;
  }
}

/**
 * @param {any} store
 */
function saveStore(store) {
  memoryStoreCache = store;
  const serialized = JSON.stringify(store, null, 2);

  if (IS_SERVERLESS) {
    try {
      fs.writeFileSync(TMP_STORE_PATH, serialized, 'utf-8');
    } catch {
      // Keep memoryStoreCache updated
    }
    return;
  }

  try {
    if (!fs.existsSync(REPO_DATA_DIR)) {
      fs.mkdirSync(REPO_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REPO_STORE_PATH, serialized, 'utf-8');
  } catch {
    try {
      fs.writeFileSync(TMP_STORE_PATH, serialized, 'utf-8');
    } catch {
      // Keep memoryStoreCache updated
    }
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
    res.json({ ok: true, serverless: IS_SERVERLESS });
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

  // List Exam Sets
  router.get('/exams', (req, res) => {
    const store = ensureStore();
    const isAdmin = isAdminAuthorized(req);
    const today = getBangkokTodayDate();

    const exams = store.exams.map((exam) => {
      const isPublished = exam.publishDate <= today;
      return {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        passingPercent: exam.passingPercent,
        publishDate: exam.publishDate,
        certificatePublishDate: exam.certificatePublishDate,
        isPublished,
        certificateTemplate: exam.certificateTemplate,
        certificateConfig: exam.certificateConfig,
        createdAt: exam.createdAt,
        questionCount: exam.questions.length,
        questions:
          isAdmin || isPublished
            ? exam.questions.map((q) => ({
                id: q.id,
                text: q.text,
                options: q.options,
                ...(isAdmin ? { correctIndex: q.correctIndex } : {}),
              }))
            : [],
      };
    });

    res.json({ exams, serverToday: today });
  });

  // Create New Exam Set with Scheduled Publish Date & Certificate Publish Date (Admin Only)
  router.post('/exams', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }

    const {
      title,
      description,
      publishDate,
      certificatePublishDate,
      certificateTemplate,
      certificateConfig,
      questions,
    } = req.body || {};

    if (!title?.trim()) {
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

    const today = getBangkokTodayDate();
    const resolvedPublishDate = normalizeDateString(publishDate, today);
    const resolvedCertDate = normalizeDateString(certificatePublishDate, resolvedPublishDate);

    const store = ensureStore();
    const newExam = {
      id: `exam-${Date.now().toString(36)}`,
      title: String(title).trim(),
      description: String(
        description || 'แบบทดสอบออนไลน์ประเมินความรู้ เกณฑ์ผ่านร้อยละ 80 ขึ้นไป'
      ).trim(),
      passingPercent: 80,
      publishDate: resolvedPublishDate,
      certificatePublishDate: resolvedCertDate,
      certificateTemplate,
      certificateConfig: normalizeCertConfig(certificateConfig),
      createdAt: new Date().toISOString(),
      questions: questions.map((q, idx) => ({
        id: `q-${Date.now().toString(36)}-${idx + 1}`,
        text: String(q.text).trim(),
        options: [
          String(q.options[0]).trim(),
          String(q.options[1]).trim(),
          String(q.options[2]).trim(),
          String(q.options[3]).trim(),
        ],
        correctIndex: q.correctIndex,
      })),
    };

    store.exams.unshift(newExam);
    saveStore(store);

    res.status(201).json({
      exam: {
        ...newExam,
        isPublished: newExam.publishDate <= today,
        questionCount: newExam.questions.length,
      },
    });
  });

  // Update Schedule & Certificate Settings of Existing Exam (Admin Only)
  router.put('/exams/:id/certificate', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }
    const { publishDate, certificatePublishDate, certificateTemplate, certificateConfig } =
      req.body || {};

    const store = ensureStore();
    const exam = store.exams.find((e) => e.id === req.params.id);
    if (!exam) {
      res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
      return;
    }

    if (publishDate) {
      exam.publishDate = normalizeDateString(publishDate, exam.publishDate);
    }
    if (certificatePublishDate) {
      exam.certificatePublishDate = normalizeDateString(
        certificatePublishDate,
        exam.certificatePublishDate
      );
    }
    if (certificateTemplate && String(certificateTemplate).startsWith('data:image/')) {
      exam.certificateTemplate = certificateTemplate;
    }
    if (certificateConfig) {
      exam.certificateConfig = normalizeCertConfig({
        ...exam.certificateConfig,
        ...certificateConfig,
      });
    }

    for (const sub of store.submissions) {
      if (sub.examId === exam.id) {
        sub.certificatePublishDate = exam.certificatePublishDate;
        sub.certificateTemplate = exam.certificateTemplate;
        sub.certificateConfig = exam.certificateConfig;
      }
    }

    saveStore(store);
    res.json({ ok: true, exam });
  });

  // Delete Exam Set (Admin Only)
  router.delete('/exams/:id', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }
    const store = ensureStore();
    const before = store.exams.length;
    store.exams = store.exams.filter((e) => e.id !== req.params.id);
    if (store.exams.length === before) {
      res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
      return;
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // Submit Exam Answers & Grade Automatically (>= 80% Pass)
  router.post('/submissions', async (req, res) => {
    const { examId, studentName, studentCode, answers } = req.body || {};

    const cleanName = String(studentName || '').trim();
    const cleanCode = String(studentCode || '').trim();

    if (!cleanName) {
      res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลของนักเรียน' });
      return;
    }
    if (!/^\d{5}$/.test(cleanCode)) {
      res.status(400).json({ error: 'เลขประจำตัวนักเรียนต้องเป็นตัวเลข 5 หลักเท่านั้น' });
      return;
    }

    const store = ensureStore();
    const exam = store.exams.find((e) => e.id === examId);
    if (!exam) {
      res.status(404).json({ error: 'ไม่พบชุดข้อสอบที่เลือก' });
      return;
    }

    const today = getBangkokTodayDate();
    if (exam.publishDate > today) {
      res.status(403).json({
        error: `ชุดข้อสอบนี้ยังไม่ได้เปิดให้เข้าสอบ (กำหนดเผยแพร่วันที่ ${exam.publishDate})`,
      });
      return;
    }

    let score = 0;
    const answerMap = answers || {};
    for (const q of exam.questions) {
      if (typeof answerMap[q.id] === 'number' && answerMap[q.id] === q.correctIndex) {
        score += 1;
      }
    }

    const totalQuestions = exam.questions.length;
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const passed = percentage >= 80;
    const submittedAt = new Date().toISOString();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
    const certificateNo = passed ? `CERT-${new Date().getFullYear()}-${randomSuffix}` : null;

    let webhookSynced = false;
    if (store.settings.appsScriptWebhookUrl) {
      webhookSynced = await forwardToAppsScript(store.settings.appsScriptWebhookUrl, {
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

    const submission = {
      id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      examId: exam.id,
      examTitle: exam.title,
      certificatePublishDate: exam.certificatePublishDate,
      certificateTemplate: exam.certificateTemplate,
      certificateConfig: exam.certificateConfig,
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
    };

    store.submissions.unshift(submission);
    saveStore(store);

    res.status(201).json({
      submission,
      settings: {
        spreadsheetId: store.settings.spreadsheetId,
        sheetTabName: store.settings.sheetTabName,
        spreadsheetUrl: store.settings.spreadsheetUrl,
      },
    });
  });

  // Update Student Name during Certificate Pre-Download Verification
  router.patch('/submissions/:id/student-name', (req, res) => {
    const { studentName, studentCode } = req.body || {};
    const cleanName = String(studentName || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'กรุณาระบุชื่อ-นามสกุลให้ถูกต้อง' });
      return;
    }

    const store = ensureStore();
    const sub = store.submissions.find((s) => s.id === req.params.id);
    if (!sub) {
      res.status(404).json({ error: 'ไม่พบข้อมูลการสอบ' });
      return;
    }

    const isAdmin = isAdminAuthorized(req);
    if (!isAdmin && sub.studentCode !== String(studentCode || '').trim()) {
      res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลรายการนี้' });
      return;
    }

    sub.studentName = cleanName;
    saveStore(store);
    res.json({ ok: true, submission: sub });
  });

  // Mark submissions as synced to Google Sheets
  router.post('/submissions/mark-synced', (req, res) => {
    const { submissionIds } = req.body || {};
    if (!Array.isArray(submissionIds)) {
      res.status(400).json({ error: 'รายการไม่ถูกต้อง' });
      return;
    }
    const idSet = new Set(submissionIds);
    const store = ensureStore();
    for (const sub of store.submissions) {
      if (idSet.has(sub.id)) {
        sub.sheetSynced = true;
      }
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // Get Submissions
  router.get('/submissions', (req, res) => {
    const store = ensureStore();
    const studentCode = String(req.query.studentCode || '').trim();
    const isAdmin = isAdminAuthorized(req);

    if (isAdmin && !studentCode) {
      res.json({ submissions: store.submissions });
      return;
    }

    if (studentCode) {
      const matched = store.submissions.filter((s) => s.studentCode === studentCode);
      res.json({ submissions: matched });
      return;
    }

    res.json({ submissions: [] });
  });

  // Integration Settings
  router.get('/settings', (_req, res) => {
    const store = ensureStore();
    res.json({
      settings: store.settings,
      stats: {
        totalExams: store.exams.length,
        totalSubmissions: store.submissions.length,
        passedCount: store.submissions.filter((s) => s.passed).length,
      },
    });
  });

  router.put('/settings', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
      return;
    }
    const store = ensureStore();
    const body = req.body || {};
    store.settings = {
      spreadsheetId:
        typeof body.spreadsheetId === 'string'
          ? body.spreadsheetId.trim()
          : store.settings.spreadsheetId,
      spreadsheetUrl:
        typeof body.spreadsheetUrl === 'string'
          ? body.spreadsheetUrl.trim()
          : store.settings.spreadsheetUrl,
      spreadsheetTitle:
        typeof body.spreadsheetTitle === 'string'
          ? body.spreadsheetTitle.trim()
          : store.settings.spreadsheetTitle,
      sheetTabName:
        typeof body.sheetTabName === 'string'
          ? body.sheetTabName.trim()
          : store.settings.sheetTabName,
      appsScriptWebhookUrl:
        typeof body.appsScriptWebhookUrl === 'string'
          ? body.appsScriptWebhookUrl.trim()
          : store.settings.appsScriptWebhookUrl,
    };
    saveStore(store);
    res.json({ ok: true, settings: store.settings });
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
