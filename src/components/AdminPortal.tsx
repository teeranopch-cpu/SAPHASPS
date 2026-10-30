import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  Download,
  AlertCircle,
  Eye,
  X,
  Upload,
  Image as ImageIcon,
  Calendar,
  Pencil,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AdminTab,
  CertificateLayoutConfig,
  CHOICE_LABELS,
  DEFAULT_CERTIFICATE_CONFIG,
  ExamSet,
  IntegrationSettings,
  SubmissionRecord,
} from '../types';
import {
  APPS_SCRIPT_CODE_TEMPLATE,
  createExamSpreadsheet,
  inspectExamSpreadsheet,
  signInWithGoogleSheets,
  signOutGoogleSheets,
  syncAllSubmissionsToSheet,
} from '../services/googleSheetsService';
import {
  formatThaiCeremonialDate,
  formatThaiDisplayDate,
  getBangkokDateString,
  readAndOptimizeTemplateImage,
} from '../utils/certificateRenderer';
import { GoogleSignInButton } from './GoogleSignInButton';
import { CertificateCard, CertificateTemplateLivePreview } from './CertificateCard';
import { parseJsonResponse } from '../utils/apiJson';

interface AdminPortalProps {
  adminToken: string;
  activeTab: AdminTab;
  onChangeTab: (tab: AdminTab) => void;
  googleUser: User | null;
  hasGoogleToken: boolean;
  onGoogleAuthUpdate: (user: User | null, hasToken: boolean) => void;
  integrationSettings: IntegrationSettings;
  onRefreshGlobalData: () => Promise<void>;
}

interface DraftQuestion {
  id?: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
}

const createEmptyQuestion = (): DraftQuestion => ({
  text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
});

