import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BINARY_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 120_000;

function extensionFor(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function capExtractedText(text: string) {
  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (cleanText.length <= MAX_EXTRACTED_CHARS) return cleanText;

  return `${cleanText.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Document truncated at ${MAX_EXTRACTED_CHARS} characters.]`;
}

function xmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractZipXmlText(buffer: Buffer, filePrefix: string, heading: string) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.startsWith(filePrefix) && entry.name.endsWith(".xml"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const sections: string[] = [];

  for (const entry of entries) {
    const text = xmlText(await entry.async("text"));
    if (text) sections.push(`${heading} ${sections.length + 1} (${entry.name})\n${text}`);
  }

  return sections.join("\n\n");
}

async function extractPdf(buffer: Buffer) {
  PDFParse.setWorker(
    pathToFileURL(
      path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "pdf-parse", "esm", "pdf.worker.mjs")
    ).toString()
  );
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocumentText(fileName: string, mediaType: string, buffer: Buffer) {
  const extension = extensionFor(fileName);

  if (mediaType === "application/pdf" || extension === ".pdf") {
    return extractPdf(buffer);
  }

  if (
    mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (
    mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    extension === ".pptx"
  ) {
    return extractZipXmlText(buffer, "ppt/slides/slide", "Slide");
  }

  if (
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === ".xlsx"
  ) {
    const sharedStrings = await extractZipXmlText(buffer, "xl/sharedStrings", "Shared strings");
    const sheets = await extractZipXmlText(buffer, "xl/worksheets/sheet", "Sheet");
    return [sharedStrings, sheets].filter(Boolean).join("\n\n");
  }

  throw new Error("Unsupported document type. PDF, DOCX, PPTX, and XLSX extraction are available.");
}

export async function POST(request: NextRequest) {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid document upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Document file is required." }, { status: 400 });
  }

  if (file.size > MAX_BINARY_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `Document is over the ${Math.round(MAX_BINARY_DOCUMENT_BYTES / 1024 / 1024)} MB extraction limit.` },
      { status: 413 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = capExtractedText(await extractDocumentText(file.name, file.type, buffer));
    if (!text) {
      return NextResponse.json(
        { error: "No readable text was extracted from this document." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
      text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
