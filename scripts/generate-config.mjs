import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");

export function publicConfig(env) {
  const url = (env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url && !publishableKey) return {};
  if (!url || !publishableKey) throw new Error("Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("SUPABASE_URL must be the HTTPS project URL.");
  }
  let safeKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!safeKey && publishableKey.split(".").length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url").toString());
      safeKey = payload.role === "anon";
    } catch {}
  }
  if (!safeKey) throw new Error("Use a Supabase publishable key or legacy anon key, NEVER a secret/service_role key.");
  return { url, publishableKey };
}

const config = publicConfig(process.env);
const output = process.argv[2] || "supabase-config.js";
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `window.SUPABASE_CONFIG = ${JSON.stringify(config)};\n`, { mode: 0o644 });
console.log("Public Supabase configuration generated.");