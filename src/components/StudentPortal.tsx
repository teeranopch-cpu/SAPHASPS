import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Send,
  BookOpen,
  AlertCircle,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import {
  CHOICE_LABELS,
  ExamDisplayMode,
  ExamQuestion,
  ExamSet,
  IntegrationSettings,
  MemberProfile,
  StudentTab,
  SubmissionRecord,
} from '../types';
import { CertificateCard } from './CertificateCard';
import { appendSubmissionToSheet, getAccessToken } from '../services/googleSheetsService';
import { formatThaiDisplayDate, getBangkokDateString } from '../utils/certificateRenderer';
import { parseJsonResponse } from '../utils/apiJson';

interface StudentPortalProps {
  member: MemberProfile;
  activeTab: StudentTab;
  onChangeTab: (tab: StudentTab) => void;
  exams: ExamSet[];
  loadingExams: boolean;
  integrationSettings: IntegrationSettings;
  onSubmissionComplete: () => void;
}

function shuffleExamQuestions(
  questions: ExamQuestion[],
  avoidSameAs?: ExamQuestion[]
): ExamQuestion[] {
  if (questions.length <= 1) return [...questions];
  const compareAgainst =
    avoidSameAs && avoidSameAs.length === questions.length ? avoidSameAs : questions;

  const arr = [...questions];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  const isIdentical = arr.every((q, idx) => q.id === compareAgainst[idx]?.id);
  if (isIdentical) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  member,
  activeTab,
  onChangeTab,
  exams,
  loadingExams,
  integrationSettings,
  onSubmissionComplete,
}) => {
  const [selectedExam, setSelectedExam] = useState<ExamSet | null>(null);
  const [shuffledQuestions, setShuffledQuestions] = useState<ExamQuestion[]>([]);
  const [displayMode, setDisplayMode] = useState<ExamDisplayMode>(ExamDisplayMode.STEP_BY_STEP);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionRecord | null>(null);
  const [sheetSaveNote, setSheetSaveNote] = useState<string | null>(null);

  // Member's own past submissions
  const [myHistory, setMyHistory] = useState<SubmissionRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyCertItem, setHistoryCertItem] = useState<SubmissionRecord | null>(null);

  const fetchMyHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/submissions?memberPin=${encodeURIComponent(member.pin)}`
      );
      if (res.ok) {
        const d = await parseJsonResponse<{ submissions?: SubmissionRecord[] }>(res);
        setMyHistory(d.submissions || []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [member.pin]);

  useEffect(() => {
    fetchMyHistory();
  }, [fetchMyHistory]);

  useEffect(() => {
    if (activeTab === StudentTab.HISTORY) {
      fetchMyHistory();
    }
  }, [activeTab, fetchMyHistory]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedExam, result, activeTab]);

  const todayBangkok = getBangkokDateString();

  const handleStartExam = (exam: ExamSet) => {
    if (!exam.isPublished || exam.publishDate > todayBangkok) {
      return;
    }
    onChangeTab(StudentTab.EXAMS);
    setSelectedExam(exam);
    setShuffledQuestions((prev) =>
      shuffleExamQuestions(
        exam.questions,
        selectedExam?.id === exam.id && prev.length === exam.questions.length ? prev : undefined
      )
    );
    setAnswers({});
    setCurrentIndex(0);
    setConfirmUnanswered(false);
    setSubmitError(null);
    setResult(null);
    setSheetSaveNote(null);
  };

  const handleSelectOption = (questionId: string, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
    setConfirmUnanswered(false);
  };

  const executeSubmitExam = async () => {
    if (!selectedExam) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: selectedExam.id,
          memberPin: member.pin,
          answers,
        }),
      });

      const data = await parseJsonResponse<{
        submission: SubmissionRecord;
        settings?: Partial<IntegrationSettings>;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการส่งคำตอบ');
      }

      let submission: SubmissionRecord = data.submission;
      const targetSpreadsheetId =
        data.settings?.spreadsheetId || integrationSettings.spreadsheetId;
      const targetSheetTab =
        data.settings?.sheetTabName || integrationSettings.sheetTabName;

      if (targetSpreadsheetId && getAccessToken()) {
        try {
          const appended = await appendSubmissionToSheet(
            targetSpreadsheetId,
            targetSheetTab,
            submission
          );
          if (appended) {
            await fetch('/api/submissions/mark-synced', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submissionIds: [submission.id] }),
            });
            submission = { ...submission, sheetSynced: true };
            setSheetSaveNote('บันทึกผลสอบลงใน Google Sheets เรียบร้อยแล้ว');
          }
        } catch {
          // Keep server-stored submission intact
        }
      } else if (submission.webhookSynced) {
        setSheetSaveNote('บันทึกผลสอบลงใน Google Sheets ผ่าน Google Apps Script เรียบร้อยแล้ว');
      } else {
        setSheetSaveNote('บันทึกผลสอบในระบบเรียบร้อยแล้ว');
      }

      setResult(submission);
      setMyHistory((prev) => [submission, ...prev.filter((item) => item.id !== submission.id)]);
      onSubmissionComplete();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'ไม่สามารถส่งข้อสอบได้');
    } finally {
      setSubmitting(false);
      setConfirmUnanswered(false);
    }
  };

  const handleRequestSubmit = () => {
    if (!selectedExam) return;
    const activeQuestionList =
      shuffledQuestions.length > 0 ? shuffledQuestions : selectedExam.questions;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < activeQuestionList.length && !confirmUnanswered) {
      setConfirmUnanswered(true);
      return;
    }
    executeSubmitExam();
  };

  // TAB: MY SUBMISSION HISTORY & CERTIFICATES
  if (activeTab === StudentTab.HISTORY) {
    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-10 px-4 space-y-6">
        <div className="pb-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums mb-1">
              <span>{member.displayName}</span>
              <span aria-hidden="true">·</span>
              <span>สถานะ: {member.memberRole}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              ประวัติการสอบและเกียรติบัตรของฉัน
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setHistoryCertItem(null);
              onChangeTab(StudentTab.EXAMS);
            }}
            className="self-start sm:self-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            กลับไปเลือกชุดข้อสอบ
          </button>
        </div>

        {loadingHistory && myHistory.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            กำลังโหลดประวัติการสอบ...
          </div>
        ) : myHistory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            ยังไม่มีประวัติการทำแบบทดสอบของ {member.displayName}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
            {myHistory.map((item) => {
              const linkedExam = exams.find((e) => e.id === item.examId);
              const effectiveExamPublishDate =
                item.examPublishDate || linkedExam?.publishDate || '';
              const certReady =
                !effectiveExamPublishDate || todayBangkok >= effectiveExamPublishDate;
              return (
                <div
                  key={item.id}
                  className={`p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    item.passed ? 'bg-emerald-50/50 border-l-4 border-l-emerald-600' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span>
                        สอบเมื่อ{' '}
                        {new Date(item.submittedAt).toLocaleString('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      {item.passed && item.certificatePublishDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            วันที่ในเกียรติบัตร: {formatThaiDisplayDate(item.certificatePublishDate)}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{item.examTitle}</h2>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-bold text-slate-900">
                        {item.percentage}% ({item.score}/{item.totalQuestions})
                      </p>
                      {item.passed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 font-sans">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ผ่าน</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 font-sans">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ไม่ผ่าน</span>
                        </span>
                      )}
                    </div>

                    {item.passed && (
                      certReady ? (
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryCertItem(historyCertItem?.id === item.id ? null : item)
                          }
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] whitespace-nowrap shrink-0"
                        >
                          {historyCertItem?.id === item.id ? 'ซ่อนเกียรติบัตร' : 'ดูเกียรติบัตร'}
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
                          ดาวน์โหลดได้เมื่อเผยแพร่ข้อสอบ {formatThaiDisplayDate(effectiveExamPublishDate)}
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {historyCertItem && (
          <div className="pt-2">
            <CertificateCard
              submission={historyCertItem}
              memberPin={member.pin}
              onSubmissionUpdated={(updated) => {
                setHistoryCertItem(updated);
                setMyHistory((prev) =>
                  prev.map((item) => (item.id === updated.id ? updated : item))
                );
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // EXAM SELECTION VIEW
  if (!selectedExam) {
    const passedByExamId = new Map<string, SubmissionRecord>();
    for (const sub of myHistory) {
      if (!sub.passed) continue;
      const existing = passedByExamId.get(sub.examId);
      if (!existing || sub.percentage > existing.percentage) {
        passedByExamId.set(sub.examId, sub);
      }
    }
    const passedExamsCount = exams.filter((e) => passedByExamId.has(e.id)).length;

    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-10 px-4">
        <div className="pb-6 border-b border-slate-200 mb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums mb-1">
            <span>ผู้เข้าสอบ: {member.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>ตำแหน่ง/สถานะ: {member.memberRole}</span>
            {exams.length > 0 && passedExamsCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-700">
                  สอบผ่านแล้ว {passedExamsCount}/{exams.length} ชุด
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            เลือกชุดข้อสอบที่ต้องการทำ
          </h1>
        </div>

        {loadingExams ? (
          <div className="py-16 text-center text-sm text-slate-500">
            กำลังโหลดชุดข้อสอบ...
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-800">ยังไม่มีชุดข้อสอบในระบบ</p>
            <p className="text-sm text-slate-500 mt-1">
              กรุณารอให้ผู้ดูแลระบบเพิ่มชุดข้อสอบก่อนเข้าทำการทดสอบ
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((exam, idx) => {
              const isAvailable = exam.isPublished && exam.publishDate <= todayBangkok;
              const passedSub = passedByExamId.get(exam.id);
              const isPassed = Boolean(passedSub);
              const certReady = Boolean(passedSub) && isAvailable;

              return (
                <div
                  key={exam.id}
                  className={`rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors ${
                    isPassed
                      ? 'bg-emerald-50/85 border border-emerald-400 border-l-4 border-l-emerald-600 hover:border-emerald-500'
                      : 'bg-white border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2 max-w-2xl">
                    <div
                      className={`flex flex-wrap items-center gap-2 text-xs tabular-nums ${
                        isPassed ? 'text-emerald-900/80' : 'text-slate-500'
                      }`}
                    >
                      <span
                        className={`font-mono font-semibold ${
                          isPassed ? 'text-emerald-950' : 'text-slate-700'
                        }`}
                      >
                        ชุดที่ {String(idx + 1).padStart(2, '0')}
                      </span>
                      {isPassed && passedSub && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>สอบผ่านแล้ว ({passedSub.percentage}%)</span>
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>จำนวน {exam.questionCount} ข้อ</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-medium">
                        เกณฑ์ผ่าน {exam.passingPercent}%
                      </span>
                      <span aria-hidden="true">·</span>
                      {isAvailable ? (
                        <span>เผยแพร่เมื่อ {formatThaiDisplayDate(exam.publishDate)}</span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          กำหนดเผยแพร่ข้อสอบ {formatThaiDisplayDate(exam.publishDate)}
                        </span>
                      )}
                    </div>
                    <h2
                      className={`text-lg font-bold leading-snug text-balance ${
                        isPassed ? 'text-emerald-950' : 'text-slate-900'
                      }`}
                    >
                      {exam.title}
                    </h2>
                    <p
                      className={`text-sm leading-relaxed ${
                        isPassed ? 'text-emerald-900/85' : 'text-slate-600'
                      }`}
                    >
                      {exam.description}
                    </p>
                    {exam.certificatePublishDate && (
                      <p
                        className={`text-xs tabular-nums ${
                          isPassed ? 'text-emerald-800/85' : 'text-slate-500'
                        }`}
                      >
                        วันที่ระบุในเกียรติบัตร:{' '}
                        {formatThaiDisplayDate(exam.certificatePublishDate)}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isAvailable ? (
                      isPassed && passedSub ? (
                        <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-2">
                          {certReady && (
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryCertItem(passedSub);
                                onChangeTab(StudentTab.HISTORY);
                              }}
                              className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>ดูเกียรติบัตร</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartExam(exam)}
                            className={`w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                              certReady
                                ? 'text-emerald-900 bg-white border border-emerald-400 hover:bg-emerald-100/70'
                                : 'text-white bg-emerald-700 hover:bg-emerald-800'
                            }`}
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>ทำอีกครั้ง</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartExam(exam)}
                          className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>เริ่มทำข้อสอบ</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed whitespace-nowrap shrink-0"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>เปิดสอบ {formatThaiDisplayDate(exam.publishDate)}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // EVALUATION RESULT & ONLINE CERTIFICATE VIEW
  if (result) {
    const effectiveExamPublishDate =
      result.examPublishDate || selectedExam?.publishDate || '';
    const isCertDownloadable =
      !effectiveExamPublishDate || todayBangkok >= effectiveExamPublishDate;

    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-10 px-4 space-y-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span>ผู้เข้าสอบ: {result.studentName}</span>
                <span aria-hidden="true">·</span>
                <span>ตำแหน่ง/สถานะ: {result.memberRole}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance">
                ผลการประเมิน: {result.examTitle}
              </h1>
              {sheetSaveNote && (
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                  <span>{sheetSaveNote}</span>
                  {integrationSettings.spreadsheetUrl && (
                    <a
                      href={integrationSettings.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#0284c7] hover:underline whitespace-nowrap"
                    >
                      <span>เปิดดู Google Sheets</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <div className="text-right">
                <p className="text-xs text-slate-500">คะแนนที่ได้</p>
                <p className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                  {result.percentage}%
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-500">
                  ตอบถูก {result.score} / {result.totalQuestions} ข้อ
                </p>
              </div>

              <div className="pl-6 border-l border-slate-200">
                {result.passed ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-6 h-6 shrink-0" />
                    <div>
                      <p className="text-base font-bold whitespace-nowrap">ผ่านเกณฑ์</p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">เกณฑ์ขั้นต่ำ 80%</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-rose-700">
                    <XCircle className="w-6 h-6 shrink-0" />
                    <div>
                      <p className="text-base font-bold whitespace-nowrap">ไม่ผ่านเกณฑ์</p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">ต้องได้ 80% ขึ้นไป</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {result.passed
                ? isCertDownloadable
                  ? 'คุณผ่านเกณฑ์การประเมิน สามารถตรวจสอบความถูกต้องและดาวน์โหลดเกียรติบัตรด้านล่างได้ทันที'
                  : `คุณผ่านเกณฑ์การประเมิน เกียรติบัตรจะเปิดให้ตรวจสอบและดาวน์โหลดตามวันเผยแพร่ข้อสอบ (${formatThaiDisplayDate(effectiveExamPublishDate)})`
                : 'คะแนนยังไม่ถึงเกณฑ์ร้อยละ 80 สามารถกดทำแบบทดสอบใหม่อีกครั้งได้'}
            </p>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStartExam(selectedExam)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>ทำข้อสอบชุดนี้อีกครั้ง</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedExam(null);
                  setShuffledQuestions([]);
                  setResult(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                เลือกชุดข้อสอบอื่น
              </button>
            </div>
          </div>
        </div>

        {result.passed && (
          isCertDownloadable ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                <h2 className="text-lg font-bold text-slate-900">
                  เกียรติบัตรของคุณ
                </h2>
                {result.certificatePublishDate && (
                  <p className="text-xs text-slate-500 tabular-nums">
                    วันที่ระบุในเกียรติบัตร:{' '}
                    {formatThaiDisplayDate(result.certificatePublishDate)}
                  </p>
                )}
              </div>
              <CertificateCard
                submission={result}
                memberPin={member.pin}
                onSubmissionUpdated={(updated) => {
                  setResult(updated);
                  setMyHistory((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item))
                  );
                }}
              />
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-3.5">
              <Calendar className="w-5 h-5 text-[#0f2942] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  เปิดให้ดาวน์โหลดเกียรติบัตรในวันเผยแพร่ข้อสอบ ({formatThaiDisplayDate(effectiveExamPublishDate)})
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  ระบบบันทึกผลการสอบผ่านของคุณเรียบร้อยแล้ว คุณสามารถกลับมาที่เมนู &ldquo;ประวัติและเกียรติบัตรของฉัน&rdquo; เพื่อตรวจสอบและดาวน์โหลดเกียรติบัตรได้ตั้งแต่วันที่เผยแพร่ข้อสอบ โดยวันที่ในเกียรติบัตรจะระบุตามที่กำหนดไว้คือ ให้ไว้ ณ วันที่ {formatThaiDisplayDate(result.certificatePublishDate)}
                </p>
              </div>
            </div>
          )
        )}
      </div>
    );
  }

  // ACTIVE EXAM TAKING VIEW (Questions are shuffled per attempt; displayed numbers remain 1..N)
  const examQuestionList =
    shuffledQuestions.length > 0 ? shuffledQuestions : selectedExam.questions;
  const totalQuestions = examQuestionList.length;
  const answeredCount = Object.keys(answers).length;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const activeQuestion = examQuestionList[currentIndex];

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-4">
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedExam(null);
              setShuffledQuestions([]);
            }}
            className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>เปลี่ยนชุดข้อสอบ</span>
          </button>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDisplayMode(ExamDisplayMode.STEP_BY_STEP)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                displayMode === ExamDisplayMode.STEP_BY_STEP
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              แสดงทีละข้อ
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode(ExamDisplayMode.ALL_AT_ONCE)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                displayMode === ExamDisplayMode.ALL_AT_ONCE
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              แสดงทั้งหมดในหน้าเดียว
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 text-balance">
                {selectedExam.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1 tabular-nums">
                <span>ผู้เข้าสอบ: {member.displayName}</span>
                <span aria-hidden="true">·</span>
                <span>สถานะ: {member.memberRole}</span>
                <span aria-hidden="true">·</span>
                <span>เกณฑ์ผ่าน {selectedExam.passingPercent}%</span>
                <span aria-hidden="true">·</span>
                <span>สุ่มลำดับคำถามอัตโนมัติ</span>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                ตอบแล้ว {answeredCount} / {totalQuestions} ข้อ ({progressPercent}%)
              </span>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0f2942] transition-transform duration-200 origin-left"
              style={{ transform: `scaleX(${progressPercent / 100})` }}
            />
          </div>
        </div>
      </div>

      {displayMode === ExamDisplayMode.STEP_BY_STEP && activeQuestion && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {examQuestionList.map((q, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = typeof answers[q.id] === 'number';
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-9 h-9 text-xs font-mono font-semibold rounded-lg border transition-colors tabular-nums ${
                    isCurrent
                      ? 'bg-[#0f2942] text-white border-[#0f2942]'
                      : isAnswered
                      ? 'bg-sky-50 text-[#0f2942] border-sky-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            <p className="text-xs font-mono font-semibold text-slate-500 tabular-nums mb-2">
              คำถามข้อที่ {currentIndex + 1} จาก {totalQuestions}
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed mb-6">
              {activeQuestion.text}
            </h2>

            <div className="space-y-3">
              {activeQuestion.options.map((optText, optIdx) => {
                const isSelected = answers[activeQuestion.id] === optIdx;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(activeQuestion.id, optIdx)}
                    className={`w-full text-left min-h-[52px] px-4 py-3.5 rounded-lg border flex items-start gap-3.5 transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 border-[#0f2942] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-[#0f2942] text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {CHOICE_LABELS[optIdx]}
                    </span>
                    <span className="text-sm sm:text-base font-medium leading-relaxed">
                      {optText}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ข้อก่อนหน้า</span>
              </button>

              {currentIndex < totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))
                  }
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>ข้อถัดไป</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleRequestSubmit}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'กำลังตรวจคำตอบ...' : 'ส่งคำตอบและตรวจผลสอบ'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {displayMode === ExamDisplayMode.ALL_AT_ONCE && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {examQuestionList.map((question, qIdx) => (
              <div key={question.id} className="p-6 sm:p-8">
                <p className="text-xs font-mono font-semibold text-slate-500 tabular-nums mb-2">
                  ข้อที่ {qIdx + 1} จาก {totalQuestions}
                </p>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed mb-4">
                  {question.text}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {question.options.map((optText, optIdx) => {
                    const isSelected = answers[question.id] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectOption(question.id, optIdx)}
                        className={`text-left min-h-[50px] px-4 py-3 rounded-lg border flex items-start gap-3 transition-colors ${
                          isSelected
                            ? 'bg-sky-50/70 border-[#0f2942] text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-[#0f2942] text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {CHOICE_LABELS[optIdx]}
                        </span>
                        <span className="text-sm font-medium leading-relaxed">{optText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={handleRequestSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'กำลังตรวจคำตอบ...' : 'ส่งคำตอบและตรวจผลสอบ'}</span>
            </button>
          </div>
        </div>
      )}

      {confirmUnanswered && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5 text-sm text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <p className="font-semibold">
                คุณยังตอบคำถามไม่ครบทุกข้อ (ตอบแล้ว {answeredCount} จาก {totalQuestions} ข้อ)
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                ยืนยันที่จะส่งกระดาษคำตอบเลยหรือไม่? ข้อที่ไม่ได้เลือกจะได้ 0 คะแนน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmUnanswered(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              กลับไปทำต่อ
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={executeSubmitExam}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 whitespace-nowrap"
            >
              ยืนยันส่งคำตอบ
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}
    </div>
  );
};
