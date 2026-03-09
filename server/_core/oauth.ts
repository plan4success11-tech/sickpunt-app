import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type GoogleTokenResponse = {
  access_token: string;
};

type GoogleUserInfo = {
  sub: string;
  name?: string;
  email?: string;
};

function assertGoogleOAuthConfig() {
  if (!ENV.googleClientId || !ENV.googleClientSecret) {
    throw new Error(
      "Missing Google OAuth config: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
    );
  }
}

function getRequestProto(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (Array.isArray(forwardedProto) && forwardedProto[0]) {
    return forwardedProto[0];
  }
  if (typeof forwardedProto === "string" && forwardedProto.length > 0) {
    return forwardedProto.split(",")[0]?.trim() || req.protocol;
  }
  return req.protocol;
}

function resolveGoogleRedirectUri(req: Request): string {
  const host = req.get("host");
  if (!host) {
    throw new Error("Missing request host for dynamic GOOGLE_REDIRECT_URI resolution");
  }
  const proto = getRequestProto(req);
  const dynamicUri = `${proto}://${host}/api/oauth/callback`;

  if (!ENV.googleRedirectUri) return dynamicUri;

  // Mobile/LAN access should not be forced onto localhost redirect URI.
  const requestIsLocalhost = host.includes("localhost") || host.startsWith("127.0.0.1");
  const configuredUsesLocalhost =
    ENV.googleRedirectUri.includes("localhost") || ENV.googleRedirectUri.includes("127.0.0.1");
  if (!requestIsLocalhost && configuredUsesLocalhost) {
    return dynamicUri;
  }

  return ENV.googleRedirectUri;
}

function buildGoogleAuthUrl(req: Request) {
  assertGoogleOAuthConfig();
  const redirectUri = resolveGoogleRedirectUri(req);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ENV.googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  return url.toString();
}

async function exchangeGoogleCodeForToken(code: string, req: Request): Promise<string> {
  assertGoogleOAuthConfig();
  const redirectUri = resolveGoogleRedirectUri(req);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google token exchange failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }

  return payload.access_token;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google user info fetch failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  const payload = (await response.json()) as GoogleUserInfo;
  if (!payload.sub) {
    throw new Error("Google user info response missing sub");
  }

  return payload;
}

export function registerOAuthRoutes(app: Express) {
  // Debug endpoint — remove after auth is confirmed working
  app.get("/api/debug/auth", async (req: Request, res: Response) => {
    const rawCookie = req.headers.cookie || "";
    const COOKIE_NAME_VAL = "app_session_id";
    const cookieParts = rawCookie.split(";").map((s: string) => s.trim());
    const sessionPart = cookieParts.find((p: string) => p.startsWith(COOKIE_NAME_VAL + "="));
    const sessionValue = sessionPart ? sessionPart.slice(COOKIE_NAME_VAL.length + 1) : null;

    const rawSecret = process.env.JWT_SECRET || "sickpunt_jwt_fallback_x9k2mPqR7vLnW4sT8uY3zA6bE1cF5gH0jK";
    let jwtResult: unknown = null;
    let jwtError: string | null = null;

    if (sessionValue) {
      try {
        const { jwtVerify } = await import("jose");
        const secretKey = new TextEncoder().encode(rawSecret);
        const { payload } = await jwtVerify(sessionValue, secretKey, { algorithms: ["HS256"] });
        jwtResult = payload;
      } catch (e) {
        jwtError = e instanceof Error ? e.message : String(e);
      }
    }

    // Check DB for user
    let dbUser: unknown = null;
    let dbError: string | null = null;
    const openId = (jwtResult as any)?.openId;
    if (openId) {
      try {
        dbUser = await db.getUserByOpenId(openId);
      } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
      }
    }

    // Test the full SDK authenticateRequest flow
    let sdkUser: unknown = null;
    let sdkError: string | null = null;
    try {
      sdkUser = await sdk.authenticateRequest(req);
    } catch (e) {
      sdkError = e instanceof Error ? `${e.message} | ${(e as any).stack?.split('\n')[1] ?? ''}` : String(e);
    }

    res.json({
      hasCookie: !!sessionValue,
      cookiePreview: sessionValue ? sessionValue.slice(0, 40) + "..." : null,
      rawCookieHeader: rawCookie || null,
      jwtSecretLength: rawSecret.length,
      jwtPayload: jwtResult,
      jwtError,
      dbUser,
      dbError,
      sdkUser,
      sdkError,
    });
  });

  app.get("/api/oauth/login", (req: Request, res: Response) => {
    try {
      res.redirect(302, buildGoogleAuthUrl(req));
    } catch (error) {
      console.error("[OAuth] Login URL generation failed", error);
      res.status(500).json({ error: "OAuth configuration invalid" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");

    if (!code) {
      const errorParam = getQueryParam(req, "error");
      console.error("[OAuth] Callback missing code, error param:", errorParam);
      res.status(400).json({ error: "code is required", googleError: errorParam });
      return;
    }

    const resolvedRedirectUri = resolveGoogleRedirectUri(req);
    console.log("[OAuth] Callback — resolved redirect_uri:", resolvedRedirectUri);

    try {
      const accessToken = await exchangeGoogleCodeForToken(code, req);
      const userInfo = await fetchGoogleUserInfo(accessToken);

      const openId = `google:${userInfo.sub}`;
      const loginMethod = "google";

      await db.upsertUser({
        openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod,
        lastSignedIn: new Date(),
      });

      const rawSecret = process.env.JWT_SECRET || "sickpunt_jwt_fallback_x9k2mPqR7vLnW4sT8uY3zA6bE1cF5gH0jK";
      console.log("[OAuth] JWT_SECRET length at sign time (direct):", rawSecret.length, "ENV.cookieSecret length:", ENV.cookieSecret.length);
      const secretKey = new TextEncoder().encode(rawSecret);
      const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
      const sessionToken = await new SignJWT({
        openId,
        appId: ENV.appId || "sickpunt",
        name: userInfo.name || "",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(expirationSeconds)
        .sign(secretKey);

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      console.log("[OAuth] SUCCESS — user logged in:", openId, "cookie secure:", cookieOptions.secure);

      res.redirect(302, "/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error("[OAuth] Callback failed:", message, "\n", stack);
      res.status(500).json({ error: "OAuth callback failed", detail: message, stack });
    }
  });
}
