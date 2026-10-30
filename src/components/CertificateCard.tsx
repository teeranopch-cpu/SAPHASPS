import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileText,
  CheckCircle2,
  Eye,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  CertificateLayoutConfig,
  DEFAULT_CERTIFICATE_CONFIG,
  SubmissionRecord,
} from '../types';
import {
  buildSubmissionRenderPayload,
  downloadCertificateAsPdf,
  downloadCertificateAsPng,
  drawCertificateOntoCanvas,
  formatThaiCeremonialDate,
  getBangkokDateString,
  loadImageElement,
  renderCustomCertificateCanvas,
} from '../utils/certificateRenderer';
import { parseJsonResponse } from '../utils/apiJson';

interface CertificateCardProps {
  submission: SubmissionRecord;
  memberPin?: string;
  adminToken?: string;
  onSubmissionUpdated?: (updated: SubmissionRecord) => void;
}

export const CertificateCard: React.FC<CertificateCardProps> = ({
  submission,
  memberPin,
  adminToken,
  onSubmissionUpdated,
}) => {
  const [localSubmission, setLocalSubmission] = useState<SubmissionRecord>(submission);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [downloadingType, setDownloadingType] = useState<'png' | 'pdf' | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  // Pre-Download Certificate Inspection & Verification Modal State
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [preferredFormat, setPreferredFormat] = useState<'png' | 'pdf'>('pdf');
  const [editedName, setEditedName] = useState<string>(submission.studentName);
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string>('');
  const [verifiedChecked, setVerifiedChecked] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [nameSavedFeedback, setNameSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setLocalSubmission(submission);
    setEditedName(submission.studentName);
  }, [submission]);

  // Render main card certificate preview
  useEffect(() => {
    let active = true;
    renderCustomCertificateCanvas(buildSubmissionRenderPayload(localSubmission))
      .then((canvas) => {
        if (active) {
          setPreviewUrl(canvas.toDataURL('image/png', 0.92));
        }
      })
      .catch(() => {
        if (active) setPreviewUrl('');
      });
    return () => {
      active = false;
    };
  }, [localSubmission]);

  // Render live preview inside the verification modal whenever editedName changes
  useEffect(() => {
    if (!verifyModalOpen) return;
    let active = true;
    const draftSubmission: SubmissionRecord = {
      ...localSubmission,
      studentName: editedName.trim() || localSubmission.studentName,
    };
    renderCustomCertificateCanvas(buildSubmissionRenderPayload(draftSubmission))
      .then((canvas) => {
        if (active) {
          setModalPreviewUrl(canvas.toDataURL('image/png', 0.92));
        }
      })
      .catch(() => {
        if (active) setModalPreviewUrl(previewUrl);
      });
    return () => {
      active = false;
    };
  }, [verifyModalOpen, editedName, localSubmission, previewUrl]);

  const openVerificationModal = (format: 'png' | 'pdf') => {
    setPreferredFormat(format);
    setEditedName(localSubmission.studentName);
    setModalPreviewUrl(previewUrl);
    setVerifiedChecked(false);
    setModalError(null);
    setNameSavedFeedback(null);
    setVerifyModalOpen(true);
  };

  const persistStudentNameIfChanged = async (): Promise<SubmissionRecord> => {
    const cleanName = editedName.trim();
    if (!cleanName) {
      throw new Error('กรุณาระบุชื่อ-นามสกุลผู้รับเกียรติบัตร');
    }
    if (cleanName === localSubmission.studentName) {
      return localSubmission;
    }

    setSavingName(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (adminToken) {
        headers['x-admin-token'] = adminToken;
      }

      const res = await fetch(`/api/submissions/${localSubmission.id}/student-name`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          studentName: cleanName,
          memberPin,
        }),
      });
      const data = await parseJsonResponse<{
        submission: SubmissionRecord;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถอัปเดตชื่อบนเกียรติบัตรได้');
      }

      const updated: SubmissionRecord = data.submission;
      setLocalSubmission(updated);
      if (onSubmissionUpdated) {
        onSubmissionUpdated(updated);
      }
      setNameSavedFeedback('บันทึกชื่อ-นามสกุลบนเกียรติบัตรเรียบร้อยแล้ว');
      return updated;
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveNameOnly = async () => {
    setModalError(null);
    setNameSavedFeedback(null);
    try {
      await persistStudentNameIfChanged();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'ไม่สามารถบันทึกชื่อ-นามสกุลได้'
      );
    }
  };

  const handleVerifiedDownload = async (format: 'png' | 'pdf') => {
    if (!verifiedChecked) {
      setModalError('กรุณาติ๊กยืนยันว่าได้ตรวจสอบข้อมูลในเกียรติบัตรถูกต้องแล้วก่อนดาวน์โหลด');
      return;
    }

    setModalError(null);
    setDownloadingType(format);
    setDownloadFeedback(null);

    try {
      const finalSubmission = await persistStudentNameIfChanged();
      if (format === 'png') {
        await downloadCertificateAsPng(finalSubmission);
        setDownloadFeedback('ตรวจสอบและดาวน์โหลดไฟล์รูปภาพเกียรติบัตร (.PNG) เรียบร้อยแล้ว');
      } else {
        await downloadCertificateAsPdf(finalSubmission);
        setDownloadFeedback('ตรวจสอบและดาวน์โหลดเอกสารเกียรติบัตร (.PDF) เรียบร้อยแล้ว');
      }
      setVerifyModalOpen(false);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างไฟล์เกียรติบัตร'
      );
    } finally {
      setDownloadingType(null);
    }
  };

  const ceremonialCertDate = formatThaiCeremonialDate(
    localSubmission.certificatePublishDate || localSubmission.submittedAt
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`เกียรติบัตรของ ${localSubmission.studentName}`}
            referrerPolicy="no-referrer"
            className="w-full h-auto rounded-lg block select-none"
          />
        ) : (
          <div className="aspect-[1.414/1] w-full bg-slate-50 rounded-lg flex items-center justify-center text-sm text-slate-500">
            กำลังจัดเตรียมเกียรติบัตร...
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          {downloadFeedback ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{downloadFeedback}</span>
            </span>
          ) : (
            <span>
              ระบบจะให้ตรวจสอบความถูกต้องของชื่อ-นามสกุลและวันที่บนเกียรติบัตรก่อนดาวน์โหลดไฟล์ (.PNG / .PDF)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => openVerificationModal('png')}
            disabled={downloadingType !== null}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>ตรวจสอบและดาวน์โหลด (PNG)</span>
          </button>

          <button
            type="button"
            onClick={() => openVerificationModal('pdf')}
            disabled={downloadingType !== null}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            <span>ตรวจสอบและดาวน์โหลด (PDF)</span>
          </button>
        </div>
      </div>

      {/* Pre-Download Certificate Inspection & Verification Modal */}
      {verifyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full p-5 sm:p-7 space-y-5 my-8 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums mb-1">
                  <Eye className="w-3.5 h-3.5 text-[#0f2942]" />
                  <span>ขั้นตอนตรวจสอบความถูกต้องก่อนดาวน์โหลดเกียรติบัตร</span>
                  {localSubmission.certificateNo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{localSubmission.certificateNo}</span>
                    </>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  ตรวจสอบรายละเอียดบนเกียรติบัตรของคุณ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifyModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                aria-label="ปิดหน้าต่างตรวจสอบเกียรติบัตร"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Live High-Res Certificate Inspection Preview */}
              <div className="lg:col-span-7 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  ตัวอย่างเกียรติบัตรที่จะบันทึกลงอุปกรณ์ของคุณ
                </p>
                <div className="bg-slate-100 border border-slate-300 rounded-lg p-2">
                  {modalPreviewUrl ? (
                    <img
                      src={modalPreviewUrl}
                      alt={`ตัวอย่างเกียรติบัตรของ ${editedName}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto rounded block select-none"
                    />
                  ) : (
                    <div className="aspect-[1.414/1] w-full bg-white rounded flex items-center justify-center text-sm text-slate-500">
                      กำลังแสดงผลตัวอย่างเกียรติบัตร...
                    </div>
                  )}
                </div>
              </div>

              {/* Right: 4-Field Verification Checklist & Name Correction */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                  <div>
                    <label
                      htmlFor="verify-cert-student-name"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      1. ชื่อ-นามสกุลผู้รับเกียรติบัตร (แก้ไขคำสะกดได้หากพิมพ์ผิด)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="verify-cert-student-name"
                        type="text"
                        value={editedName}
                        onChange={(e) => {
                          setEditedName(e.target.value);
                          setNameSavedFeedback(null);
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f2942]"
                      />
                      {editedName.trim() !== localSubmission.studentName && (
                        <button
                          type="button"
                          disabled={savingName || !editedName.trim()}
                          onClick={handleSaveNameOnly}
                          className="px-3 py-2 text-xs font-semibold text-white bg-[#0f2942] rounded-lg hover:bg-[#163a5c] disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {savingName ? 'กำลังบันทึก...' : 'อัปเดตชื่อ'}
                        </button>
                      )}
                    </div>
                    {nameSavedFeedback && (
                      <p className="mt-1.5 text-xs text-emerald-700 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{nameSavedFeedback}</span>
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 space-y-2.5 text-xs">
                    <div>
                      <p className="text-slate-500">2. ชื่อแบบทดสอบ</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {localSubmission.examTitle}
                      </p>
                    </div>

                    <div className="pt-1">
                      <p className="text-slate-500">
                        3. วันที่ในเกียรติบัตร (ตามวันที่ที่กำหนดไว้ของชุดข้อสอบ)
                      </p>
                      <p className="text-sm font-semibold text-[#0f2942] mt-0.5">
                        {ceremonialCertDate}
                      </p>
                    </div>

                    <div className="pt-1">
                      <p className="text-slate-500">4. ตำแหน่ง / สถานะ</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {localSubmission.memberRole || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-300 bg-white cursor-pointer hover:bg-slate-50/70 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={verifiedChecked}
                    onChange={(e) => {
                      setVerifiedChecked(e.target.checked);
                      if (e.target.checked) setModalError(null);
                    }}
                    className="mt-0.5 w-4 h-4 accent-[#0f2942] rounded cursor-pointer shrink-0"
                  />
                  <span className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
                    ข้าพเจ้าได้ตรวจสอบชื่อ-นามสกุล ชื่อแบบทดสอบ และวันที่ในเกียรติบัตรถูกต้องครบถ้วนแล้ว
                  </span>
                </label>

                {modalError && (
                  <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{modalError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                ติ๊กยืนยันการตรวจสอบข้อมูลด้านขวาเพื่อเปิดปุ่มดาวน์โหลดไฟล์เกียรติบัตร
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  disabled={!verifiedChecked || downloadingType !== null || savingName}
                  onClick={() => handleVerifiedDownload('png')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-45 whitespace-nowrap ${
                    preferredFormat === 'png'
                      ? 'text-white bg-[#0f2942] hover:bg-[#163a5c]'
                      : 'text-slate-800 bg-white border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {downloadingType === 'png'
                      ? 'กำลังสร้างไฟล์ PNG...'
                      : 'ยืนยันและดาวน์โหลด PNG'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!verifiedChecked || downloadingType !== null || savingName}
                  onClick={() => handleVerifiedDownload('pdf')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-45 whitespace-nowrap ${
                    preferredFormat === 'pdf'
                      ? 'text-white bg-[#0f2942] hover:bg-[#163a5c]'
                      : 'text-slate-800 bg-white border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>
                    {downloadingType === 'pdf'
                      ? 'กำลังสร้างไฟล์ PDF...'
                      : 'ยืนยันและดาวน์โหลด PDF'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface TemplateLivePreviewProps {
  templateDataUrl: string;
  config: CertificateLayoutConfig;
  examTitleSample: string;
  certificatePublishDateSample?: string;
}

/**
 * Exact 60fps Canvas WYSIWYG Preview so font size, vertical position, and
 * certificate publish date match the final exported PNG/PDF pixel-for-pixel.
 */
export const CertificateTemplateLivePreview: React.FC<TemplateLivePreviewProps> = ({
  templateDataUrl,
  config,
  examTitleSample,
  certificatePublishDateSample,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    loadImageElement(templateDataUrl).then((img) => {
      if (active) setLoadedImg(img);
    });
    return () => {
      active = false;
    };
  }, [templateDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cfg = { ...DEFAULT_CERTIFICATE_CONFIG, ...config };
    const effectiveDate = certificatePublishDateSample || getBangkokDateString();
    drawCertificateOntoCanvas(
      canvas,
      loadedImg,
      {
        certificateTemplate: templateDataUrl,
        certificateConfig: cfg,
        studentName: 'เด็กชายธนกฤต รัตนโชติ',
        examTitle: examTitleSample.trim() || 'ชื่อชุดข้อสอบจะปรากฏบริเวณนี้',
        dateText: formatThaiCeremonialDate(effectiveDate),
      },
      1200
    );
  }, [loadedImg, templateDataUrl, config, examTitleSample, certificatePublishDateSample]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-100 select-none">
      <canvas ref={canvasRef} className="w-full h-auto block" />
    </div>
  );
};
