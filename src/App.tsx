import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AdminTab,
  ExamSet,
  IntegrationSettings,
  StudentTab,
} from './types';
import { initGoogleAuth } from './services/googleSheetsService';
import { UnifiedLogin } from './components/UnifiedLogin';
import { StudentPortal } from './components/StudentPortal';
import { AdminPortal } from './components/AdminPortal';
import { parseJsonResponse } from './utils/apiJson';

type ActiveSession =
  | { role: 'student'; fullName: string; studentCode: string }
  | { role: 'admin'; adminToken: string }
  | null;

export default function App() {
  const [session, setSession] = useState<ActiveSession>(null);
  const [studentTab, setStudentTab] = useState<StudentTab>(StudentTab.EXAMS);
  const [adminTab, setAdminTab] = useState<AdminTab>(AdminTab.EXAMS);

  const [exams, setExams] = useState<ExamSet[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);

  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>({
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: '',
    sheetTabName: '',
    appsScriptWebhookUrl: '',
  });

  const refreshGlobalData = useCallback(async () => {
    setLoadingExams(true);
    try {
      const [examsRes, settingsRes] = await Promise.all([
        fetch('/api/exams'),
        fetch('/api/settings'),
      ]);
      if (examsRes.ok) {
        const d = await parseJsonResponse<{ exams?: ExamSet[] }>(examsRes);
        setExams(d.exams || []);
      }
      if (settingsRes.ok) {
        const d = await parseJsonResponse<{ settings?: IntegrationSettings }>(settingsRes);
        if (d.settings) setIntegrationSettings(d.settings);
      }
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => {
    refreshGlobalData();
  }, [refreshGlobalData]);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(true);
      },
      () => {
        setGoogleUser(null);
        setHasGoogleToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    setSession(null);
    setStudentTab(StudentTab.EXAMS);
    setAdminTab(AdminTab.EXAMS);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      {/* Strict 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <span className="text-lg font-bold tracking-tight text-[#0f2942] whitespace-nowrap shrink-0">
            SAPHA SPS
          </span>

          {/* Zone 2: Context Navigation Links (Only shown once logged in) */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            {session?.role === 'student' && (
              <>
                <button
                  type="button"
                  onClick={() => setStudentTab(StudentTab.EXAMS)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                    studentTab === StudentTab.EXAMS
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#0f2942]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  ชุดข้อสอบทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setStudentTab(StudentTab.HISTORY)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                    studentTab === StudentTab.HISTORY
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#0f2942]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  ประวัติและเกียรติบัตรของฉัน
                </button>
              </>
            )}

            {session?.role === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={() => setAdminTab(AdminTab.EXAMS)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                    adminTab === AdminTab.EXAMS
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#0f2942]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  จัดการชุดข้อสอบ
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab(AdminTab.SUBMISSIONS)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                    adminTab === AdminTab.SUBMISSIONS
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#0f2942]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  ผลการสอบนักเรียน
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab(AdminTab.SHEETS)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                    adminTab === AdminTab.SHEETS
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#0f2942]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  เชื่อมต่อ Google Sheets
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            {session ? (
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                ออกจากระบบ
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                กรุณาเข้าสู่ระบบก่อนใช้งาน
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {!session && (
          <UnifiedLogin
            onStudentLogin={(fullName, studentCode) => {
              setStudentTab(StudentTab.EXAMS);
              setSession({ role: 'student', fullName, studentCode });
            }}
            onAdminLoginSuccess={(adminToken) => {
              setAdminTab(AdminTab.EXAMS);
              setSession({ role: 'admin', adminToken });
            }}
          />
        )}

        {session?.role === 'student' && (
          <StudentPortal
            studentName={session.fullName}
            studentCode={session.studentCode}
            activeTab={studentTab}
            onChangeTab={setStudentTab}
            exams={exams}
            loadingExams={loadingExams}
            integrationSettings={integrationSettings}
            onSubmissionComplete={refreshGlobalData}
          />
        )}

        {session?.role === 'admin' && (
          <AdminPortal
            adminToken={session.adminToken}
            activeTab={adminTab}
            onChangeTab={setAdminTab}
            googleUser={googleUser}
            hasGoogleToken={hasGoogleToken}
            onGoogleAuthUpdate={(user, hasToken) => {
              setGoogleUser(user);
              setHasGoogleToken(hasToken);
            }}
            integrationSettings={integrationSettings}
            onRefreshGlobalData={refreshGlobalData}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} SAPHA SPS — ระบบสอบออนไลน์และออกเกียรติบัตรอัตโนมัติ</p>
          {session?.role === 'student' && (
            <div className="flex items-center gap-4 md:hidden">
              <button
                type="button"
                onClick={() => setStudentTab(StudentTab.EXAMS)}
                className="hover:text-slate-900 whitespace-nowrap"
              >
                ชุดข้อสอบ
              </button>
              <button
                type="button"
                onClick={() => setStudentTab(StudentTab.HISTORY)}
                className="hover:text-slate-900 whitespace-nowrap"
              >
                เกียรติบัตรของฉัน
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
