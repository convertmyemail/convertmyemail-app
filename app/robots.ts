import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/how-it-works", "/how-to-save-eml", "/login"],
        disallow: ["/app", "/api"],
      },
    ],
    sitemap: "https://convertmyemail.com/sitemap.xml",
  };
}