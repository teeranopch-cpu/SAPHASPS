/**
 * Safely parses a Fetch API Response as JSON so non-JSON gateway/404/413 responses
 * never throw cryptic "Unexpected token ... is not valid JSON" errors.
 */
export async function parseJsonResponse<T = Record<string, any>>(res: Response): Promise<T> {
  const rawText = await res.text();
  if (!rawText) {
    return {} as T;
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    if (res.status === 413) {
      throw new Error('ขนาดไฟล์รูปภาพใหญ่เกินกำหนดของเซิร์ฟเวอร์ กรุณาใช้ไฟล์ขนาดเล็กลง');
    }
    if (res.status === 404) {
      throw new Error('ไม่พบ API ของระบบบนเซิร์ฟเวอร์ (404) กรุณาอัปเดตโค้ดล่าสุดขึ้น GitHub/Vercel');
    }
    throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status})`);
  }
}
