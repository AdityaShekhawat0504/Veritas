// Memo text from an uploaded file: PDF, DOCX or plain text.

export const MAX_MEMO_CHARS = 60_000;

export class UnsupportedFileError extends Error {}

function kindOf(name: string, type: string): "pdf" | "docx" | "text" | null {
  const lower = name.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx";
  }
  if (type.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  return null;
}

export async function extractMemoText(file: { name: string; type: string; bytes: Uint8Array }): Promise<string> {
  const kind = kindOf(file.name, file.type);
  if (kind === null) throw new UnsupportedFileError("Upload a PDF, DOCX or text file");
  let text: string;
  if (kind === "pdf") {
    const { extractText } = await import("unpdf");
    const res = await extractText(new Uint8Array(file.bytes), { mergePages: true });
    text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    text = res.value;
  } else {
    text = new TextDecoder("utf-8").decode(file.bytes);
  }
  return text.replace(/\r\n/g, "\n").trim();
}
