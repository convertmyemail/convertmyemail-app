import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { simpleParser } from "mailparser";
import * as Papa from "papaparse";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

function safeFileName(name: string) {
  return (name || "upload.eml")
    .replace(/[^\w.\-()]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 140);
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
    // crude wrap to avoid text running off page
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

  // Header
  drawLine("Email Record Export", 16);
  y -= 6;
  drawLine(`Generated: ${new Date().toISOString()}`, 10, rgb(0.33, 0.33, 0.33));
  y -= 12;

  // Records
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

export async function POST(req: Request) {
  try {
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
        return new NextResponse(`EML upload failed: ${up.error.message}`, {
          status: 500,
        });
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

    // CSV
    const csv = Papa.unparse(parsedRows);
    const csvBytes = Buffer.from(csv, "utf8");
    const csvPath = `${userId}/${Date.now()}-converted-emails.csv`;

    const upCsv = await supabase.storage.from("conversions").upload(csvPath, csvBytes, {
      contentType: "text/csv",
      upsert: false,
    });

    if (upCsv.error) {
      return new NextResponse(`CSV upload failed: ${upCsv.error.message}`, {
        status: 500,
      });
    }

    // PDF (pdf-lib)
    const pdfBuffer = await rowsToPdfBuffer(parsedRows);
    const pdfPath = `${userId}/${Date.now()}-email-records.pdf`;

    const upPdf = await supabase.storage.from("conversions").upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (upPdf.error) {
      return new NextResponse(`PDF upload failed: ${upPdf.error.message}`, {
        status: 500,
      });
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
        csv_path: csvPath,
        pdf_path: pdfPath,
      })
      .select("id, created_at, original_filename, csv_path, pdf_path")
      .single();

    if (convErr || !conversion) {
      return new NextResponse(convErr?.message || "Failed to create conversion.", {
        status: 500,
      });
    }

    // Keep existing UX: still returns CSV download
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="converted-emails.csv"',
        "X-Conversion-Id": conversion.id,
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Conversion failed.", { status: 500 });
  }
}