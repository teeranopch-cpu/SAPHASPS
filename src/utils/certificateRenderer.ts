import { jsPDF } from 'jspdf';
import {
  CertificateLayoutConfig,
  DEFAULT_CERTIFICATE_CONFIG,
  SubmissionRecord,
} from '../types';

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/**
 * Returns current YYYY-MM-DD calendar date in Thailand Standard Time (Asia/Bangkok)
 */
export function getBangkokDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseDateParts(dateOrIso: string): { day: number; monthIndex: number; year: number } {
  const trimmed = (dateOrIso || '').trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Math.min(11, Math.max(0, Number(match[2]) - 1));
    const day = Number(match[3]);
    return { day, monthIndex, year };
  }
  const d = new Date(trimmed);
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    day: valid.getDate(),
    monthIndex: valid.getMonth(),
    year: valid.getFullYear(),
  };
}

/**
 * Formats YYYY-MM-DD or ISO string into readable Thai date: "<วัน> <เดือน> พ.ศ. <ปี พ.ศ.>"
 */
export function formatThaiDisplayDate(dateOrIso: string): string {
  const { day, monthIndex, year } = parseDateParts(dateOrIso);
  return `${day} ${THAI_MONTHS[monthIndex]} พ.ศ. ${year + 543}`;
}

/**
 * Formats date explicitly for certificate line: "ให้ไว้ ณ วันที่ <วัน> <เดือน> พ.ศ. <ปี พ.ศ.>"
 */
export function formatThaiCeremonialDate(dateOrIso: string): string {
  return `ให้ไว้ ณ วันที่ ${formatThaiDisplayDate(dateOrIso)}`;
}

export function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function wrapThaiCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of Array.from(word)) {
          if (ctx.measureText(chunk + ch).width > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface CertificateRenderPayload {
  certificateTemplate: string;
  certificateConfig?: CertificateLayoutConfig;
  studentName: string;
  examTitle: string;
  scoreText: string;
  dateText: string;
}

export function readAndOptimizeTemplateImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
      img.onload = () => {
        const maxDim = 2000;
        let targetW = img.naturalWidth || 1600;
        let targetH = img.naturalHeight || 1131;
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        let resultDataUrl = canvas.toDataURL(outputType, 0.9);
        // Keep payload well under Vercel Serverless 4.5 MB request body limit
        if (resultDataUrl.length > 2_400_000) {
          resultDataUrl = canvas.toDataURL('image/jpeg', 0.86);
        }
        resolve(resultDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function drawCertificateOntoCanvas(
  canvas: HTMLCanvasElement,
  templateImg: HTMLImageElement | null,
  payload: CertificateRenderPayload,
  baseWidth = 2200
): void {
  const aspect =
    templateImg && templateImg.naturalWidth > 0 && templateImg.naturalHeight > 0
      ? templateImg.naturalHeight / templateImg.naturalWidth
      : 1 / Math.SQRT2;
  const width = baseWidth;
  const height = Math.round(baseWidth * aspect);

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  if (templateImg) {
    ctx.drawImage(templateImg, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#fdfcf8';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#0f2942';
    ctx.lineWidth = Math.max(4, Math.round(width * 0.006));
    const pad = Math.round(width * 0.03);
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
  }

  const cfg: CertificateLayoutConfig = {
    ...DEFAULT_CERTIFICATE_CONFIG,
    ...(payload.certificateConfig || {}),
  };

  const scaleFactor = height / 1131;
  const centerX = width / 2;
  const maxTextWidth = width * 0.84;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cfg.textColor || '#0f172a';

  // 1. ชื่อ-นามสกุล
  const namePx = Math.max(12, Math.round(cfg.nameSize * scaleFactor));
  ctx.font = `700 ${namePx}px "Sarabun", "IBM Plex Sans Thai", sans-serif`;
  ctx.fillText(payload.studentName, centerX, (cfg.nameY / 100) * height);

  // 2. ชื่อแบบทดสอบ
  const examPx = Math.max(10, Math.round(cfg.examTitleSize * scaleFactor));
  ctx.font = `600 ${examPx}px "Sarabun", "IBM Plex Sans Thai", sans-serif`;
  const examLines = wrapThaiCanvasText(ctx, payload.examTitle, maxTextWidth).slice(0, 2);
  const lineGap = examPx * 1.3;
  const examStartY =
    (cfg.examTitleY / 100) * height - ((examLines.length - 1) * lineGap) / 2;
  examLines.forEach((line, idx) => {
    ctx.fillText(line, centerX, examStartY + idx * lineGap);
  });

  // 3. คะแนนที่ได้
  const scorePx = Math.max(10, Math.round(cfg.scoreSize * scaleFactor));
  ctx.font = `600 ${scorePx}px "Sarabun", "IBM Plex Sans Thai", sans-serif`;
  ctx.fillText(payload.scoreText, centerX, (cfg.scoreY / 100) * height);

  // 4. ให้ไว้ ณ วันที่ เดือน พ.ศ. (ตรงกับวันที่เผยแพร่เกียรติบัตร)
  const datePx = Math.max(10, Math.round(cfg.dateSize * scaleFactor));
  ctx.font = `400 ${datePx}px "Sarabun", "IBM Plex Sans Thai", sans-serif`;
  ctx.fillText(payload.dateText, centerX, (cfg.dateY / 100) * height);
}

export async function renderCustomCertificateCanvas(
  payload: CertificateRenderPayload
): Promise<HTMLCanvasElement> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const templateImg = await loadImageElement(payload.certificateTemplate);
  const canvas = document.createElement('canvas');
  drawCertificateOntoCanvas(canvas, templateImg, payload, 2200);
  return canvas;
}

/**
 * Uses submission.certificatePublishDate so the certificate date always matches
 * the certificate publish date set by Admin.
 */
export function buildSubmissionRenderPayload(
  submission: SubmissionRecord
): CertificateRenderPayload {
  const effectiveCertDate = submission.certificatePublishDate || submission.submittedAt;
  return {
    certificateTemplate: submission.certificateTemplate,
    certificateConfig: submission.certificateConfig,
    studentName: submission.studentName,
    examTitle: submission.examTitle,
    scoreText: `คะแนนที่ได้ ${submission.score}/${submission.totalQuestions} คะแนน (${submission.percentage}%)`,
    dateText: formatThaiCeremonialDate(effectiveCertDate),
  };
}

export async function downloadCertificateAsPng(submission: SubmissionRecord): Promise<void> {
  const canvas = await renderCustomCertificateCanvas(
    buildSubmissionRenderPayload(submission)
  );
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `certificate-${submission.studentCode}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadCertificateAsPdf(submission: SubmissionRecord): Promise<void> {
  const canvas = await renderCustomCertificateCanvas(
    buildSubmissionRenderPayload(submission)
  );
  const imgData = canvas.toDataURL('image/png', 1.0);
  const isLandscape = canvas.width >= canvas.height;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
  pdf.save(`certificate-${submission.studentCode}.pdf`);
}
