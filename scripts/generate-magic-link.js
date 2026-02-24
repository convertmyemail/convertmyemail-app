require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const email = process.argv[2];
  const nextArg = process.argv[3] || "/app"; // optional override

  if (!email) {
    console.log("Usage: node scripts/generate-magic-link.js you@domain.com [/nextPath]");
    console.log('Example: node scripts/generate-magic-link.js you@domain.com "/app"');
    process.exit(1);
  }

  // ✅ Force custom domain + callback, preserve next
  const redirectTo = `https://convertmyemail.com/auth/callback?next=${encodeURIComponent(
    nextArg
  )}`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo }, // must be camelCase
  });

  if (error) throw error;

  const link = data?.properties?.action_link;
  if (!link) {
    throw new Error("No action_link returned. Unexpected response from Supabase.");
  }

  // 🔎 Diagnose what Supabase actually embedded
  const url = new URL(link);
  const embeddedRedirect = url.searchParams.get("redirect_to");

  console.log("\nRequested redirectTo:\n", redirectTo);
  console.log("\nEmbedded redirect_to in generated link:\n", embeddedRedirect);

  if (embeddedRedirect !== redirectTo) {
    console.error("\n❌ Supabase did NOT honor redirectTo.");
    console.error(
      "This almost always means your redirect URL is not allowlisted in Supabase Auth settings."
    );
    console.error("Fix in Supabase → Authentication → URL Configuration:");
    console.error("- Site URL: https://convertmyemail.com");
    console.error("- Redirect URLs include: https://convertmyemail.com/** (and optionally https://www.convertmyemail.com/**)");
    process.exit(2);
  }

  console.log("\n✅ OPEN THIS LINK IN YOUR BROWSER:\n");
  console.log(link);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});