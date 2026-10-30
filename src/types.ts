export enum ExamDisplayMode {
  STEP_BY_STEP = 'STEP_BY_STEP',
  ALL_AT_ONCE = 'ALL_AT_ONCE',
}

export enum AdminTab {
  EXAMS = 'EXAMS',
  SUBMISSIONS = 'SUBMISSIONS',
  SHEETS = 'SHEETS',
}

export enum StudentTab {
  EXAMS = 'EXAMS',
  HISTORY = 'HISTORY',
}

export type ChoiceLabel = 'ก' | 'ข' | 'ค' | 'ง';

export const CHOICE_LABELS: ChoiceLabel[] = ['ก', 'ข', 'ค', 'ง'];

export interface CertificateLayoutConfig {
  textColor: string;
  nameY: number;          // Percentage from top (5-95)
  examTitleY: number;     // Percentage from top (5-95)
  scoreY: number;         // Percentage from top (5-95)
  dateY: number;          // Percentage from top (5-95)
  nameSize: number;       // Font size on 1131px reference height (20-110)
  examTitleSize: number;  // Font size on 1131px reference height (16-80)
  scoreSize: number;      // Font size on 1131px reference height (14-70)
  dateSize: number;       // Font size on 1131px reference height (14-65)
}

export const DEFAULT_CERTIFICATE_CONFIG: CertificateLayoutConfig = {
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

export interface ExamQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex?: number;
}

export interface ExamSet {
  id: string;
  title: string;
  description: string;
  passingPercent: number;
  publishDate: string;            // YYYY-MM-DD (วันที่เผยแพร่ข้อสอบ และเปิดให้ดาวน์โหลดเกียรติบัตร)
  certificatePublishDate: string; // YYYY-MM-DD (วันที่ที่ลงไว้สำหรับแสดงบนใบเกียรติบัตร)
  isPublished: boolean;
  certificateTemplate: string;
  certificateConfig: CertificateLayoutConfig;
  createdAt: string;
  questionCount: number;
  questions: ExamQuestion[];
}

export interface MemberProfile {
  pin: string;
  prefix: string;
  nameBody: string;
  displayName: string;
  memberRole: string;
}

export interface SubmissionRecord {
  id: string;
  examId: string;
  examTitle: string;
  examPublishDate?: string;       // YYYY-MM-DD (วันเผยแพร่ข้อสอบ ใช้กำหนดสิทธิ์การเปิดดาวน์โหลดเกียรติบัตร)
  certificatePublishDate: string; // YYYY-MM-DD (วันที่ที่ลงไว้สำหรับพิมพ์บนเกียรติบัตร)
  certificateTemplate: string;
  certificateConfig: CertificateLayoutConfig;
  prefix: string;
  nameBody: string;
  studentName: string;
  memberRole: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  statusText: 'ผ่าน' | 'ไม่ผ่าน';
  certificateNo: string | null;
  submittedAt: string;
  sheetSynced: boolean;
  webhookSynced: boolean;
}

export interface IntegrationSettings {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  sheetTabName: string;
  appsScriptWebhookUrl: string;
}
