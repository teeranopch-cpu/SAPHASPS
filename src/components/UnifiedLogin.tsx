import React, { useState } from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, UserPlus, LogIn } from 'lucide-react';
import { MemberProfile } from '../types';
import { parseJsonResponse } from '../utils/apiJson';

interface UnifiedLoginProps {
  onMemberLogin: (member: MemberProfile) => void;
  onAdminLoginSuccess: (adminToken: string) => void;
}

const PREFIX_OPTIONS = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง', 'อื่นๆ'] as const;
const ROLE_OPTIONS = [
  'นักเรียน',
  'ครู',
  'บุคลากรทางการศึกษา',
  'ผู้บริหารสถานศึกษา',
  'นักศึกษา',
  'บุคคลทั่วไป',
  'อื่นๆ',
] as const;

type AuthMode = 'login' | 'register';

export const UnifiedLogin: React.FC<UnifiedLoginProps> = ({
  onMemberLogin,
  onAdminLoginSuccess,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');

  // Login State
  const [loginPrefixSelect, setLoginPrefixSelect] = useState<string>('นาย');
  const [loginCustomPrefix, setLoginCustomPrefix] = useState<string>('');
  const [loginFullName, setLoginFullName] = useState<string>('');
  const [loginPin, setLoginPin] = useState<string>('');

  // Register State
  const [regPrefixSelect, setRegPrefixSelect] = useState<string>('นาย');
  const [regCustomPrefix, setRegCustomPrefix] = useState<string>('');
  const [regFullName, setRegFullName] = useState<string>('');
  const [regRoleSelect, setRegRoleSelect] = useState<string>('นักเรียน');
  const [regCustomRole, setRegCustomRole] = useState<string>('');
  const [regPin, setRegPin] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    if (nextMode === 'register') {
      setSuccessInfo(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    const trimmedPin = loginPin.trim();
    if (!/^\d{6}$/.test(trimmedPin)) {
      setError('กรุณากรอกรหัส PIN เป็นตัวเลข 6 หลัก');
      return;
    }

    // Admin login with PIN 000000
    if (trimmedPin === '000000') {
      setSubmitting(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '000000' }),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          role?: string;
          adminToken?: string;
          error?: string;
        }>(res);
        if (!res.ok || !data.ok || !data.adminToken) {
          throw new Error(data.error || 'เข้าสู่ระบบผู้ดูแลระบบไม่สำเร็จ');
        }
        onAdminLoginSuccess(data.adminToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const effectivePrefix =
      loginPrefixSelect === 'อื่นๆ' ? loginCustomPrefix.trim() : loginPrefixSelect.trim();
    const trimmedName = loginFullName.trim();

    if (!effectivePrefix) {
      setError('กรุณาเลือกหรือระบุคำนำหน้าชื่อ');
      return;
    }
    if (!trimmedName) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: effectivePrefix,
          fullName: trimmedName,
          pin: trimmedPin,
        }),
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        role?: 'admin' | 'member';
        adminToken?: string;
        member?: MemberProfile;
        error?: string;
      }>(res);

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง');
      }

      if (data.role === 'admin' && data.adminToken) {
        onAdminLoginSuccess(data.adminToken);
        return;
      }

      if (data.member) {
        onMemberLogin(data.member);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    const effectivePrefix =
      regPrefixSelect === 'อื่นๆ' ? regCustomPrefix.trim() : regPrefixSelect.trim();
    const trimmedName = regFullName.trim();
    const effectiveRole =
      regRoleSelect === 'อื่นๆ' ? regCustomRole.trim() : regRoleSelect.trim();
    const trimmedPin = regPin.trim();

    if (!effectivePrefix) {
      setError('กรุณาเลือกหรือระบุคำนำหน้าชื่อ');
      return;
    }
    if (!trimmedName) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!effectiveRole) {
      setError('กรุณาเลือกหรือระบุตำแหน่ง/สถานะ เช่น ครู หรือ นักเรียน');
      return;
    }
    if (!/^\d{6}$/.test(trimmedPin)) {
      setError('กรุณาตั้งรหัส PIN เป็นตัวเลข 6 หลัก');
      return;
    }
    if (trimmedPin === '000000') {
      setError('รหัส PIN 000000 สงวนไว้สำหรับผู้ดูแลระบบ กรุณาตั้งรหัส PIN อื่น');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/members/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: effectivePrefix,
          fullName: trimmedName,
          memberRole: effectiveRole,
          pin: trimmedPin,
        }),
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        member?: MemberProfile;
        error?: string;
      }>(res);

      if (!res.ok || !data.ok || !data.member) {
        throw new Error(data.error || 'ไม่สามารถสมัครสมาชิกได้');
      }

      // Pre-fill login fields with registered details and switch to Login tab
      const registered = data.member;
      if ((PREFIX_OPTIONS as readonly string[]).includes(registered.prefix) && registered.prefix !== 'อื่นๆ') {
        setLoginPrefixSelect(registered.prefix);
        setLoginCustomPrefix('');
      } else {
        setLoginPrefixSelect('อื่นๆ');
        setLoginCustomPrefix(registered.prefix);
      }
      setLoginFullName(registered.nameBody);
      setLoginPin(registered.pin);

      setRegFullName('');
      setRegPin('');
      setMode('login');
      setSuccessInfo(
        `สมัครสมาชิกสำเร็จ (${registered.displayName} · ${registered.memberRole}) กดปุ่ม "เข้าสู่ระบบ" ด้านล่างเพื่อเข้าใช้งานได้ทันที`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสมัครสมาชิกได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
        {/* Top Segmented Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`inline-flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-white text-[#0f2942] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>เข้าสู่ระบบ</span>
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`inline-flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-white text-[#0f2942] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>สมัครสมาชิก</span>
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                เข้าสู่ระบบสอบออนไลน์
              </h1>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                เลือกคำนำหน้าชื่อ กรอกชื่อ-นามสกุล และรหัส PIN 6 หลักที่ลงทะเบียนไว้ (หากยังไม่มีบัญชี กรุณาสมัครสมาชิกก่อน)
              </p>
            </div>

            {successInfo && (
              <div className="mb-5 flex items-start gap-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                <span>{successInfo}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="login-prefix"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    คำนำหน้าชื่อ
                  </label>
                  <select
                    id="login-prefix"
                    value={loginPrefixSelect}
                    onChange={(e) => setLoginPrefixSelect(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                  >
                    {PREFIX_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-7">
                  <label
                    htmlFor="login-fullname"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    ชื่อ - นามสกุล
                  </label>
                  <input
                    id="login-fullname"
                    type="text"
                    value={loginFullName}
                    onChange={(e) => setLoginFullName(e.target.value)}
                    placeholder="เช่น ณัฐภัทร ศิริวัฒน์"
                    autoComplete="name"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                  />
                </div>
              </div>

              {loginPrefixSelect === 'อื่นๆ' && (
                <div>
                  <label
                    htmlFor="login-custom-prefix"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    ระบุคำนำหน้าชื่อ
                  </label>
                  <input
                    id="login-custom-prefix"
                    type="text"
                    value={loginCustomPrefix}
                    onChange={(e) => setLoginCustomPrefix(e.target.value)}
                    placeholder="เช่น ว่าที่ร้อยตรี, ดร., ผศ."
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-pin"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    รหัส PIN 6 หลัก
                  </label>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {loginPin.length}/6 หลัก
                  </span>
                </div>
                <input
                  id="login-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="กรอกรหัส PIN ตัวเลข 6 หลัก"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums tracking-widest bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
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
                <span>{submitting ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-2 text-center text-xs text-slate-600">
                ยังไม่มีบัญชีผู้ใช้งานใช่หรือไม่?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-[#0284c7] hover:underline"
                >
                  สมัครสมาชิกที่นี่
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                สมัครสมาชิกผู้เข้าสอบ
              </h1>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                ลงทะเบียนคำนำหน้าชื่อ ชื่อ-นามสกุล ตำแหน่ง/สถานะ และตั้งรหัส PIN 6 หลักส่วนตัว (ห้ามซ้ำกับผู้อื่น)
              </p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="reg-prefix"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    คำนำหน้าชื่อ *
                  </label>
                  <select
                    id="reg-prefix"
                    value={regPrefixSelect}
                    onChange={(e) => setRegPrefixSelect(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                  >
                    {PREFIX_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-7">
                  <label
                    htmlFor="reg-fullname"
                    className="block text-sm font-semibold text-slate-800 mb-1.5"
                  >
                    ชื่อ - นามสกุล *
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="เช่น ณัฐภัทร ศิริวัฒน์"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                  />
                </div>
              </div>

              {regPrefixSelect === 'อื่นๆ' && (
                <div>
                  <label
                    htmlFor="reg-custom-prefix"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    ระบุคำนำหน้าชื่อ *
                  </label>
                  <input
                    id="reg-custom-prefix"
                    type="text"
                    required
                    value={regCustomPrefix}
                    onChange={(e) => setRegCustomPrefix(e.target.value)}
                    placeholder="เช่น ว่าที่ร้อยตรี, ดร., ผศ."
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="reg-role"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  ตำแหน่ง / สถานะ *
                </label>
                <select
                  id="reg-role"
                  value={regRoleSelect}
                  onChange={(e) => setRegRoleSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {regRoleSelect === 'อื่นๆ' && (
                <div>
                  <label
                    htmlFor="reg-custom-role"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    ระบุตำแหน่ง / สถานะ *
                  </label>
                  <input
                    id="reg-custom-role"
                    type="text"
                    required
                    value={regCustomRole}
                    onChange={(e) => setRegCustomRole(e.target.value)}
                    placeholder="เช่น ศึกษานิเทศก์, ผู้ปกครอง"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="reg-pin"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    ตั้งรหัส PIN 6 หลัก (ห้ามซ้ำกับผู้อื่น) *
                  </label>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {regPin.length}/6 หลัก
                  </span>
                </div>
                <input
                  id="reg-pin"
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="ตั้งตัวเลข 6 หลัก เช่น 284915"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums tracking-widest bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[#0f2942] focus:border-[#0f2942]"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  กรุณาจดจำรหัส PIN 6 หลักนี้ไว้ใช้คู่กับคำนำหน้าชื่อและชื่อ-นามสกุลเมื่อเข้าสู่ระบบ
                </p>
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
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? 'กำลังบันทึกข้อมูลสมาชิก...' : 'ยืนยันการสมัครสมาชิก'}</span>
              </button>

              <div className="pt-2 text-center text-xs text-slate-600">
                เป็นสมาชิกอยู่แล้ว?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-[#0284c7] hover:underline"
                >
                  กลับไปหน้าเข้าสู่ระบบ
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
