import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "conversions";

// Plan + limits (per your pricing)
type Plan = "free" | "starter" | "pro" | "business";
const LIMITS: Record<Plan, number | null> = {
  free: 3, // lifetime
  starter: 50, // per billing cycle
  pro: 250, // per billing cycle
  business: null, // unlimited
};

type SubscriptionRow = {
  status: string | null;
  plan: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  updated_at: string | null;
};

type ConversionRow = {
  id: string;
};

function createSupabaseWithAuth(req: Request): SupabaseClient {
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

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

async function getSubscriptionSnapshot(supabase: SupabaseClient, userId: string) {
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_start, current_period_end, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (subErr) {
    console.error("subscription lookup error", subErr);
    return {
      ok: false as const,
      // fail closed to free, but keep the app functional
      status: "unknown",
      plan: "free" as Plan,
      periodStart: null as Date | null,
      periodEnd: null as Date | null,
    };
  }

  const status = String(sub?.status || "").toLowerCase();
  const plan = (String(sub?.plan || "free").toLowerCase() as Plan) || "free";

  const periodStart = asDate(sub?.current_period_start);
  const periodEnd = asDate(sub?.current_period_end);

  return {
    ok: true as const,
    status,
    plan,
    periodStart,
    periodEnd,
  };
}

/**
 * Enforces:
 * - free: 3 lifetime conversions
 * - starter: 50 / billing cycle
 * - pro: 250 / billing cycle
 * - business: unlimited
 *
 * We count "conversions" rows as the unit of usage.
 */
async function enforceUsageLimit(supabase: SupabaseClient, userId: string) {
  const snap = await getSubscriptionSnapshot(supabase, userId);

  const status = String(snap.status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing";

  const periodEnd = snap.periodEnd;
  const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

  const entitledPlan: Plan = isActive && notExpired ? snap.plan : "free";
  const limit = LIMITS[entitledPlan];

  // Unlimited
  if (limit === null) {
    return {
      ok: true as const,
      plan: entitledPlan,
      limit: null,
      used: null,
      remaining: null,
      window: "unlimited" as const,
      window_start: null as string | null,
      window_end: null as string | null,
    };
  }

  // Determine counting window (billing-cycle aligned for paid plans)
  let startIso: string | null = null;
  let endIso: string | null = null;
  let window: "lifetime" | "billing_cycle" = "lifetime";

  if (entitledPlan === "free") {
    window = "lifetime";
  } else {
    window = "billing_cycle";

    const periodStart = snap.periodStart;
    if (periodStart) {
      startIso = periodStart.toISOString();
    } else {
      const now = new Date();
      const fallback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
      startIso = fallback.toISOString();
      console.warn("[convert-eml] Missing current_period_start; falling back to month start", {
        userId,
        entitledPlan,
      });
    }

    endIso = periodEnd ? periodEnd.toISOString() : null;
  }

  let q = supabase
    .from("conversions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (startIso) q = q.gte("created_at", startIso);

  const { count, error: countErr } = await q;

  if (countErr) {
    console.error("conversion count error", countErr);
    return {
      ok: false as const,
      status: 500,
      body: { error: "Unable to check usage" },
    };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  if (used >= limit) {
    const upgradeTarget =
      entitledPlan === "free" ? "Starter" : entitledPlan === "starter" ? "Pro" : "Business";

    return {
      ok: false as const,
      status: 402,
      body: {
        error: "Conversion limit reached",
        message:
          entitledPlan === "free"
            ? "You’ve used all free conversions. Upgrade to Starter to continue."
            : `You’ve hit your billing-cycle limit. Upgrade to ${upgradeTarget} to continue.`,
        code: "LIMIT_REACHED",
        plan: entitledPlan,
        limit,
        used,
        remaining,
        window,
        window_start: startIso,
        window_end: endIso,
      },
    };
  }

  return {
    ok: true as const,
    plan: entitledPlan,
    limit,
    used,
    remaining,
    window,
    window_start: startIso,
    window_end: endIso,
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

/**
 * Basic, robust-ish thread splitting for common forwarded/replied separators.
 * This is intentionally conservative: if we can’t confidently split, returns 1 chunk.
 */
function splitThread(text: string): string[] {
  const body = normalizeBody(text || "");
  if (!body) return [""];

  const separators = [
    /^-+\s*Original Message\s*-+$/gim,
    /^From:\s.+$/gim,
    /^On\s.+wrote:\s*$/gim,
    /^_{5,}\s*$/gim,
  ];

  const indices = new Set<number>();
  for (const re of separators) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m.index > 40) indices.add(m.index);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  const points = Array.from(indices).sort((a, b) => a - b);
  if (points.length === 0) return [body];

  const chunks: string[] = [];
  let start = 0;
  for (const p of points) {
    const chunk = body.slice(start, p).trim();
    if (chunk.length >= 80) chunks.push(chunk);
    start = p;
  }
  const last = body.slice(start).trim();
  if (last.length >= 80) chunks.push(last);

  return chunks.length ? chunks : [body];
}

/** Wrap text to fit a given width using pdf-lib font metrics */
function wrapLines(opts: { text: string; font: PDFFont; size: number; maxWidth: number }) {
  const { text, font, size, maxWidth } = opts;
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let cur = "";
        for (const ch of w) {
          const t = cur + ch;
          if (font.widthOfTextAtSize(t, size) <= maxWidth) cur = t;
          else {
            if (cur) lines.push(cur);
            cur = ch;
          }
        }
        line = cur;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function rowsToPdfBuffer(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 50;
  const marginTop = 56;
  const marginBottom = 64;

  const titleSize = 18;
  const labelSize = 10;
  const bodySize = 11;

  const lineGap = 4;
  const labelLineHeight = labelSize + 4;
  const bodyLineHeight = bodySize + lineGap;

  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let y = height - marginTop;

  const footer = () => {
    const footerText = "Generated by ConvertMyEmail • convertmyemail.com";
    const fs = 9;
    page.drawLine({
      start: { x: marginX, y: marginBottom - 18 },
      end: { x: width - marginX, y: marginBottom - 18 },
      thickness: 1,
      color: rgb(0.88, 0.88, 0.88),
    });
    page.drawText(footerText, {
      x: marginX,
      y: marginBottom - 34,
      size: fs,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  };

  const newPage = () => {
    footer();
    page = pdfDoc.addPage();
    ({ width, height } = page.getSize());
    y = height - marginTop;
  };

  page.drawText("Email Export", { x: marginX, y, size: titleSize, font: fontBold });
  y -= 28;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>;

    const blockHeader = `Email ${i + 1}`;
    const subject = String(r.subject ?? "(No subject)").replace(/\s+/g, " ").slice(0, 200);

    const metaLines = [
      { k: "File", v: String(r.file_name ?? "") },
      { k: "From", v: String(r.from ?? "") },
      { k: "To", v: String(r.to ?? "") },
      { k: "Date", v: String(r.date ?? "") },
      { k: "Subject", v: subject },
    ];

    const bodyText = String(r.body_text ?? "");
    const maxWidth = width - marginX * 2;

    const approxBodyLines = wrapLines({ text: bodyText, font, size: bodySize, maxWidth }).length;
    const needed =
      18 + metaLines.length * labelLineHeight + 10 + Math.min(approxBodyLines, 12) * bodyLineHeight + 18;

    if (y - needed < marginBottom) newPage();

    page.drawText(blockHeader, { x: marginX, y, size: 12, font: fontBold });
    y -= 18;

    for (const m of metaLines) {
      const label = `${m.k}: `;
      page.drawText(label, { x: marginX, y, size: labelSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(m.v, {
        x: marginX + fontBold.widthOfTextAtSize(label, labelSize),
        y,
        size: labelSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= labelLineHeight;
    }

    y -= 6;

    page.drawText("Body:", { x: marginX, y, size: labelSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;

    const lines = wrapLines({ text: bodyText || "(empty)", font, size: bodySize, maxWidth });

    for (const line of lines) {
      if (y - bodyLineHeight < marginBottom) newPage();
      page.drawText(line, { x: marginX, y, size: bodySize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= bodyLineHeight;
    }

    y -= 18;
  }

  footer();

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function rowsToXlsxBuffer(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConvertMyEmail";
  wb.created = new Date();

  const ws = wb.addWorksheet("Emails", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "File Name", key: "file_name", width: 30 },
    { header: "From", key: "from", width: 28 },
    { header: "To", key: "to", width: 28 },
    { header: "Subject", key: "subject", width: 40 },
    { header: "Date", key: "date", width: 22 },
    { header: "Body", key: "body_text", width: 80 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  rows.forEach((r) => ws.addRow(r));

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    if (rowNumber > 1) row.height = 60;
  });

  ws.getColumn("date").alignment = { vertical: "top" };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function uploadToStorage(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer,
  contentType: string
) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const output = (url.searchParams.get("output") || "xlsx") as "xlsx" | "pdf";

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

    const gate = await enforceUsageLimit(supabase, user.id);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const parsedRows: Array<Record<string, unknown>> = [];
    const originalNames: string[] = [];

    for (const item of files) {
      if (!(item instanceof File)) continue;
      if (!item.name.toLowerCase().endsWith(".eml")) continue;

      originalNames.push(item.name);

      const buf = Buffer.from(await item.arrayBuffer());
      const parsed = await simpleParser(buf);

      const baseRow: Record<string, unknown> = {
        file_name: item.name,
        from: parsed.from?.text || "",
        to: parsed.to?.text || "",
        subject: parsed.subject || "",
        date: parsed.date ? parsed.date.toISOString() : "",
      };

      const chunks = splitThread(parsed.text || "");
      if (chunks.length <= 1) {
        parsedRows.push({
          ...baseRow,
          body_text: normalizeBody(parsed.text || ""),
        });
      } else {
        chunks.forEach((chunk, idx) => {
          parsedRows.push({
            ...baseRow,
            subject: baseRow.subject
              ? `${String(baseRow.subject)} (Part ${idx + 1})`
              : `Thread (Part ${idx + 1})`,
            body_text: normalizeBody(chunk),
          });
        });
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ error: "No valid .eml files found." }, { status: 400 });
    }

    const originalFilename =
      originalNames.length === 1 ? originalNames[0] : `${originalNames.length} files`;

    const { data: conversion, error: insertErr } = await supabase
      .from("conversions")
      .insert({
        user_id: user.id,
        original_filename: originalFilename,
        message_count: parsedRows.length,
      })
      .select("id")
      .single<ConversionRow>();

    if (insertErr || !conversion?.id) {
      console.error("conversion insert error", insertErr);
      return NextResponse.json({ error: "Unable to save conversion record." }, { status: 500 });
    }

    const conversionId = conversion.id;
    const basePath = `${user.id}/${conversionId}`;
    const pdfPath = `${basePath}/email-records.pdf`;
    const xlsxPath = `${basePath}/converted-emails.xlsx`;

    if (output === "pdf") {
      const pdfBuffer = await rowsToPdfBuffer(parsedRows);

      await uploadToStorage(supabase, pdfPath, pdfBuffer, "application/pdf");
      await supabase.from("conversions").update({ pdf_path: pdfPath }).eq("id", conversionId);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="email-records.pdf"',
        },
      });
    }

    const xlsxBuffer = await rowsToXlsxBuffer(parsedRows);

    await uploadToStorage(
      supabase,
      xlsxPath,
      xlsxBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await supabase.from("conversions").update({ xlsx_path: xlsxPath }).eq("id", conversionId);

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="converted-emails.xlsx"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ convert-eml failed:", message);
    return NextResponse.json({ error: "Conversion failed.", message }, { status: 500 });
  }
}