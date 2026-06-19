import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { pool } from "./db";

const app = express();
const log = console.log;

const projectRootCandidates = Array.from(
  new Set([
    process.cwd(),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
  ]),
);

function resolveExistingFile(...segments: string[]): string | undefined {
  for (const root of projectRootCandidates) {
    const candidate = path.resolve(root, ...segments);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
}

function resolveExistingDirectory(...segments: string[]): string | undefined {
  for (const root of projectRootCandidates) {
    const candidate = path.resolve(root, ...segments);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return undefined;
}

function resolveProjectPath(...segments: string[]): string {
  return path.resolve(projectRootCandidates[0], ...segments);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function addUrlOrigin(origins: Set<string>, rawUrl?: string) {
  if (!rawUrl) return;

  try {
    origins.add(new URL(rawUrl).origin);
  } catch {
    // Ignore invalid URLs in optional deployment env vars.
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Add production domains
    origins.add("https://a2blift.com");
    origins.add("https://www.a2blift.com");
    origins.add("https://a2b-lift.onrender.com");
    origins.add("https://peaceful-mousse-459c85.netlify.app");

    addUrlOrigin(origins, process.env.FRONTEND_URL);
    addUrlOrigin(origins, process.env.PUBLIC_REFERRAL_BASE_URL);
    addUrlOrigin(origins, process.env.EXPO_PUBLIC_REFERRAL_BASE_URL);

    // Railway domains — wildcard handled below via includes check
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost, local IPs, and tunnel domains for Expo development
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:") ||
      origin?.startsWith("http://192.168.") ||
      origin?.startsWith("http://10.") ||
      origin?.includes(".exp.direct") ||
      origin?.includes(".trycloudflare.com") ||
      origin?.includes(".serveousercontent.com") ||
      origin?.includes(".gitpod.dev") ||
      origin?.includes(".up.railway.app") ||
      origin?.includes(".netlify.app") ||
      (origin?.match(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./) !== null);

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupSecurity(app: express.Application) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://js.paystack.co", "https://checkout.paystack.com"],
          scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://js.paystack.co", "https://checkout.paystack.com"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.paystack.com"],
          frameAncestors: ["'self'", "https://*.replit.dev", "https://*.repl.co", "https://*.replit.com", "https://*.replit.app"],
        },
      },
      frameguard: false,
    })
  );
  app.use(cookieParser());
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!requestPath.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = resolveExistingFile("app.json") || resolveProjectPath("app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

// Try 8081 first (configured in Start Frontend workflow), fall back to 8080
const METRO_PORTS = [8081, 8080, 8082];
let resolvedMetroPort = 8081;

async function detectMetroPort(): Promise<number> {
  const net = await import("net");
  for (const port of METRO_PORTS) {
    const open = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); resolve(true); });
      s.once("error", () => resolve(false));
    });
    if (open) { resolvedMetroPort = port; return port; }
  }
  return resolvedMetroPort;
}

function hasStaticBuild(): boolean {
  return Boolean(resolveExistingFile("static-build", "index.html"));
}

function hasWebsiteBuild(): boolean {
  return Boolean(resolveExistingFile("website", "index.html"));
}

// Proxy factory — always uses resolvedMetroPort so it stays current
function makeMetroProxy(port: number) {
  return createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq: any) => {
        // Override Origin/Host so Metro's CORS check sees a localhost origin
        proxyReq.setHeader("Origin", `http://localhost:${port}`);
        proxyReq.setHeader("Host", `localhost:${port}`);
      },
      error: (_err: any, _req: any, res: any) => {
        if (res && typeof res.status === "function") {
          res.status(502).json({ error: "Metro bundler not reachable — is Start Frontend running?" });
        }
      },
    },
  });
}

// Start with default; detectMetroPort() will correct this on startup
let metroProxy = makeMetroProxy(8081);

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

