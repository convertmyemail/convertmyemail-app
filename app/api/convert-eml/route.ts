import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { simpleParser } from "mailparser";
import * as Papa from "papaparse";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function safeFileName(name: string) {
  return (name || "upload.eml")
    .replace(/[^\w.\-()]+/g, "_") // keep letters/numbers/_ . - ( )
    .replace(/_+/g, "_")
    .slice(0, 140);
}

export async function POST(req: Request) {
  try {
    // ✅ Identify the user from cookies/session
    const cookieStore = await Promise.resolve(cookies() as any);
    const supabase = createSupabaseServerClient(cookieStore);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new NextResponse("Unauthorized. Please log in.", { status: 401 });
    }

    const userId = userData.user.id;

    // ✅ Read uploaded files
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

    // Track uploaded EML paths; we'll store the first one on the conversion row
    const uploadedEmlPaths: string[] = [];

    for (const item of files) {
      if (!(item instanceof File)) continue;

      const originalName = item.name || "";
      if (!originalName.toLowerCase().endsWith(".eml")) continue;

      const buf = Buffer.from(await item.arrayBuffer());

      // 1) Upload the raw .eml to Storage
      // IMPORTANT: must start with `${userId}/` to match your storage policies
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

      // 2) Parse .eml
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

    // 3) Create combined CSV (same output as before)
    const csv = Papa.unparse(parsedRows);
    const csvBytes = Buffer.from(csv, "utf8");

    // Upload CSV to Storage
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

    // 4) Insert conversion history (Version B schema)
    // Store the first uploaded EML as representative; history row represents the batch
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
      })
      .select("id, created_at, original_filename, csv_path")
      .single();

    if (convErr || !conversion) {
      return new NextResponse(convErr?.message || "Failed to create conversion.", {
        status: 500,
      });
    }

    // ✅ Return CSV download (your existing UX still works)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="converted-emails.csv"',
        // handy if your UI wants to refresh history immediately
        "X-Conversion-Id": conversion.id,
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Conversion failed.", {
      status: 500,
    });
  }
}