export const AdminPortal: React.FC<AdminPortalProps> = ({
  adminToken,
  activeTab,
  onChangeTab,
  googleUser,
  hasGoogleToken,
  onGoogleAuthUpdate,
  integrationSettings,
  onRefreshGlobalData,
}) => {
  const [adminExams, setAdminExams] = useState<ExamSet[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [examSearchFilter, setExamSearchFilter] = useState('');

  // Exam Creator Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPublishDate, setNewPublishDate] = useState(() => getBangkokDateString());
  const [newCertPublishDate, setNewCertPublishDate] = useState(() => getBangkokDateString());
  const [certDateManuallyEdited, setCertDateManuallyEdited] = useState(false);
  const [certTemplateDataUrl, setCertTemplateDataUrl] = useState('');
  const [certFileName, setCertFileName] = useState('');
  const [certConfig, setCertConfig] = useState<CertificateLayoutConfig>({
    ...DEFAULT_CERTIFICATE_CONFIG,
  });
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    createEmptyQuestion(),
  ]);
  const [savingExam, setSavingExam] = useState(false);
  const [examFormMessage, setExamFormMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Edit Existing Exam Title & Content Modal
  const [editingContentExam, setEditingContentExam] = useState<ExamSet | null>(null);
  const [editExamTitle, setEditExamTitle] = useState('');
  const [editExamDescription, setEditExamDescription] = useState('');
  const [editExamPublishDate, setEditExamPublishDate] = useState('');
  const [editExamCertDate, setEditExamCertDate] = useState('');
  const [editExamQuestions, setEditExamQuestions] = useState<DraftQuestion[]>([]);
  const [savingEditContent, setSavingEditContent] = useState(false);
  const [editContentError, setEditContentError] = useState<string | null>(null);

  // Edit Existing Exam Certificate & Schedule Modal
  const [editingCertExam, setEditingCertExam] = useState<ExamSet | null>(null);
  const [editPublishDate, setEditPublishDate] = useState('');
  const [editCertPublishDate, setEditCertPublishDate] = useState('');
  const [editCertDataUrl, setEditCertDataUrl] = useState('');
  const [editCertConfig, setEditCertConfig] = useState<CertificateLayoutConfig>({
    ...DEFAULT_CERTIFICATE_CONFIG,
  });
  const [savingEditCert, setSavingEditCert] = useState(false);

  // Delete Exam Confirmation Modal
  const [examPendingDelete, setExamPendingDelete] = useState<ExamSet | null>(null);

  // Submission Filter & Delete Confirmation Modals
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<
    'all' | 'passed' | 'failed'
  >('all');
  const [submissionPendingDelete, setSubmissionPendingDelete] =
    useState<SubmissionRecord | null>(null);
  const [confirmDeleteAllPassedOpen, setConfirmDeleteAllPassedOpen] = useState(false);
  const [deletingSubmission, setDeletingSubmission] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Certificate Preview Modal from Submissions Table
  const [previewSubmission, setPreviewSubmission] = useState<SubmissionRecord | null>(null);

  // Google Sheets & Apps Script Integration State
  const [sheetInput, setSheetInput] = useState(integrationSettings.spreadsheetUrl || '');
  const [newSheetTitle, setNewSheetTitle] = useState('');
  const [webhookInput, setWebhookInput] = useState(
    integrationSettings.appsScriptWebhookUrl || ''
  );
  const [sheetStatus, setSheetStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [confirmSyncModalOpen, setConfirmSyncModalOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const loadAdminRecords = async (token: string) => {
    const [examsRes, subsRes] = await Promise.all([
      fetch('/api/exams', { headers: { 'x-admin-token': token } }),
      fetch('/api/submissions', { headers: { 'x-admin-token': token } }),
    ]);
    if (examsRes.ok) {
      const d = await parseJsonResponse<{ exams?: ExamSet[] }>(examsRes);
      setAdminExams(d.exams || []);
    }
    if (subsRes.ok) {
      const d = await parseJsonResponse<{ submissions?: SubmissionRecord[] }>(subsRes);
      setSubmissions(d.submissions || []);
    }
  };

  useEffect(() => {
    loadAdminRecords(adminToken);
  }, [adminToken]);

  useEffect(() => {
    setSheetInput(integrationSettings.spreadsheetUrl || integrationSettings.spreadsheetId || '');
    setWebhookInput(integrationSettings.appsScriptWebhookUrl || '');
  }, [integrationSettings]);

  const handleTemplateFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'create' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readAndOptimizeTemplateImage(file);
      if (mode === 'create') {
        setCertTemplateDataUrl(dataUrl);
        setCertFileName(file.name);
      } else {
        setEditCertDataUrl(dataUrl);
      }
    } catch (err) {
      setExamFormMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'อัปโหลดรูปเกียรติบัตรไม่สำเร็จ',
      });
    }
  };

  const handleUpdateDraftQuestion = (
    idx: number,
    updater: (prev: DraftQuestion) => DraftQuestion
  ) => {
    setDraftQuestions((prev) => prev.map((q, i) => (i === idx ? updater(q) : q)));
  };

  const resetExamForm = () => {
    const today = getBangkokDateString();
    setNewTitle('');
    setNewDescription('');
    setNewPublishDate(today);
    setNewCertPublishDate(today);
    setCertDateManuallyEdited(false);
    setCertTemplateDataUrl('');
    setCertFileName('');
    setCertConfig({ ...DEFAULT_CERTIFICATE_CONFIG });
    setDraftQuestions([createEmptyQuestion()]);
  };

  const handleOpenEditContentModal = (exam: ExamSet) => {
    const today = getBangkokDateString();
    setEditingContentExam(exam);
    setEditExamTitle(exam.title);
    setEditExamDescription(exam.description || '');
    setEditExamPublishDate(exam.publishDate || today);
    setEditExamCertDate(exam.certificatePublishDate || exam.publishDate || today);
    setEditExamQuestions(
      exam.questions.length > 0
        ? exam.questions.map((q) => ({
            id: q.id,
            text: q.text,
            options: [
              q.options[0] || '',
              q.options[1] || '',
              q.options[2] || '',
              q.options[3] || '',
            ],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          }))
        : [createEmptyQuestion()]
    );
    setEditContentError(null);
  };

  const handleUpdateEditModalQuestion = (
    idx: number,
    updater: (prev: DraftQuestion) => DraftQuestion
  ) => {
    setEditExamQuestions((prev) => prev.map((q, i) => (i === idx ? updater(q) : q)));
  };

  const handleSaveEditedContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContentExam) return;
    setEditContentError(null);
    setSavingEditContent(true);

    try {
      const res = await fetch(`/api/exams/${editingContentExam.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          title: editExamTitle,
          description: editExamDescription,
          publishDate: editExamPublishDate,
          certificatePublishDate: editExamCertDate,
          questions: editExamQuestions,
        }),
      });
      const data = await parseJsonResponse<{
        exam: ExamSet;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกการแก้ไขชุดข้อสอบไม่สำเร็จ');
      }

      setEditingContentExam(null);
      await loadAdminRecords(adminToken);
      await onRefreshGlobalData();
      setExamFormMessage({
        type: 'success',
        text: `บันทึกการแก้ไขชื่อและเนื้อหาชุดข้อสอบ "${data.exam.title}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setEditContentError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกการแก้ไข'
      );
    } finally {
      setSavingEditContent(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormMessage(null);

    setSavingExam(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          publishDate: newPublishDate,
          certificatePublishDate: newCertPublishDate,
          certificateTemplate: certTemplateDataUrl || undefined,
          certificateConfig: certConfig,
          questions: draftQuestions,
        }),
      });
      const data = await parseJsonResponse<{
        exam: ExamSet;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกชุดข้อสอบไม่สำเร็จ');
      }

      const today = getBangkokDateString();
      resetExamForm();
      setShowCreateForm(false);
      setExamFormMessage({
        type: 'success',
        text:
          data.exam.publishDate > today
            ? `บันทึกชุดข้อสอบล่วงหน้า "${data.exam.title}" เรียบร้อยแล้ว (จะเผยแพร่วันที่ ${formatThaiDisplayDate(data.exam.publishDate)})`
            : `สร้างและเผยแพร่ชุดข้อสอบ "${data.exam.title}" เรียบร้อยแล้ว`,
      });
      await loadAdminRecords(adminToken);
      await onRefreshGlobalData();
    } catch (err) {
      setExamFormMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อสอบ',
      });
    } finally {
      setSavingExam(false);
    }
  };

  const handleOpenEditCertModal = (exam: ExamSet) => {
    const today = getBangkokDateString();
    setEditingCertExam(exam);
    setEditPublishDate(exam.publishDate || today);
    setEditCertPublishDate(exam.certificatePublishDate || exam.publishDate || today);
    setEditCertDataUrl(exam.certificateTemplate);
    setEditCertConfig({ ...DEFAULT_CERTIFICATE_CONFIG, ...exam.certificateConfig });
  };

  const handleSaveEditedCertificate = async () => {
    if (!editingCertExam) return;
    setSavingEditCert(true);
    try {
      const res = await fetch(`/api/exams/${editingCertExam.id}/certificate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          publishDate: editPublishDate,
          certificatePublishDate: editCertPublishDate,
          certificateTemplate: editCertDataUrl,
          certificateConfig: editCertConfig,
        }),
      });
      if (res.ok) {
        setEditingCertExam(null);
        await loadAdminRecords(adminToken);
        await onRefreshGlobalData();
        setExamFormMessage({
          type: 'success',
          text: 'อัปเดตกำหนดการเผยแพร่และรูปแบบเกียรติบัตรเรียบร้อยแล้ว',
        });
      }
    } finally {
      setSavingEditCert(false);
    }
  };

  const handleConfirmDeleteExam = async () => {
    if (!examPendingDelete) return;
    try {
      const res = await fetch(`/api/exams/${examPendingDelete.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken },
      });
      if (res.ok) {
        await loadAdminRecords(adminToken);
        await onRefreshGlobalData();
      }
    } finally {
      setExamPendingDelete(null);
    }
  };

  const handleConfirmDeleteSubmission = async () => {
    if (!submissionPendingDelete) return;
    setDeletingSubmission(true);
    setSubmissionFeedback(null);
    try {
      const res = await fetch(`/api/submissions/${submissionPendingDelete.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken },
      });
      const data = await parseJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'ไม่สามารถลบข้อมูลผลการสอบได้');
      }
      const deletedName = submissionPendingDelete.studentName;
      setSubmissionPendingDelete(null);
      await loadAdminRecords(adminToken);
      await onRefreshGlobalData();
      setSubmissionFeedback({
        type: 'success',
        text: `ลบข้อมูลผลการสอบของ "${deletedName}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setSubmissionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลผลการสอบได้',
      });
      setSubmissionPendingDelete(null);
    } finally {
      setDeletingSubmission(false);
    }
  };

  const handleConfirmDeleteAllPassed = async () => {
    setDeletingSubmission(true);
    setSubmissionFeedback(null);
    try {
      const res = await fetch('/api/submissions/passed', {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken },
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        deletedCount?: number;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'ไม่สามารถลบข้อมูลผู้สอบผ่านทั้งหมดได้');
      }
      setConfirmDeleteAllPassedOpen(false);
      await loadAdminRecords(adminToken);
      await onRefreshGlobalData();
      setSubmissionFeedback({
        type: 'success',
        text: `ลบข้อมูลผู้ที่สอบผ่านทั้งหมดจำนวน ${data.deletedCount ?? 0} รายการ เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setSubmissionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลผู้สอบผ่านทั้งหมดได้',
      });
      setConfirmDeleteAllPassedOpen(false);
    } finally {
      setDeletingSubmission(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSheetBusy(true);
    setSheetStatus(null);
    try {
      const result = await signInWithGoogleSheets();
      if (result) {
        onGoogleAuthUpdate(result.user, true);
        setSheetStatus({
          type: 'success',
          text: `เชื่อมต่อบัญชี Google (${result.user.email}) สำเร็จแล้ว`,
        });
      }
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'ลงชื่อเข้าใช้ด้วย Google ไม่สำเร็จ',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleSheets();
    onGoogleAuthUpdate(null, false);
    setSheetStatus(null);
  };

  const saveIntegrationSettingsToServer = async (
    next: Partial<IntegrationSettings>
  ) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
      },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      throw new Error('ไม่สามารถบันทึกการตั้งค่าได้');
    }
    await onRefreshGlobalData();
  };

  const handleCreateNewSheet = async () => {
    setSheetBusy(true);
    setSheetStatus(null);
    try {
      const created = await createExamSpreadsheet(newSheetTitle);
      await saveIntegrationSettingsToServer(created);
      setNewSheetTitle('');
      setSheetStatus({
        type: 'success',
        text: `สร้างและเชื่อมต่อไฟล์ "${created.spreadsheetTitle}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'สร้าง Google Sheets ไม่สำเร็จ',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleLinkExistingSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSheetBusy(true);
    setSheetStatus(null);
    try {
      const info = await inspectExamSpreadsheet(sheetInput);
      await saveIntegrationSettingsToServer(info);
      setSheetStatus({
        type: 'success',
        text: `เชื่อมต่อกับสเปรดชีต "${info.spreadsheetTitle}" (แท็บ: ${info.sheetTabName}) สำเร็จ`,
      });
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'เชื่อมต่อไฟล์ไม่สำเร็จ',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const executeConfirmedSyncToSheets = async () => {
    setConfirmSyncModalOpen(false);
    setSheetBusy(true);
    setSheetStatus(null);
    try {
      const { updatedRows } = await syncAllSubmissionsToSheet(
        integrationSettings.spreadsheetId,
        integrationSettings.sheetTabName,
        submissions
      );
      await fetch('/api/submissions/mark-synced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionIds: submissions.map((s) => s.id) }),
      });
      await loadAdminRecords(adminToken);
      setSheetStatus({
        type: 'success',
        text: `ซิงค์ข้อมูลผลการสอบทั้งหมด ${updatedRows} รายการ ไปยัง Google Sheets สำเร็จ`,
      });
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'ซิงค์ข้อมูลไม่สำเร็จ',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleSaveWebhookUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSheetBusy(true);
    setSheetStatus(null);
    try {
      await saveIntegrationSettingsToServer({ appsScriptWebhookUrl: webhookInput });
      setSheetStatus({
        type: 'success',
        text: webhookInput.trim()
          ? 'บันทึก Google Apps Script Webhook URL เรียบร้อยแล้ว'
          : 'ล้างค่า Google Apps Script Webhook URL เรียบร้อยแล้ว',
      });
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'บันทึก URL ไม่สำเร็จ',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleDownloadCsv = () => {
    const headers = [
      'วันที่-เวลา',
      'คำนำหน้าชื่อ',
      'ชื่อ-นามสกุล',
      'ตำแหน่ง/สถานะ',
      'ชุดข้อสอบ',
      'คะแนนที่ได้',
      'คิดเป็นร้อยละ',
      'สถานะ',
    ];
    const rows = submissions.map((s) => [
      new Date(s.submittedAt).toLocaleString('th-TH'),
      `"${(s.prefix || '-').replace(/"/g, '""')}"`,
      `"${(s.nameBody || s.studentName).replace(/"/g, '""')}"`,
      `"${(s.memberRole || '-').replace(/"/g, '""')}"`,
      `"${s.examTitle.replace(/"/g, '""')}"`,
      `${s.score}/${s.totalQuestions}`,
      `${s.percentage}%`,
      s.statusText,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exam-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const passedSubmissionsCount = submissions.filter((s) => s.passed).length;
  const failedSubmissionsCount = submissions.length - passedSubmissionsCount;

  const filteredSubmissions = submissions.filter((s) => {
    if (submissionStatusFilter === 'passed' && !s.passed) return false;
    if (submissionStatusFilter === 'failed' && s.passed) return false;
    const q = searchFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      s.studentName.toLowerCase().includes(q) ||
      (s.memberRole || '').toLowerCase().includes(q) ||
      s.examTitle.toLowerCase().includes(q)
    );
  });

  const renderPositionControls = (
    cfg: CertificateLayoutConfig,
    setCfg: React.Dispatch<React.SetStateAction<CertificateLayoutConfig>>
  ) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          สีข้อความบนเกียรติบัตร
        </span>
        <button
          type="button"
          onClick={() => setCfg({ ...DEFAULT_CERTIFICATE_CONFIG })}
          className="text-xs font-semibold text-[#0284c7] hover:underline whitespace-nowrap"
        >
          รีเซ็ตขนาดและตำแหน่งเริ่มต้น
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: 'ดำเข้ม', hex: '#0f172a' },
          { label: 'กรมท่า', hex: '#0f2942' },
          { label: 'น้ำตาลทอง', hex: '#6b4c08' },
          { label: 'ขาว', hex: '#ffffff' },
        ].map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => setCfg((p) => ({ ...p, textColor: preset.hex }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              cfg.textColor.toLowerCase() === preset.hex
                ? 'border-[#0f2942] bg-slate-100 text-slate-900 font-semibold'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <input
          type="color"
          value={cfg.textColor}
          onChange={(e) => setCfg((p) => ({ ...p, textColor: e.target.value }))}
          aria-label="กำหนดสีตัวอักษรเอง"
          className="w-8 h-8 rounded border border-slate-300 cursor-pointer bg-white p-0.5"
        />
      </div>

      <div className="divide-y divide-slate-200 border-t border-slate-200">
        {/* 1. ชื่อ-นามสกุล */}
        <div className="py-3 space-y-2">
          <p className="text-xs font-bold text-slate-800">1. ชื่อ-นามสกุล</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ขนาดอักษร</span>
                <span className="font-mono tabular-nums">{cfg.nameSize} px</span>
              </div>
              <input
                type="range"
                min={20}
                max={110}
                value={cfg.nameSize}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, nameSize: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ตำแหน่งแนวตั้ง</span>
                <span className="font-mono tabular-nums">{cfg.nameY}%</span>
              </div>
              <input
                type="range"
                min={8}
                max={92}
                value={cfg.nameY}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, nameY: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
          </div>
        </div>

        {/* 2. ชื่อแบบทดสอบ */}
        <div className="py-3 space-y-2">
          <p className="text-xs font-bold text-slate-800">2. ชื่อแบบทดสอบ</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ขนาดอักษร</span>
                <span className="font-mono tabular-nums">{cfg.examTitleSize} px</span>
              </div>
              <input
                type="range"
                min={16}
                max={80}
                value={cfg.examTitleSize}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, examTitleSize: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ตำแหน่งแนวตั้ง</span>
                <span className="font-mono tabular-nums">{cfg.examTitleY}%</span>
              </div>
              <input
                type="range"
                min={8}
                max={92}
                value={cfg.examTitleY}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, examTitleY: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
          </div>
        </div>

        {/* 3. ให้ไว้ ณ วันที่ เดือน พ.ศ. */}
        <div className="py-3 space-y-2">
          <p className="text-xs font-bold text-slate-800">
            3. ให้ไว้ ณ วันที่ เดือน พ.ศ.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ขนาดอักษร</span>
                <span className="font-mono tabular-nums">{cfg.dateSize} px</span>
              </div>
              <input
                type="range"
                min={14}
                max={65}
                value={cfg.dateSize}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, dateSize: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>ตำแหน่งแนวตั้ง</span>
                <span className="font-mono tabular-nums">{cfg.dateY}%</span>
              </div>
              <input
                type="range"
                min={8}
                max={96}
                value={cfg.dateY}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, dateY: Number(e.target.value) }))
                }
                className="w-full accent-[#0f2942]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums mb-1">
            <span>ระบบผู้ดูแลระบบ</span>
            <span aria-hidden="true">·</span>
            <span>ชุดข้อสอบ {adminExams.length} ชุด</span>
            <span aria-hidden="true">·</span>
            <span>ส่งผลสอบแล้ว {submissions.length} รายการ</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            จัดการชุดข้อสอบ รูปแบบเกียรติบัตร และผลคะแนน
          </h1>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start md:self-auto">
          <button
            type="button"
            onClick={() => onChangeTab(AdminTab.EXAMS)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === AdminTab.EXAMS
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ชุดข้อสอบ ({adminExams.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab(AdminTab.SUBMISSIONS)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === AdminTab.SUBMISSIONS
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ผลการสอบ ({submissions.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab(AdminTab.SHEETS)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === AdminTab.SHEETS
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Google Sheets
          </button>
        </div>
      </div>

      {/* TAB 1: EXAMS & CERTIFICATE TEMPLATE BUILDER */}
      {activeTab === AdminTab.EXAMS && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              เมื่อสร้างข้อสอบใหม่ แอดมินสามารถอัปโหลดภาพพื้นหลังเกียรติบัตรของตนเอง โดยระบบจะวางเฉพาะ ชื่อผู้สอบ, ชื่อแบบทดสอบ และวันที่ ลงบนเกียรติบัตรให้อัตโนมัติ
            </p>
            <button
              type="button"
              onClick={() => {
                if (showCreateForm) {
                  resetExamForm();
                  setShowCreateForm(false);
                } else {
                  resetExamForm();
                  setShowCreateForm(true);
                }
                setExamFormMessage(null);
              }}
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateForm ? 'ปิดฟอร์มข้อสอบ' : 'เพิ่มชุดข้อสอบใหม่'}</span>
            </button>
          </div>

          {examFormMessage && (
            <div
              className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 border ${
                examFormMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {examFormMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{examFormMessage.text}</span>
            </div>
          )}

          {showCreateForm && (
            <form
              onSubmit={handleCreateExam}
              className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8"
            >
              <div className="pb-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-900">
                  เพิ่มชุดข้อสอบใหม่และกำหนดรูปแบบเกียรติบัตร
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  กำหนดชื่อข้อสอบ อัปโหลดไฟล์แม่แบบเกียรติบัตร (หรืออัปโหลดภายหลังได้) และเพิ่มโจทย์คำถามตัวเลือก ก–ง
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    ชื่อชุดข้อสอบ * (จะแสดงบนเกียรติบัตร)
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="เช่น แบบทดสอบวัดความรู้วิทยาศาสตร์กายภาพ มัธยมศึกษาปีที่ 4"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    คำอธิบายชุดข้อสอบ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="คำชี้แจงสำหรับผู้เข้าสอบ (เกณฑ์ผ่าน 80%)"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      วันที่เผยแพร่ข้อสอบ (ลงข้อสอบล่วงหน้าได้) *
                    </label>
                    <input
                      type="date"
                      required
                      value={newPublishDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewPublishDate(val);
                        if (!certDateManuallyEdited && val) {
                          setNewCertPublishDate(val);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                    />
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      เปิดให้เข้าสอบตั้งแต่วันที่:{' '}
                      <strong className="text-slate-700">
                        {formatThaiDisplayDate(newPublishDate)}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      วันที่เผยแพร่เกียรติบัตร (ตรงกับวันที่ในเกียรติบัตร) *
                    </label>
                    <input
                      type="date"
                      required
                      value={newCertPublishDate}
                      onChange={(e) => {
                        setNewCertPublishDate(e.target.value);
                        setCertDateManuallyEdited(true);
                      }}
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                    />
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      แสดงบนเกียรติบัตร:{' '}
                      <strong className="text-[#0f2942]">
                        {formatThaiCeremonialDate(newCertPublishDate)}
                      </strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom Certificate Template Upload & 4-Field Alignment */}
              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      รูปแบบเกียรติบัตรของชุดข้อสอบนี้ *
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      อัปโหลดรูปพื้นหลังเกียรติบัตร (.PNG หรือ .JPG) ระบบจะพิมพ์เฉพาะ ชื่อ-นามสกุล, ชื่อแบบทดสอบ และวันที่เผยแพร่เกียรติบัตร ลงบนแม่แบบนี้
                    </p>
                  </div>

                  <label className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0f2942] bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-4 h-4" />
                    <span>{certTemplateDataUrl ? 'เปลี่ยนรูปเกียรติบัตร' : 'เลือกรูปเกียรติบัตร'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleTemplateFileUpload(e, 'create')}
                      className="hidden"
                    />
                  </label>
                </div>

                {!certTemplateDataUrl ? (
                  <label className="flex flex-col items-center justify-center gap-2 py-10 px-4 border border-dashed border-slate-300 rounded-xl bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer text-center transition-colors">
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700">
                      คลิกเพื่ออัปโหลดภาพพื้นหลังเกียรติบัตร (.PNG, .JPG)
                    </span>
                    <span className="text-xs text-slate-500">
                      แนะนำขนาดแนวนอน A4 (เช่น 2000 × 1414 px) ที่เว้นพื้นที่ว่างสำหรับวางชื่อและรายละเอียด
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleTemplateFileUpload(e, 'create')}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
                    <div className="lg:col-span-7 space-y-1.5">
                      <p className="text-xs text-slate-500">
                        ตัวอย่างการจัดวางข้อความบนไฟล์: <strong>{certFileName}</strong>
                      </p>
                      <CertificateTemplateLivePreview
                        templateDataUrl={certTemplateDataUrl}
                        config={certConfig}
                        examTitleSample={newTitle}
                        certificatePublishDateSample={newCertPublishDate}
                      />
                    </div>
                    <div className="lg:col-span-5 space-y-4">
                      <p className="text-xs font-semibold text-slate-800">
                        ปรับตำแหน่งข้อความทั้ง 3 รายการให้ตรงกับช่องว่างของเกียรติบัตรคุณ
                      </p>
                      {renderPositionControls(certConfig, setCertConfig)}
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Questions List */}
              <div className="pt-6 border-t border-slate-200 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      รายการคำถาม ({draftQuestions.length} ข้อ)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      เพิ่มข้อสอบเรียงตามลำดับข้อ 1, 2, 3... ตามปกติ เมื่อผู้เข้าสอบเริ่มทำระบบจะสุ่มสลับข้อให้อัตโนมัติโดยยังคงแสดงเลขข้อเรียงลำดับเหมือนเดิม
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftQuestions((prev) => [...prev, createEmptyQuestion()])
                    }
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0f2942] bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มข้อคำถาม</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-200">
                  {draftQuestions.map((q, qIdx) => (
                    <div key={qIdx} className="py-6 first:pt-2 last:pb-2 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-mono font-bold text-slate-800 tabular-nums">
                          ข้อที่ {qIdx + 1}
                        </span>
                        {draftQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftQuestions((prev) =>
                                prev.filter((_, idx) => idx !== qIdx)
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ลบข้อนี้</span>
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        required
                        value={q.text}
                        onChange={(e) =>
                          handleUpdateDraftQuestion(qIdx, (prev) => ({
                            ...prev,
                            text: e.target.value,
                          }))
                        }
                        placeholder={`พิมพ์โจทย์คำถามข้อที่ ${qIdx + 1}...`}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {CHOICE_LABELS.map((label, optIdx) => {
                          const isCorrect = q.correctIndex === optIdx;
                          return (
                            <div key={label} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateDraftQuestion(qIdx, (prev) => ({
                                    ...prev,
                                    correctIndex: optIdx,
                                  }))
                                }
                                title="คลิกเพื่อตั้งเป็นข้อที่ถูกต้อง"
                                className={`px-2.5 py-2.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                                  isCorrect
                                    ? 'bg-emerald-700 text-white border-emerald-700'
                                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                }`}
                              >
                                {label} {isCorrect ? '✓ เฉลย' : ''}
                              </button>
                              <input
                                type="text"
                                required
                                value={q.options[optIdx]}
                                onChange={(e) =>
                                  handleUpdateDraftQuestion(qIdx, (prev) => {
                                    const nextOpts: [string, string, string, string] = [
                                      ...prev.options,
                                    ];
                                    nextOpts[optIdx] = e.target.value;
                                    return { ...prev, options: nextOpts };
                                  })
                                }
                                placeholder={`ตัวเลือก ${label}`}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500">
                        คลิกปุ่ม ก, ข, ค หรือ ง เพื่อกำหนดข้อที่ถูกต้อง (ปัจจุบันเฉลยข้อ{' '}
                        <strong className="text-emerald-700">
                          {CHOICE_LABELS[q.correctIndex]}
                        </strong>
                        )
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftQuestions((prev) => [...prev, createEmptyQuestion()])
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>เพิ่มคำถามข้อถัดไป</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        resetExamForm();
                        setShowCreateForm(false);
                      }}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={savingExam}
                      className="px-6 py-2.5 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {savingExam ? 'กำลังบันทึก...' : 'บันทึกชุดข้อสอบ'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Search Filter for Exam Sets */}
          {adminExams.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <input
                type="search"
                value={examSearchFilter}
                onChange={(e) => setExamSearchFilter(e.target.value)}
                placeholder="ค้นหาชื่อชุดข้อสอบ หรือคำอธิบาย..."
                className="w-full sm:max-w-sm px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
              />
              <span className="text-xs text-slate-500 tabular-nums">
                ทั้งหมด {adminExams.length} ชุดข้อสอบ
              </span>
            </div>
          )}

          {/* Existing Exam Sets List */}
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {adminExams.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                ยังไม่มีชุดข้อสอบในระบบ กดปุ่ม &ldquo;เพิ่มชุดข้อสอบใหม่&rdquo; เพื่อเริ่มต้นสร้างข้อสอบ
              </div>
            ) : (
              adminExams
                .filter((ex) => {
                  const q = examSearchFilter.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    ex.title.toLowerCase().includes(q) ||
                    (ex.description || '').toLowerCase().includes(q)
                  );
                })
                .map((exam) => (
                <div key={exam.id} className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                        {exam.isPublished ? (
                          <span className="font-semibold text-emerald-700">เผยแพร่แล้ว</span>
                        ) : (
                          <span className="font-semibold text-amber-700">
                            รอเผยแพร่ข้อสอบ ({formatThaiDisplayDate(exam.publishDate)})
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>จำนวน {exam.questionCount} ข้อ</span>
                        <span aria-hidden="true">·</span>
                        <span>เกณฑ์ผ่าน {exam.passingPercent}%</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">{exam.title}</h3>
                      <p className="text-sm text-slate-600">{exam.description}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-slate-500 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>เผยแพร่ข้อสอบ: {formatThaiDisplayDate(exam.publishDate)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          วันที่เผยแพร่และแสดงในเกียรติบัตร:{' '}
                          {formatThaiDisplayDate(exam.certificatePublishDate)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditContentModal(exam)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0f2942] hover:bg-[#163a5c] rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>แก้ไขชื่อและเนื้อหาข้อสอบ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditCertModal(exam)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>ตั้งค่าเกียรติบัตร / วันเผยแพร่</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamPendingDelete(exam)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ลบ</span>
                      </button>
                    </div>
                  </div>

                  <details className="group pt-1">
                    <summary className="text-xs font-semibold text-[#0284c7] cursor-pointer select-none hover:underline">
                      ดูรายการโจทย์และเฉลยทั้งหมด ({exam.questions.length} ข้อ)
                    </summary>
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 text-sm">
                      {exam.questions.map((q, idx) => (
                        <div key={q.id} className="space-y-1">
                          <p className="font-semibold text-slate-800">
                            {idx + 1}. {q.text}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-4 text-xs text-slate-600">
                            {q.options.map((opt, oIdx) => (
                              <p
                                key={oIdx}
                                className={
                                  q.correctIndex === oIdx
                                    ? 'font-bold text-emerald-700'
                                    : ''
                                }
                              >
                                {CHOICE_LABELS[oIdx]}. {opt}{' '}
                                {q.correctIndex === oIdx ? '(คำตอบที่ถูก)' : ''}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SUBMISSIONS RESULTS TABLE */}
      {activeTab === AdminTab.SUBMISSIONS && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start shrink-0">
                <button
                  type="button"
                  onClick={() => setSubmissionStatusFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    submissionStatusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด ({submissions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionStatusFilter('passed')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    submissionStatusFilter === 'passed'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  สอบผ่าน ({passedSubmissionsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionStatusFilter('failed')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    submissionStatusFilter === 'failed'
                      ? 'bg-white text-rose-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ไม่ผ่าน ({failedSubmissionsCount})
                </button>
              </div>

              <input
                type="search"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="ค้นหาชื่อ-นามสกุล, ตำแหน่ง/สถานะ หรือชื่อข้อสอบ..."
                className="w-full sm:max-w-xs px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={passedSubmissionsCount === 0 || deletingSubmission}
                onClick={() => setConfirmDeleteAllPassedOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบข้อมูลคนสอบผ่านทั้งหมด ({passedSubmissionsCount})</span>
              </button>

              {integrationSettings.spreadsheetUrl && (
                <a
                  href={integrationSettings.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <span>เปิด Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                disabled={submissions.length === 0}
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ดาวน์โหลด CSV</span>
              </button>
            </div>
          </div>

          {submissionFeedback && (
            <div
              className={`flex items-center justify-between gap-3 text-sm rounded-lg px-4 py-3 border ${
                submissionFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {submissionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{submissionFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubmissionFeedback(null)}
                className="p-1 text-current opacity-70 hover:opacity-100"
                aria-label="ปิดข้อความแจ้งเตือน"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredSubmissions.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                ยังไม่มีประวัติการส่งข้อสอบที่ตรงกับเงื่อนไข
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 whitespace-nowrap">วันที่-เวลา</th>
                      <th className="py-3 px-4 whitespace-nowrap">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-4 whitespace-nowrap">ตำแหน่ง/สถานะ</th>
                      <th className="py-3 px-4">ชุดข้อสอบ</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">คะแนน</th>
                      <th className="py-3 px-4 whitespace-nowrap">สถานะ</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">เกียรติบัตร / จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredSubmissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {new Date(sub.submittedAt).toLocaleString('th-TH', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {sub.studentName}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {sub.memberRole || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                          {sub.examTitle}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {sub.score}/{sub.totalQuestions} ({sub.percentage}%)
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {sub.passed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ผ่าน</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>ไม่ผ่าน</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-3">
                            {sub.passed && (
                              <button
                                type="button"
                                onClick={() => setPreviewSubmission(sub)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284c7] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>ดูเกียรติบัตร</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSubmissionPendingDelete(sub)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>ลบ</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GOOGLE SHEETS & APPS SCRIPT */}
      {activeTab === AdminTab.SHEETS && (
        <div className="space-y-6">
          {sheetStatus && (
            <div
              className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 border ${
                sheetStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {sheetStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{sheetStatus.text}</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  วิธีที่ 1: เชื่อมต่อโดยตรงผ่าน Google Sheets API
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  ลงชื่อเข้าใช้ด้วยบัญชี Google เพื่อสร้างสเปรดชีตใหม่หรือซิงค์ตารางคะแนนนักเรียนเข้าสู่ Google Sheets โดยตรง
                </p>
              </div>

              <div className="shrink-0">
                {!hasGoogleToken ? (
                  <GoogleSignInButton
                    onClick={handleGoogleSignIn}
                    disabled={sheetBusy}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-600">
                      เชื่อมต่อแล้ว: <strong>{googleUser?.email}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleGoogleSignOut}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                    >
                      สลับบัญชี
                    </button>
                  </div>
                )}
              </div>
            </div>

            {hasGoogleToken && (
              <div className="space-y-6">
                {integrationSettings.spreadsheetId && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">ไฟล์ Google Sheets ที่เชื่อมต่ออยู่ปัจจุบัน</p>
                      <p className="text-sm font-bold text-slate-900">
                        {integrationSettings.spreadsheetTitle || integrationSettings.spreadsheetId}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        แท็บ: {integrationSettings.sheetTabName || 'ผลการสอบ'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <a
                        href={integrationSettings.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                      >
                        <span>เปิดดูสเปรดชีต</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        disabled={sheetBusy}
                        onClick={() => setConfirmSyncModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50 whitespace-nowrap"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>ซิงค์ผลสอบทั้งหมด ({submissions.length} รายการ)</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      สร้างไฟล์ Google Sheets ใหม่อัตโนมัติ
                    </h3>
                    <p className="text-xs text-slate-600">
                      ระบบจะสร้างไฟล์สเปรดชีตใหม่พร้อมตั้งหัวตารางภาษาไทยให้อัตโนมัติ
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSheetTitle}
                        onChange={(e) => setNewSheetTitle(e.target.value)}
                        placeholder="ชื่อไฟล์ (เว้นว่างเพื่อใช้ชื่อมาตรฐาน)"
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                      />
                      <button
                        type="button"
                        disabled={sheetBusy}
                        onClick={handleCreateNewSheet}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        สร้างไฟล์ใหม่
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleLinkExistingSheet} className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      หรือเชื่อมต่อกับไฟล์ Google Sheets ที่มีอยู่เดิม
                    </h3>
                    <p className="text-xs text-slate-600">
                      วางลิงก์ URL ของ Google Sheets หรือรหัส Spreadsheet ID
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={sheetInput}
                        onChange={(e) => setSheetInput(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                      />
                      <button
                        type="submit"
                        disabled={sheetBusy}
                        className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        เชื่อมต่อไฟล์
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                วิธีที่ 2: บันทึกอัตโนมัติเบื้องหลังผ่าน Google Apps Script (Webhook)
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                ส่งผลสอบของนักเรียนไปยัง Google Sheets ทันทีที่นักเรียนกดส่งคำตอบจากทุกอุปกรณ์
              </p>
            </div>

            <form onSubmit={handleSaveWebhookUrl} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="url"
                value={webhookInput}
                onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
              />
              <button
                type="submit"
                disabled={sheetBusy}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                บันทึก Webhook URL
              </button>
            </form>

            <details className="pt-2">
              <summary className="text-xs font-semibold text-[#0284c7] cursor-pointer select-none hover:underline">
                ดูโค้ด Google Apps Script (Code.gs) สำหรับนำไปวางใน Google Sheets
              </summary>
              <div className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(APPS_SCRIPT_CODE_TEMPLATE);
                      setCopiedScript(true);
                      setTimeout(() => setCopiedScript(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedScript ? 'คัดลอกโค้ดแล้ว' : 'คัดลอกโค้ด Code.gs'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
                  {APPS_SCRIPT_CODE_TEMPLATE}
                </pre>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Modal: Edit Exam Title, Description, Dates & Questions Content */}
      {editingContentExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedContent}
            className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 sm:p-8 space-y-6 my-8 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  แก้ไขชื่อข้อสอบและเนื้อหาคำถาม
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ปรับแก้ชื่อชุดข้อสอบ คำอธิบาย วันเผยแพร่ โจทย์ ตัวเลือก ก–ง และเฉลย แล้วกดบันทึกเพื่ออัปเดตถาวรบนฐานข้อมูล
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingContentExam(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editContentError && (
              <div className="flex items-center gap-2 text-sm rounded-lg px-4 py-3 border bg-rose-50 border-rose-200 text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editContentError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  ชื่อชุดข้อสอบ * (แสดงในหน้าสอบและบนเกียรติบัตร)
                </label>
                <input
                  type="text"
                  required
                  value={editExamTitle}
                  onChange={(e) => setEditExamTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  คำอธิบายชุดข้อสอบ
                </label>
                <input
                  type="text"
                  value={editExamDescription}
                  onChange={(e) => setEditExamDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    วันที่เผยแพร่ข้อสอบ *
                  </label>
                  <input
                    type="date"
                    required
                    value={editExamPublishDate}
                    onChange={(e) => setEditExamPublishDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {formatThaiDisplayDate(editExamPublishDate)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    วันที่เผยแพร่เกียรติบัตร (แสดงบนเกียรติบัตร) *
                  </label>
                  <input
                    type="date"
                    required
                    value={editExamCertDate}
                    onChange={(e) => setEditExamCertDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                  <p className="text-[11px] text-[#0f2942] font-medium mt-1 tabular-nums">
                    {formatThaiCeremonialDate(editExamCertDate)}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    เนื้อหาโจทย์และตัวเลือก ({editExamQuestions.length} ข้อ)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    คลิกที่ปุ่ม ก, ข, ค หรือ ง เพื่อเปลี่ยนข้อที่เป็นคำตอบที่ถูกต้อง
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditExamQuestions((prev) => [...prev, createEmptyQuestion()])
                  }
                  className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0f2942] bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มข้อคำถาม</span>
                </button>
              </div>

              <div className="divide-y divide-slate-200">
                {editExamQuestions.map((q, qIdx) => (
                  <div key={q.id || qIdx} className="py-5 first:pt-1 last:pb-1 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono font-bold text-slate-800 tabular-nums">
                        ข้อที่ {qIdx + 1}
                      </span>
                      {editExamQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditExamQuestions((prev) =>
                              prev.filter((_, idx) => idx !== qIdx)
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบข้อนี้</span>
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      value={q.text}
                      onChange={(e) =>
                        handleUpdateEditModalQuestion(qIdx, (prev) => ({
                          ...prev,
                          text: e.target.value,
                        }))
                      }
                      placeholder={`พิมพ์โจทย์คำถามข้อที่ ${qIdx + 1}...`}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CHOICE_LABELS.map((label, optIdx) => {
                        const isCorrect = q.correctIndex === optIdx;
                        return (
                          <div key={label} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateEditModalQuestion(qIdx, (prev) => ({
                                  ...prev,
                                  correctIndex: optIdx,
                                }))
                              }
                              title="คลิกเพื่อตั้งเป็นข้อที่ถูกต้อง"
                              className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                                isCorrect
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {label} {isCorrect ? '✓ เฉลย' : ''}
                            </button>
                            <input
                              type="text"
                              required
                              value={q.options[optIdx]}
                              onChange={(e) =>
                                handleUpdateEditModalQuestion(qIdx, (prev) => {
                                  const nextOpts: [string, string, string, string] = [
                                    ...prev.options,
                                  ];
                                  nextOpts[optIdx] = e.target.value;
                                  return { ...prev, options: nextOpts };
                                })
                              }
                              placeholder={`ตัวเลือก ${label}`}
                              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() =>
                  setEditExamQuestions((prev) => [...prev, createEmptyQuestion()])
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มคำถามข้อถัดไป</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingContentExam(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingEditContent}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50"
                >
                  {savingEditContent ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขชื่อและเนื้อหา'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Schedule & Certificate Template for Existing Exam */}
      {editingCertExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 sm:p-7 space-y-5 my-8 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ตั้งค่ากำหนดการเผยแพร่และเกียรติบัตร: {editingCertExam.title}
                </h3>
                <p className="text-xs text-slate-500">
                  กำหนดวันเผยแพร่ข้อสอบ วันเผยแพร่เกียรติบัตร และปรับตำแหน่งข้อความบนแม่แบบเกียรติบัตร
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCertExam(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  วันที่เผยแพร่ข้อสอบ (ลงล่วงหน้าได้)
                </label>
                <input
                  type="date"
                  value={editPublishDate}
                  onChange={(e) => setEditPublishDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                />
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {formatThaiDisplayDate(editPublishDate)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  วันที่เผยแพร่เกียรติบัตร (ตรงกับวันที่ในเกียรติบัตร)
                </label>
                <input
                  type="date"
                  value={editCertPublishDate}
                  onChange={(e) => setEditCertPublishDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                />
                <p className="text-[11px] text-[#0f2942] font-medium mt-1 tabular-nums">
                  {formatThaiCeremonialDate(editCertPublishDate)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-3">
                <CertificateTemplateLivePreview
                  templateDataUrl={editCertDataUrl}
                  config={editCertConfig}
                  examTitleSample={editingCertExam.title}
                  certificatePublishDateSample={editCertPublishDate}
                />
                <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0f2942] bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>อัปโหลดรูปพื้นหลังเกียรติบัตรใหม่ (.PNG / .JPG)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleTemplateFileUpload(e, 'edit')}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="lg:col-span-5 space-y-4">
                {renderPositionControls(editCertConfig, setEditCertConfig)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingCertExam(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={savingEditCert}
                onClick={handleSaveEditedCertificate}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50"
              >
                {savingEditCert ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Modal before Mutating Google Sheets */}
      {confirmSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันการอัปเดตข้อมูลใน Google Sheets?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              ระบบจะเขียนทับและอัปเดตตารางผลสอบจำนวนทั้งหมด{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {submissions.length}
              </strong>{' '}
              รายการ ลงในสเปรดชีต{' '}
              <strong>
                “{integrationSettings.spreadsheetTitle || integrationSettings.spreadsheetId}”
              </strong>{' '}
              (แท็บ: {integrationSettings.sheetTabName || 'ผลการสอบ'})
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSyncModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={executeConfirmedSyncToSheets}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c]"
              >
                ยืนยันการอัปเดตข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Exam Confirmation Modal */}
      {examPendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันการลบชุดข้อสอบ?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              คุณต้องการลบชุดข้อสอบ <strong>“{examPendingDelete.title}”</strong> ออกจากระบบหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setExamPendingDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExam}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800"
              >
                ลบชุดข้อสอบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Submission Confirmation Modal */}
      {submissionPendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันการลบข้อมูลผลการสอบ?
            </h3>
            <div className="text-sm text-slate-600 space-y-1.5 leading-relaxed">
              <p>
                คุณต้องการลบประวัติผลการสอบและเกียรติบัตรของ{' '}
                <strong className="text-slate-900">{submissionPendingDelete.studentName}</strong>{' '}
                ({submissionPendingDelete.memberRole || '-'}) หรือไม่?
              </p>
              <p className="text-xs text-slate-500">
                ชุดข้อสอบ: {submissionPendingDelete.examTitle} · คะแนน{' '}
                {submissionPendingDelete.score}/{submissionPendingDelete.totalQuestions} (
                {submissionPendingDelete.percentage}% · {submissionPendingDelete.statusText})
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingSubmission}
                onClick={() => setSubmissionPendingDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deletingSubmission}
                onClick={handleConfirmDeleteSubmission}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:opacity-50"
              >
                {deletingSubmission ? 'กำลังลบข้อมูล...' : 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Passed Submissions Confirmation Modal */}
      {confirmDeleteAllPassedOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันการลบข้อมูลผู้สอบผ่านทั้งหมด?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              ระบบจะลบข้อมูลผลการสอบและเกียรติบัตรของคนที่<strong>สอบผ่านทั้งหมด</strong>จำนวน{' '}
              <strong className="font-mono tabular-nums text-rose-700">
                {passedSubmissionsCount}
              </strong>{' '}
              รายการออกจากฐานข้อมูลถาวร การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingSubmission}
                onClick={() => setConfirmDeleteAllPassedOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deletingSubmission}
                onClick={handleConfirmDeleteAllPassed}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:opacity-50"
              >
                {deletingSubmission
                  ? 'กำลังลบข้อมูล...'
                  : `ยืนยันลบทั้งหมด (${passedSubmissionsCount} รายการ)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Preview Modal */}
      {previewSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-5 sm:p-7 space-y-4 my-8 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  เกียรติบัตรของ {previewSubmission.studentName}
                </h3>
                <p className="text-xs text-slate-500">
                  ตำแหน่ง/สถานะ: {previewSubmission.memberRole || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSubmission(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CertificateCard
              submission={previewSubmission}
              adminToken={adminToken}
              onSubmissionUpdated={(updated) => {
                setPreviewSubmission(updated);
                setSubmissions((prev) =>
                  prev.map((s) => (s.id === updated.id ? updated : s))
                );
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