async function configureExpoAndLanding(app: express.Application) {
  const isRailwayRuntime = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID,
  );
  const isProductionRuntime = process.env.NODE_ENV === "production" || isRailwayRuntime;
  const appPort = Number.parseInt(process.env.PORT || "", 10);
  let allowMetroProxy = !isProductionRuntime;
  const adminTemplatePath =
    resolveExistingFile("server", "templates", "admin.html") ||
    resolveProjectPath("server", "templates", "admin.html");
  const adminTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
  const assetsRoot =
    resolveExistingDirectory("assets") || resolveProjectPath("assets");
  const staticBuildRoot =
    resolveExistingDirectory("static-build") ||
    resolveProjectPath("static-build");
  const websiteRoot =
    resolveExistingDirectory("website") || resolveProjectPath("website");

  // Metro proxying is for development only; production must never proxy web/admin paths.
  let metroPort = resolvedMetroPort;
  if (allowMetroProxy) {
    // Detect which port Metro actually started on (8080 or 8081)
    metroPort = await detectMetroPort();
    if (Number.isFinite(appPort) && appPort === metroPort) {
      // Hard stop for self-proxy loops (app -> Metro on same port -> app).
      allowMetroProxy = false;
      log(`Metro proxy disabled because target port ${metroPort} equals app PORT ${appPort}`);
    }
    metroProxy = makeMetroProxy(metroPort);
    log(`Metro bundler detected on port ${metroPort}`);
  }

  const staticBuildExists = hasStaticBuild();
  const websiteBuildExists = hasWebsiteBuild();
  if (!allowMetroProxy) {
    log(
      `Static build: ${staticBuildExists ? "found" : "not found"}; website build: ${websiteBuildExists ? "found" : "not found"} — production mode (Metro proxy disabled)`,
    );
  } else {
    log(
      `Static build: ${staticBuildExists ? "found" : "not found"}; website build: ${websiteBuildExists ? "found" : "not found"} — routing non-API traffic to Metro:${metroPort}`,
    );
  }

  // Admin dashboard — served at BOTH /admin and /a2b-admin (new URL busts any stale browser cache)
  const serveAdmin = (_req: Request, res: Response) => {
    const freshTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).send(freshTemplate);
  };
  app.get("/admin", serveAdmin);
  app.get("/a2b-admin", serveAdmin);

  const serveReferralLaunch = (req: Request, res: Response) => {
    const referralCode = req.params.code;
    const appTarget = String(req.query.app || req.query.source || req.query.role || "").trim();
    const params = new URLSearchParams();
    if (referralCode) params.set("code", referralCode);
    if (appTarget) params.set("app", appTarget);
    const clientIosUrl = process.env.A2B_CLIENT_IOS_APP_STORE_URL || process.env.EXPO_PUBLIC_CLIENT_IOS_APP_STORE_URL || "";
    const driverIosUrl = process.env.A2B_DRIVER_IOS_APP_STORE_URL || process.env.EXPO_PUBLIC_DRIVER_IOS_APP_STORE_URL || "";
    const clientAndroidUrl = process.env.A2B_CLIENT_ANDROID_STORE_URL || process.env.EXPO_PUBLIC_CLIENT_ANDROID_STORE_URL || "";
    const driverAndroidUrl = process.env.A2B_DRIVER_ANDROID_STORE_URL || process.env.EXPO_PUBLIC_DRIVER_ANDROID_STORE_URL || "https://play.google.com/store/apps/details?id=com.a2blift";
    if (clientIosUrl) params.set("clientIosUrl", clientIosUrl);
    if (driverIosUrl) params.set("driverIosUrl", driverIosUrl);
    if (clientAndroidUrl) params.set("clientAndroidUrl", clientAndroidUrl);
    if (driverAndroidUrl) params.set("driverAndroidUrl", driverAndroidUrl);
    const target = referralCode
      ? `/referral-launch.html?${params.toString()}`
      : "/referral-launch.html";
    res.redirect(302, target);
  };
  app.get("/referral/:code", serveReferralLaunch);
  app.get("/ref/:code", serveReferralLaunch);
  app.get("/r/:code", serveReferralLaunch);

  // Serve local assets folder
  app.use("/assets", express.static(assetsRoot));

  if (websiteBuildExists) {
    app.get("/", (_req, res) => {
      res.sendFile(path.resolve(websiteRoot, "index.html"));
    });

    app.use(
      express.static(websiteRoot, {
        extensions: ["html"],
      }),
    );
  }

  // If a static web build exists, serve it for non-API paths
  if (staticBuildExists) {
    app.use(express.static(staticBuildRoot));
    // Catch-all for SPA routing — still proxy native manifests
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      const platform = req.header("expo-platform");
      if (allowMetroProxy && (platform === "ios" || platform === "android")) {
        log(`[Metro proxy] ${platform} manifest → Metro:${metroPort}`);
        return (metroProxy as any)(req, res, next);
      }
      const staticIndex = path.resolve(staticBuildRoot, "index.html");
      res.sendFile(staticIndex);
    });
  } else if (websiteBuildExists) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();

      const htmlPath = path.resolve(
        websiteRoot,
        `${req.path.replace(/^\//, "")}.html`,
      );

      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }

      return res.status(404).sendFile(path.resolve(websiteRoot, "index.html"));
    });
  } else if (allowMetroProxy) {
    // No static build — proxy everything (web + native) to Metro
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next(); // handled above
      if (req.path.startsWith("/socket.io")) return next(); // let Socket.IO handle this
      const platform = req.header("expo-platform") || "web";
      log(`[Metro proxy] ${platform} ${req.path} → Metro:${metroPort}`);
      return (metroProxy as any)(req, res, next);
    });
  } else {
    // Production + no static build: avoid proxy loops; keep API/admin routes only.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      return res.status(404).json({ message: "Web build not available on this deployment" });
    });
  }

  log("Expo routing configured");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  // Run startup migrations — idempotent, safe to run on every deploy
  try {
    await pool.query(`
      ALTER TABLE chauffeurs ALTER COLUMN vehicle_model DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN plate_number DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN vehicle_type DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN car_color DROP NOT NULL;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS available_for_long_distance boolean DEFAULT false;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_from text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_to text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_date text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_price_per_seat real;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_seats_available integer DEFAULT 0;
    `);
    console.log("[MIGRATION] Long-distance columns ensured ✅");
  } catch (err: any) {
    console.error("[MIGRATION] Warning: could not apply long-distance migration:", err.message);
  }

  try {
    await pool.query(`ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS active_vehicle_id varchar`);
    await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operator_profiles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL UNIQUE REFERENCES users(id),
        type text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        rejection_reason text,
        submitted_at timestamp,
        reviewed_at timestamp,
        reviewer_admin_id varchar REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_profiles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_profile_id varchar NOT NULL UNIQUE REFERENCES operator_profiles(id),
        company_name text NOT NULL,
        registration_number text NOT NULL,
        contact_person_name text NOT NULL,
        contact_phone text NOT NULL,
        contact_email text NOT NULL,
        bank_name text NOT NULL,
        account_holder text NOT NULL,
        account_number text NOT NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        status text NOT NULL DEFAULT 'draft',
        car_make text NOT NULL,
        vehicle_model text NOT NULL,
        vehicle_year integer NOT NULL,
        plate_number text NOT NULL,
        vehicle_type text NOT NULL,
        car_color text NOT NULL,
        passenger_capacity integer DEFAULT 4,
        luggage_capacity integer DEFAULT 2,
        rejection_reason text,
        submitted_at timestamp,
        reviewed_at timestamp,
        reviewer_admin_id varchar REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_plate_unique ON vehicles (upper(plate_number)) WHERE status <> 'rejected'`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_assignments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id varchar NOT NULL REFERENCES vehicles(id),
        driver_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        assigned_by_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        status text NOT NULL DEFAULT 'active',
        created_at timestamp DEFAULT now(),
        removed_at timestamp
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_driver_invites (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        invited_by_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        invited_by_user_id varchar NOT NULL REFERENCES users(id),
        status text NOT NULL DEFAULT 'pending',
        email_status text NOT NULL DEFAULT 'queued',
        email_error text,
        message text,
        resend_id text,
        sent_at timestamp,
        accepted_at timestamp,
        declined_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS fleet_driver_invites_manager_idx
        ON fleet_driver_invites (invited_by_operator_profile_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS fleet_driver_invites_driver_idx
        ON fleet_driver_invites (driver_operator_profile_id, created_at DESC)
    `);
    console.log("[MIGRATION] Fleet onboarding tables ensured ✅");
  } catch (err: any) {
    console.error("[MIGRATION] Warning: could not apply fleet onboarding migration:", err.message);
  }

  setupCors(app);
  setupSecurity(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  await configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Use process.env.PORT for deployment (Heroku, Railway, Render, etc.)
  // Falls back to 5000 for local development
  const port = parseInt(process.env.PORT || "5000", 10);
  const portSource = process.env.PORT ? "process.env.PORT" : "default (5000)";
  
  server.listen(
    {
      port,
      host: "0.0.0.0", // Listen on all interfaces for deployment
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port} (from ${portSource})`);
    },
  );
})();
