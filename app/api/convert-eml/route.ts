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

  const margin = 50;
  const lineGap = 6;
  const page = () => pdfDoc.addPage();
  let p = page();
  let { width, height } = p.getSize();
  let y = height - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      p = page();
      ({ width, height } = p.getSize());
      y = height - margin;
    }
  };

  const drawLine = (text: string, size = 10, color = rgb(0, 0, 0)) => {
    const maxWidth = width - margin * 2;
    const words = (text || "").split(/\s+/);
    let line = "";

    const flush = () => {
      newPageIfNeeded(size + lineGap);
      p.drawText(line, { x: margin, y, size, font, color });
      y -= size + lineGap;
      line = "";
    };

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const testWidth = font.widthOfTextAtSize(test, size);
      if (testWidth > maxWidth && line) {
        flush();
        line = w;
      } else {
        line = test;
      }
    }
    if (line) flush();
  };

  drawLine("Email Record Export", 16);
  y -= 6;
  drawLine(`Generated: ${new Date().toISOString()}`, 10, rgb(0.33, 0.33, 0.33));
  y -= 12;

  rows.forEach((r, idx) => {
    drawLine(`Record ${idx + 1}`, 12);
    y -= 2;

    drawLine(`File: ${r.file_name || ""}`, 10);
    drawLine(`From: ${r.from || ""}`, 10);
    drawLine(`To: ${r.to || ""}`, 10);
    drawLine(`Date: ${r.date || ""}`, 10);
    drawLine(`Subject: ${r.subject || ""}`, 10);

    y -= 6;
    drawLine("Body:", 10, rgb(0.2, 0.2, 0.2));
    drawLine(r.body_text || "", 10);

    y -= 14;
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
    properties: { defaultRowHeight: 18 },
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
        ? 70
        : key === "subject"
          ? 40
          : key === "from" || key === "to"
            ? 32
            : key === "date"
              ? 24
              : 28,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  headerRow.height = 22;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFBFBFBF" } },
      left: { style: "thin", color: { argb: "FFBFBFBF" } },
      bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
      right: { style: "thin", color: { argb: "FFBFBFBF" } },
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

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.alignment = { vertical: "top", horizontal: "left", wrapText: true };

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
    const lines = Math.min(12, Math.max(1, Math.ceil(body.length / 90)));
    row.height = 18 + lines * 10;
  }

  const xlsx = await wb.xlsx.writeBuffer();
  return Buffer.from(xlsx);
}

export async function POST(req: Request) {
  try {
    // Which output should we return to the browser?
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

      const from =
        parsed.from?.text?.toString() ||
        (parsed.from as any)?.value
          ?.map((v: { address?: string }) => v.address ?? "")
          .join(", ") ||
        "";

      const to =
        parsed.to?.text?.toString() ||
        (parsed.to as any)?.value
          ?.map((v: { address?: string }) => v.address ?? "")
          .join(", ") ||
        "";

      const subject = parsed.subject || "";
      const date = parsed.date ? parsed.date.toISOString() : "";
      const text = (parsed.text || "").replace(/\s+/g, " ").trim();

      parsedRows.push({
        file_name: originalName,
        from,
        to,
        subject,
        date,
        body_text: text,
      });
    }

    if (parsedRows.length === 0) {
      return new NextResponse("No valid .eml files found.", { status: 400 });
    }

    // Generate both outputs (so history always has both)
    const [xlsxBytes, pdfBuffer] = await Promise.all([
      rowsToXlsxBuffer(parsedRows),
      rowsToPdfBuffer(parsedRows),
    ]);

    // Upload XLSX
    const xlsxPath = `${userId}/${Date.now()}-converted-emails.xlsx`;
    const upXlsx = await supabase.storage.from("conversions").upload(xlsxPath, xlsxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });

    if (upXlsx.error) {
      return new NextResponse(`XLSX upload failed: ${upXlsx.error.message}`, { status: 500 });
    }

    // Upload PDF
    const pdfPath = `${userId}/${Date.now()}-email-records.pdf`;
    const upPdf = await supabase.storage.from("conversions").upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (upPdf.error) {
      return new NextResponse(`PDF upload failed: ${upPdf.error.message}`, { status: 500 });
    }

    // History row
    const representativeEmlPath = uploadedEmlPaths[0];
    const displayName =
      parsedRows.length === 1 ? parsedRows[0].file_name : `${parsedRows.length} files`;

    const { data: conversion, error: convErr } = await supabase
      .from("conversions")
      .insert({
        user_id: userId,
        original_filename: displayName,
        eml_path: representativeEmlPath,
        xlsx_path: xlsxPath,
        pdf_path: pdfPath,
        csv_path: null,
      })
      .select("id")
      .single();

    if (convErr || !conversion) {
      return new NextResponse(convErr?.message || "Failed to create conversion.", {
        status: 500,
      });
    }

    // Return whichever output user requested
    if (output === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="email-records.pdf"',
          "X-Conversion-Id": conversion.id,
        },
      });
    }

    return new NextResponse(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="converted-emails.xlsx"',
        "X-Conversion-Id": conversion.id,
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Conversion failed.", { status: 500 });
  }
}