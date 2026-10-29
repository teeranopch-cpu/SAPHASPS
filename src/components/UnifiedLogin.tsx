import React, { useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';

interface UnifiedLoginProps {
  onStudentLogin: (fullName: string, studentCode: string) => void;
  onAdminLoginSuccess: (adminToken: string) => void;
}

export const UnifiedLogin: React.FC<UnifiedLoginProps> = ({
  onStudentLogin,
  onAdminLoginSuccess,
}) => {
  const [identityInput, setIdentityInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentity = identityInput.trim();
    const trimmedCode = codeInput.trim();

    // Admin login: ชื่อ = "00000" และ รหัส = "00000"
    if (trimmedIdentity === '00000' && trimmedCode === '00000') {
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '00000', password: '00000' }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'เข้าสู่ระบบแอดมินไม่สำเร็จ');
        }
        onAdminLoginSuccess(data.adminToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (trimmedIdentity === '00000' || trimmedCode === '00000') {
      setError('สำหรับผู้ดูแลระบบ กรุณากรอกทั้งชื่อและรหัสเป็น 00000');
      return;
    }

    if (!trimmedIdentity) {
      setError('กรุณากรอกชื่อ-นามสกุลผู้เข้าสอบ');
      return;
    }

    if (!/^\d{5}$/.test(trimmedCode)) {
      setError('กรุณากรอกเลขประจำตัวนักเรียนเป็นตัวเลข 5 หลัก');
      return;
    }

    onStudentLogin(trimmedIdentity, trimmedCode);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            เข้าสู่ระบบสอบออนไลน์
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            กรอกชื่อ-นามสกุล และเลขประจำตัว 5 หลักเพื่อเข้าทำแบบทดสอบ
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="unified-identity"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              ชื่อ-นามสกุล
            </label>
            <input
              id="unified-identity"
              type="text"
              value={identityInput}
              onChange={(e) => setIdentityInput(e.target.value)}
              placeholder="เช่น นายณัฐภัทร ศิริวัฒน์"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="unified-code"
                className="block text-sm font-semibold text-slate-800"
              >
                เลขประจำตัว 5 หลัก
              </label>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {codeInput.length}/5 หลัก
              </span>
            </div>
            <input
              id="unified-code"
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="กรอกตัวเลข 5 หลัก"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums tracking-wider bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50/70 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <span>{submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
