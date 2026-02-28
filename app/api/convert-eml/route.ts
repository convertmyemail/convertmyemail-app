import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const FREE_LIMIT = 3;

async function checkFreeLimit(supabase: any, userId: string) {
  // 1) Check latest subscription
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("status, stripe_status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    console.error("subscription lookup error", subErr);
    return {
      ok: false as const,
      status: 500,
      body: { error: "Unable to verify subscription" },
    };
  }

  const subStatus = String(sub?.status || sub?.stripe_status || "").toLowerCase();
  const hasPaidAccess = subStatus === "active" || subStatus === "trialing";

  if (hasPaidAccess) {
    return { ok: true as const, plan: "Pro" as const };
  }

  // 2) Count conversions efficiently
  const { count, error: countErr } = await supabase
    .from("conversions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countErr) {
    console.error("conversion count error", countErr);
    return {
      ok: false as const,
      status: 500,
      body: { error: "Unable to check usage" },
    };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, FREE_LIMIT - used);

  if (used >= FREE_LIMIT) {
    return {
      ok: false as const,
      status: 402,
      body: {
        error: "Free conversion limit reached",
        message: "You’ve used all free conversions. Upgrade to Pro to continue.",
        code: "FREE_LIMIT_REACHED",
        plan: "Free",
        free_limit: FREE_LIMIT,
        used,
        remaining,
      },
    };
  }

  return {
    ok: true as const,
    plan: "Free" as const,
    free_limit: FREE_LIMIT,
    used,
    remaining,
  };
}

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

function extractThreadMessages(
  fullText: string,
  fallback: Omit<ThreadMessage, "body_text">
) {
  const text = normalizeBody(fullText);
  if (!text) return [];

  return [
    {
      ...fallback,
      body_text: normalizeBody(stripQuotePrefix(text)) || "(No body text)",
    },
  ];
}

async function rowsToPdfBuffer(rows: any[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  page.drawText("Email Export", { x: 50, y: height - 50, size: 16, font });

  let y = height - 80;

  rows.forEach((r, i) => {
    page.drawText(`Email ${i + 1}: ${r.subject}`, { x: 50, y, size: 12, font });
    y -= 20;
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function rowsToXlsxBuffer(rows: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Emails");

  ws.columns = [
    { header: "File Name", key: "file_name", width: 30 },
    { header: "From", key: "from", width: 30 },
    { header: "To", key: "to", width: 30 },
    { header: "Subject", key: "subject", width: 40 },
    { header: "Date", key: "date", width: 25 },
    { header: "Body", key: "body_text", width: 80 },
  ];

  rows.forEach((r) => ws.addRow(r));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const output = (url.searchParams.get("output") || "xlsx") as "xlsx" | "pdf";

    const supabase = createSupabaseServerClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new NextResponse("Unauthorized. Please log in.", { status: 401 });
    }

    const userId = userData.user.id;

    const gate = await checkFreeLimit(supabase, userId);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return new NextResponse("No files uploaded.", { status: 400 });
    }

    const parsedRows: any[] = [];

    for (const item of files) {
      if (!(item instanceof File)) continue;
      if (!item.name.toLowerCase().endsWith(".eml")) continue;

      const buf = Buffer.from(await item.arrayBuffer());
      const parsed = await simpleParser(buf);

      parsedRows.push({
        file_name: item.name,
        from: parsed.from?.text || "",
        to: parsed.to?.text || "",
        subject: parsed.subject || "",
        date: parsed.date?.toISOString() || "",
        body_text: normalizeBody(parsed.text || ""),
      });
    }

    if (parsedRows.length === 0) {
      return new NextResponse("No valid .eml files found.", { status: 400 });
    }

    const [xlsxBytes, pdfBuffer] = await Promise.all([
      rowsToXlsxBuffer(parsedRows),
      rowsToPdfBuffer(parsedRows),
    ]);

    if (output === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="email-records.pdf"',
        },
      });
    }

    return new NextResponse(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="converted-emails.xlsx"',
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Conversion failed.", { status: 500 });
  }
}