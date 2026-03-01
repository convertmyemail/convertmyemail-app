import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_LIMIT = 3;

function createSupabaseWithAuth(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get("authorization") || "";

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}

function asDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

async function checkFreeLimit(supabase: any, userId: string) {
  // 1) Check latest subscription
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    console.error("subscription lookup error", subErr);
    return {
      ok: false as const,
      status: 500,
      body: {
        error: "Unable to verify subscription",
        message: "We couldn’t verify your subscription status. Please try again.",
      },
    };
  }

  const subStatus = String(sub?.status || "").toLowerCase();
  const active = subStatus === "active" || subStatus === "trialing";

  // Fail-open on missing period end if status is active/trialing
  const periodEnd = asDate((sub as any)?.current_period_end);
  const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

  if (active && notExpired) {
    return { ok: true as const, plan: "Pro" as const };
  }

  // 2) Count conversions efficiently for free users
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

function normalizeBody(text: string) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function rowsToPdfBuffer(rows: any[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSizeTitle = 16;
  const fontSize = 11;
  const marginX = 50;
  const marginTop = 50;
  const marginBottom = 60;
  const lineHeight = 16;

  let page = pdfDoc.addPage();
  let { height } = page.getSize();

  const newPage = () => {
    page = pdfDoc.addPage();
    ({ height } = page.getSize());
    y = height - marginTop;
  };

  // Title on first page
  page.drawText("Email Export", { x: marginX, y: height - marginTop, size: fontSizeTitle, font });
  let y = height - marginTop - 30;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const subject = String(r.subject || "(No subject)").replace(/\s+/g, " ").slice(0, 140);

    // Start new page if needed
    if (y < marginBottom) {
      newPage();
    }

    page.drawText(`Email ${i + 1}: ${subject}`, { x: marginX, y, size: fontSize, font });
    y -= lineHeight;
  }

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

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  rows.forEach((r) => ws.addRow(r));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const output = (url.searchParams.get("output") || "xlsx") as "xlsx" | "pdf";

    // Require bearer auth (your client sends it)
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const supabase = createSupabaseWithAuth(req);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const gate = await checkFreeLimit(supabase, user.id);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
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
      return NextResponse.json({ error: "No valid .eml files found." }, { status: 400 });
    }

    if (output === "pdf") {
      const pdfBuffer = await rowsToPdfBuffer(parsedRows);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="email-records.pdf"',
        },
      });
    }

    const xlsxBytes = await rowsToXlsxBuffer(parsedRows);
    return new NextResponse(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="converted-emails.xlsx"',
      },
    });
  } catch (err: any) {
    console.error("❌ convert-eml failed:", err);
    return NextResponse.json(
      { error: "Conversion failed.", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}