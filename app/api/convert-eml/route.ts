import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { simpleParser } from "mailparser";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

function safeFileName(name: string) {
  return (name || "upload.eml")
    .replace(/[^\w.\-()]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 140);
}

function titleCaseHeader(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeBody(text: string) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuotePrefix(s: string) {
  // remove leading ">" quote marks but keep content
  return s
    .split("\n")
    .map((line) => line.replace(/^\s*>+\s?/, ""))
    .join("\n");
}

type ThreadMessage = {
  from: string;
  to: string;
  subject: string;
  date: string;
  body_text: string;
};

function parseOutlookHeaderBlock(lines: string[]) {
  const meta: Partial<ThreadMessage> = {};
  const maxScan = Math.min(lines.length, 10);

  let i = 0;
  while (i < maxScan) {
    const line = (lines[i] || "").trim();
    if (!line) break;

    const mFrom = line.match(/^From\s*:\s*(.*)$/i);
    const mTo = line.match(/^To\s*:\s*(.*)$/i);
    const mSub = line.match(/^Subject\s*:\s*(.*)$/i);
    const mSent = line.match(/^(Sent|Date)\s*:\s*(.*)$/i);

    if (mFrom) meta.from = (mFrom[1] || "").trim();
    else if (mTo) meta.to = (mTo[1] || "").trim();
    else if (mSub) meta.subject = (mSub[1] || "").trim();
    else if (mSent) meta.date = (mSent[2] || "").trim();

    i += 1;
  }

  const score =
    (meta.from ? 1 : 0) +
    (meta.to ? 1 : 0) +
    (meta.subject ? 1 : 0) +
    (meta.date ? 1 : 0);

  return { meta, consumedLines: score >= 2 ? i : 0 };
}

function extractThreadMessages(
  fullText: string,
  fallback: Omit<ThreadMessage, "body_text">
) {
  const text = normalizeBody(fullText);
  if (!text) return [];

  const lines = text.split("\n");

  // Identify cut points for message boundaries (line indices)
  const cutIdxs = new Set<number>();
  cutIdxs.add(0);

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || "").trim();

    if (/^-+\s*Original Message\s*-+$/i.test(line)) {
      cutIdxs.add(i);
      continue;
    }

    if (/^From\s*:/i.test(line)) {
      const next = lines.slice(i, i + 8);
      const joined = next.join("\n").toLowerCase();
      if (
        joined.includes("to:") ||
        joined.includes("subject:") ||
        joined.includes("sent:") ||
        joined.includes("date:")
      ) {
        cutIdxs.add(i);
        continue;
      }
    }

    if (/^On .+wrote:\s*$/i.test(line)) {
      cutIdxs.add(i);
      continue;
    }

    if (/^_{8,}\s*$/.test(line) || /^-{8,}\s*$/.test(line)) {
      cutIdxs.add(i);
      continue;
    }
  }

  const cuts = Array.from(cutIdxs)
    .filter((n) => n >= 0 && n < lines.length)
    .sort((a, b) => a - b);

  const segments: string[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i];
    const end = i + 1 < cuts.length ? cuts[i + 1] : lines.length;
    const seg = lines.slice(start, end).join("\n").trim();
    if (seg) segments.push(seg);
  }

  // light dedupe
  const uniqueSegments: string[] = [];
  const seen = new Set<string>();
  for (const s of segments) {
    const key = s.slice(0, 300);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSegments.push(s);
    }
  }

  const messages: ThreadMessage[] = uniqueSegments.map((seg) => {
    const sLines = seg.split("\n");

    let startAt = 0;
    if (/^On .+wrote:\s*$/i.test((sLines[0] || "").trim())) {
      startAt = 1;
    }

    const { meta, consumedLines } = parseOutlookHeaderBlock(sLines.slice(startAt));
    const headerConsumed = consumedLines > 0 ? consumedLines : 0;

    const bodyRaw = sLines.slice(startAt + headerConsumed).join("\n").trim();
    const bodyClean = normalizeBody(stripQuotePrefix(bodyRaw));

    return {
      from: meta.from ?? fallback.from,
      to: meta.to ?? fallback.to,
      subject: meta.subject ?? fallback.subject,
      date: meta.date ?? fallback.date,
      body_text: bodyClean || "(No body text)",
    };
  });

  const filtered = messages.filter((m) => {
    const body = (m.body_text || "").trim();
    if (!body) return false;
    if (body.length < 10) return false;
    if (/^_{8,}$/.test(body) || /^-{8,}$/.test(body)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return [
      {
        ...fallback,
        body_text: normalizeBody(stripQuotePrefix(text)) || "(No body text)",
      },
    ];
  }

  return filtered;
}

async function rowsToPdfBuffer(
  rows: Array<{
    file_name: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    body_text: string;
  }>
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const titleSize = 14;
  const metaLabelSize = 10;
  const metaValueSize = 10;
  const bodySize = 11;

  const lineGap = 6;
  const paraGap = 8;
  const recordGap = 18;

  const generated = new Date().toISOString();

  const makePage = () => pdfDoc.addPage();
  let p = makePage();
  let { width, height } = p.getSize();

  const headerTop = height - margin + 12;
  const contentTop = height - margin - 34;

  const footerY = margin - 26;
  const footerRuleY = footerY + 14;
  const contentBottom = footerRuleY + 10;

  let y = contentTop;

  const drawHeader = () => {
    p.drawText("Email Record Export", {
      x: margin,
      y: headerTop,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    p.drawText(`Generated: ${generated}`, {
      x: margin,
      y: headerTop - 16,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });

    p.drawLine({
      start: { x: margin, y: headerTop - 24 },
      end: { x: width - margin, y: headerTop - 24 },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    p.drawLine({
      start: { x: margin, y: footerRuleY },
      end: { x: width - margin, y: footerRuleY },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    const brand = "Converted by ConvertMyEmail.com";
    const brandSize = 9;
    const brandWidth = font.widthOfTextAtSize(brand, brandSize);
    p.drawText(brand, {
      x: (width - brandWidth) / 2,
      y: footerY,
      size: brandSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });

    const text = `Page ${pageNumber} of ${totalPages}`;
    p.drawText(text, {
      x: width - margin - font.widthOfTextAtSize(text, 9),
      y: footerY,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  };

  const newPage = () => {
    p = makePage();
    ({ width, height } = p.getSize());
    y = height - margin - 34;
    drawHeader();
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < contentBottom) newPage();
  };

  const wrapLines = (text: string, f: any, size: number, maxWidth: number) => {
    const clean = (text || "").replace(/\r\n/g, "\n");
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let line = "";

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const wWidth = f.widthOfTextAtSize(test, size);
      if (wWidth > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawWrapped = (
    text: string,
    opts: {
      x?: number;
      size?: number;
      useBold?: boolean;
      color?: any;
      maxWidth?: number;
      lineGapOverride?: number;
    } = {}
  ) => {
    const x = opts.x ?? margin;
    const size = opts.size ?? bodySize;
    const f = opts.useBold ? fontBold : font;
    const color = opts.color ?? rgb(0, 0, 0);
    const maxWidth = opts.maxWidth ?? width - margin * 2;
    const gap = opts.lineGapOverride ?? lineGap;

    const lines = wrapLines(text || "", f, size, maxWidth);

    for (const line of lines) {
      ensureSpace(size + gap);
      if (line) {
        p.drawText(line, { x, y, size, font: f, color });
      }
      y -= size + gap;
    }
  };

  const hr = () => {
    ensureSpace(16);
    p.drawLine({
      start: { x: margin, y: y + 6 },
      end: { x: width - margin, y: y + 6 },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });
    y -= 12;
  };

  const drawMetaCard = (fields: Array<{ label: string; value: string }>) => {
    const cardX = margin;
    const cardW = width - margin * 2;

    const labelX = cardX + 12;
    const valueX = cardX + 78;
    const valueMaxW = cardX + cardW - 12 - valueX;

    let linesCount = 0;
    for (const f of fields) {
      const vLines = wrapLines(f.value || "", font, metaValueSize, valueMaxW);
      linesCount += Math.max(1, vLines.length);
    }

    const rowH = metaValueSize + 5;
    const cardH = 14 + linesCount * rowH + 10;

    ensureSpace(cardH + 18);

    p.drawRectangle({
      x: cardX,
      y: y - cardH,
      width: cardW,
      height: cardH,
      color: rgb(0.976, 0.98, 0.984),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });

    let cy = y - 18;
    for (const f of fields) {
      p.drawText(f.label, {
        x: labelX,
        y: cy,
        size: metaLabelSize,
        font: fontBold,
        color: rgb(0.25, 0.25, 0.25),
      });

      const vLines = wrapLines(f.value || "", font, metaValueSize, valueMaxW);
      const firstLine = vLines[0] || "";

      p.drawText(firstLine, {
        x: valueX,
        y: cy,
        size: metaValueSize,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });

      let extraY = cy;
      for (let i = 1; i < vLines.length; i++) {
        extraY -= rowH;
        p.drawText(vLines[i], {
          x: valueX,
          y: extraY,
          size: metaValueSize,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
      }

      cy = extraY - rowH;
    }

    y = y - cardH - 14;
  };

  drawHeader();

  rows.forEach((r, idx) => {
    if (idx > 0) newPage();

    drawWrapped(`Email ${idx + 1}`, { size: 13, useBold: true });
    drawWrapped(`Record ID: ${String(idx + 1).padStart(4, "0")}`, {
      size: 9,
      color: rgb(0.35, 0.35, 0.35),
      lineGapOverride: 4,
    });
    y -= 6;

    drawMetaCard([
      { label: "File:", value: r.file_name || "" },
      { label: "From:", value: r.from || "" },
      { label: "To:", value: r.to || "" },
      { label: "Date:", value: r.date || "" },
      { label: "Subject:", value: r.subject || "" },
    ]);

    hr();

    drawWrapped("Body", { size: 11, useBold: true, color: rgb(0.15, 0.15, 0.15) });
    y -= 2;

    const body = (r.body_text || "").trim() || "(No body text)";
    const paragraphs = body
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const bodyMaxW = width - margin * 2;

    if (paragraphs.length === 0) {
      drawWrapped("(No body text)", { size: bodySize, color: rgb(0.2, 0.2, 0.2) });
    } else {
      for (const para of paragraphs) {
        const normalized = para.replace(/\n+/g, " ");
        drawWrapped(normalized, { size: bodySize, maxWidth: bodyMaxW });
        y -= paraGap;
      }
    }

    y -= recordGap;
  });

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((page, i) => {
    p = page;
    ({ width, height } = p.getSize());
    drawFooter(i + 1, totalPages);
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function rowsToXlsxBuffer(
  rows: Array<{
    file_name: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    body_text: string;
  }>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertMyEmail";
  wb.created = new Date();

  const ws = wb.addWorksheet("Emails", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  const columns: Array<keyof (typeof rows)[number]> = [
    "file_name",
    "from",
    "to",
    "subject",
    "date",
    "body_text",
  ];

  ws.columns = columns.map((key) => ({
    header: titleCaseHeader(key),
    key,
    width:
      key === "body_text"
        ? 80
        : key === "subject"
          ? 45
          : key === "from" || key === "to"
            ? 34
            : key === "date"
              ? 24
              : 28,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  rows.forEach((r) => {
    ws.addRow({
      file_name: r.file_name || "",
      from: r.from || "",
      to: r.to || "",
      subject: r.subject || "",
      date: r.date || "",
      body_text: r.body_text || "",
    });
  });

  ws.autoFilter = { from: "A1", to: `F${ws.rowCount}` };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.alignment = { vertical: "top", horizontal: "left", wrapText: true };

    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F9F9" } };
      });
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
      cell.alignment = { ...(cell.alignment ?? {}), wrapText: true };
    });
  });

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const body = String(row.getCell("body_text").value ?? "");
    const lines = Math.min(15, Math.max(1, Math.ceil(body.length / 95)));
    row.height = 20 + lines * 10;
  }

  const summary = wb.addWorksheet("Summary");
  summary.getCell("A1").value = "ConvertMyEmail Export Summary";
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getCell("A3").value = "Total Emails:";
  summary.getCell("B3").value = rows.length;
  summary.getCell("A4").value = "Generated:";
  summary.getCell("B4").value = new Date().toISOString();
  summary.columns = [{ width: 22 }, { width: 40 }];

  const xlsx = await wb.xlsx.writeBuffer();
  return Buffer.from(xlsx);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const output = (url.searchParams.get("output") || "xlsx") as "xlsx" | "pdf";

    const cookieStore = await Promise.resolve(cookies() as any);
    const supabase = createSupabaseServerClient(cookieStore);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new NextResponse("Unauthorized. Please log in.", { status: 401 });
    }

    const userId = userData.user.id;

    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return new NextResponse("No files uploaded.", { status: 400 });
    }

    const parsedRows: Array<{
      file_name: string;
      from: string;
      to: string;
      subject: string;
      date: string;
      body_text: string;
    }> = [];

    const uploadedEmlPaths: string[] = [];

    for (const item of files) {
      if (!(item instanceof File)) continue;

      const originalName = item.name || "";
      if (!originalName.toLowerCase().endsWith(".eml")) continue;

      const buf = Buffer.from(await item.arrayBuffer());

      const ts = Date.now();
      const cleanName = safeFileName(originalName);
      const emlPath = `${userId}/${ts}-${cleanName}`;

      const up = await supabase.storage.from("conversions").upload(emlPath, buf, {
        contentType: "message/rfc822",
        upsert: false,
      });

      if (up.error) {
        return new NextResponse(`EML upload failed: ${up.error.message}`, { status: 500 });
      }

      uploadedEmlPaths.push(emlPath);

      const parsed = await simpleParser(buf);

      const topFrom =
        parsed.from?.text?.toString() ||
        (parsed.from as any)?.value?.map((v: { address?: string }) => v.address ?? "").join(", ") ||
        "";

      const topTo =
        parsed.to?.text?.toString() ||
        (parsed.to as any)?.value?.map((v: { address?: string }) => v.address ?? "").join(", ") ||
        "";

      const topSubject = parsed.subject || "";
      const topDate = parsed.date ? parsed.date.toISOString() : "";

      const rawText = (parsed.text || "").toString();
      const normalizedText = normalizeBody(rawText);

      const threadMessages = extractThreadMessages(normalizedText, {
        from: topFrom,
        to: topTo,
        subject: topSubject,
        date: topDate,
      });

      threadMessages.forEach((m, i) => {
        const suffix =
          threadMessages.length > 1 ? ` (msg ${i + 1} of ${threadMessages.length})` : "";
        parsedRows.push({
          file_name: `${originalName}${suffix}`,
          from: m.from || topFrom,
          to: m.to || topTo,
          subject: m.subject || topSubject,
          date: m.date || topDate,
          body_text: m.body_text || "(No body text)",
        });
      });
    }

    if (parsedRows.length === 0) {
      return new NextResponse("No valid .eml files found.", { status: 400 });
    }

    const [xlsxBytes, pdfBuffer] = await Promise.all([
      rowsToXlsxBuffer(parsedRows),
      rowsToPdfBuffer(parsedRows),
    ]);

    const xlsxPath = `${userId}/${Date.now()}-converted-emails.xlsx`;
    const upXlsx = await supabase.storage.from("conversions").upload(xlsxPath, xlsxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });

    if (upXlsx.error) {
      return new NextResponse(`XLSX upload failed: ${upXlsx.error.message}`, { status: 500 });
    }

    const pdfPath = `${userId}/${Date.now()}-email-records.pdf`;
    const upPdf = await supabase.storage.from("conversions").upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (upPdf.error) {
      return new NextResponse(`PDF upload failed: ${upPdf.error.message}`, { status: 500 });
    }

    const representativeEmlPath = uploadedEmlPaths[0];
    const displayName =
      parsedRows.length === 1 ? parsedRows[0].file_name : `${parsedRows.length} messages`;

    const { data: conversion, error: convErr } = await supabase
      .from("conversions")
      .insert({
        user_id: userId,
        original_filename: displayName,
        eml_path: representativeEmlPath,
        xlsx_path: xlsxPath,
        pdf_path: pdfPath,
        csv_path: null,
        message_count: parsedRows.length, // ✅ NEW
      })
      .select("id")
      .single();

    if (convErr || !conversion) {
      return new NextResponse(convErr?.message || "Failed to create conversion.", { status: 500 });
    }

    if (output === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="email-records.pdf"',
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": String(pdfBuffer.byteLength),
          "X-Conversion-Id": conversion.id,
        },
      });
    }

    return new NextResponse(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="converted-emails.xlsx"',
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(xlsxBytes.byteLength),
        "X-Conversion-Id": conversion.id,
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Conversion failed.", { status: 500 });
  }
}