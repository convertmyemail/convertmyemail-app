// app/sitemap.xml/route.ts
export const runtime = "nodejs";

export async function GET() {
  const baseUrl = "https://convertmyemail.com";

  const urls = [
    "/",
    "/pricing",
    "/how-it-works",
    "/how-to-save-eml",
    "/login",
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) => `  <url>
    <loc>${baseUrl}${path}</loc>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // cache a bit (optional)
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}