import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SubmissionRecord } from '../types';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Strictly in-memory token cache per workspace-integration guidelines
let cachedAccessToken: string | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogleSheets = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับสิทธิ์เข้าถึง Google Sheets ได้ กรุณาลองใหม่อีกครั้ง');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const signOutGoogleSheets = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

const SHEET_HEADERS = [
  'วันที่-เวลาส่งข้อสอบ',
  'คำนำหน้าชื่อ',
  'ชื่อ-นามสกุล',
  'ตำแหน่ง/สถานะ',
  'ชุดข้อสอบ',
  'คะแนนที่ได้',
  'คิดเป็นร้อยละ (%)',
  'สถานะการประเมิน',
  'เลขที่เกียรติบัตร',
];

function formatSubmissionRow(sub: SubmissionRecord): (string | number)[] {
  const formattedDate = new Date(sub.submittedAt).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return [
    formattedDate,
    sub.prefix || '-',
    sub.nameBody || sub.studentName,
    sub.memberRole || '-',
    sub.examTitle,
    `${sub.score}/${sub.totalQuestions}`,
    sub.percentage,
    sub.statusText,
    sub.certificateNo || '-',
  ];
}

export async function createExamSpreadsheet(customTitle?: string): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  sheetTabName: string;
}> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('กรุณาลงชื่อเข้าใช้ด้วย Google ก่อนสร้างไฟล์ Google Sheets');
  }

  const spreadsheetTitle =
    (customTitle || '').trim() ||
    `SAPHA SPS — บันทึกผลสอบออนไลน์ (${new Date().toLocaleDateString('th-TH')})`;

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: spreadsheetTitle },
      sheets: [
        {
          properties: {
            title: 'ผลการสอบ',
            gridProperties: { frozenRowCount: 1 },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || 'สร้างไฟล์ Google Sheets ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์การเข้าถึง'
    );
  }

  const data = await createRes.json();
  const spreadsheetId: string = data.spreadsheetId;
  const spreadsheetUrl: string = data.spreadsheetUrl;
  const sheetTabName: string = data.sheets?.[0]?.properties?.title || 'ผลการสอบ';

  // Populate header row
  const range = encodeURIComponent(`'${sheetTabName}'!A1:I1`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [SHEET_HEADERS],
      }),
    }
  );

  return {
    spreadsheetId,
    spreadsheetUrl,
    spreadsheetTitle,
    sheetTabName,
  };
}

export async function inspectExamSpreadsheet(idOrUrl: string): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  sheetTabName: string;
}> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('กรุณาลงชื่อเข้าใช้ด้วย Google ก่อนเชื่อมต่อไฟล์ Google Sheets');
  }

  const spreadsheetId = extractSpreadsheetId(idOrUrl);
  if (!spreadsheetId) {
    throw new Error('กรุณาระบุ URL หรือ Spreadsheet ID ที่ถูกต้อง');
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || 'ไม่พบไฟล์ Google Sheets หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึงไฟล์ดังกล่าว'
    );
  }

  const data = await res.json();
  const sheetTabName: string = data.sheets?.[0]?.properties?.title || 'Sheet1';
  const spreadsheetTitle: string = data.properties?.title || 'Google Sheets';
  const spreadsheetUrl: string =
    data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    spreadsheetId,
    spreadsheetUrl,
    spreadsheetTitle,
    sheetTabName,
  };
}

export async function appendSubmissionToSheet(
  spreadsheetId: string,
  sheetTabName: string,
  submission: SubmissionRecord
): Promise<boolean> {
  const token = getAccessToken();
  if (!token || !spreadsheetId) {
    return false;
  }

  let targetTab = sheetTabName;
  if (!targetTab) {
    const meta = await inspectExamSpreadsheet(spreadsheetId);
    targetTab = meta.sheetTabName;
  }

  const range = encodeURIComponent(`'${targetTab}'!A:I`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [formatSubmissionRow(submission)],
      }),
    }
  );

  return res.ok;
}

export async function syncAllSubmissionsToSheet(
  spreadsheetId: string,
  sheetTabName: string,
  submissions: SubmissionRecord[]
): Promise<{ updatedRows: number }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('เซสชัน Google หมดอายุ กรุณาลงชื่อเข้าใช้ด้วย Google อีกครั้ง');
  }

  let targetTab = sheetTabName;
  if (!targetTab) {
    const meta = await inspectExamSpreadsheet(spreadsheetId);
    targetTab = meta.sheetTabName;
  }

  const ordered = [...submissions].reverse();
  const values = [SHEET_HEADERS, ...ordered.map(formatSubmissionRow)];
  const range = encodeURIComponent(`'${targetTab}'!A1:I${values.length}`);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || 'อัปเดตข้อมูลไปยัง Google Sheets ไม่สำเร็จ'
    );
  }

  return { updatedRows: ordered.length };
}

export const APPS_SCRIPT_CODE_TEMPLATE = `// วิธีติดตั้ง Google Apps Script (ทางเลือกเสริมสำหรับบันทึกอัตโนมัติโดยไม่ต้องล็อกอิน Google):
// 1. เปิดไฟล์ Google Sheets ของคุณ -> เมนู ส่วนขยาย (Extensions) -> Apps Script
// 2. วางโค้ดด้านล่างนี้แทนที่โค้ดเดิม แล้วกดบันทึก
// 3. กด "การทำให้ใช้งานได้" (Deploy) -> "การทำให้ใช้งานได้รายการใหม่" (New deployment)
// 4. เลือกประเภทเป็น "เว็บแอป" (Web app) | ผู้มีสิทธิ์เข้าถึง: "ทุกคน" (Anyone)
// 5. คัดลอก Web App URL มาวางในช่อง Google Apps Script Webhook URL ในหน้าแอดมิน

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "วันที่-เวลา",
      "คำนำหน้าชื่อ",
      "ชื่อ-นามสกุล",
      "ตำแหน่ง/สถานะ",
      "ชุดข้อสอบ",
      "คะแนนที่ได้",
      "ร้อยละ (%)",
      "สถานะ",
      "เลขที่เกียรติบัตร"
    ]);
  }
  var body = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date(body.submittedAt || new Date()),
    body.prefix || "-",
    body.nameBody || body.studentName,
    body.memberRole || "-",
    body.examTitle,
    body.score,
    body.percentage,
    body.status,
    body.certificateNo
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
