export const ENV = {
  get appId() { return process.env.VITE_APP_ID ?? ""; },
  get cookieSecret() { return process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.OAUTH_SERVER_URL ?? ""; },
  get googleClientId() { return process.env.GOOGLE_CLIENT_ID ?? ""; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? ""; },
  get googleRedirectUri() { return process.env.GOOGLE_REDIRECT_URI ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get oddsApiKey() { return process.env.ODDS_API_KEY ?? ""; },
};

// Startup validation
const missing = ["JWT_SECRET","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","DATABASE_URL"]
  .filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error("[ENV] MISSING required env vars:", missing.join(", "));
} else {
  console.log("[ENV] All critical env vars present. JWT_SECRET length:", (process.env.JWT_SECRET ?? "").length);
}
