import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const SESSION_COOKIE_NAME = "gsc_indexer_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const activeSessions = new Map<string, { username: string; expiresAt: number }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "250kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Initialize store paths
const CONFIG_FILE = path.join(process.cwd(), "data_config.json");
const BATCHES_FILE = path.join(process.cwd(), "data_batches.json");
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || "";
let mysqlPool: any = null;

// Define basic server credentials (with default fallback for streamlined setup)
const APP_USER = process.env.SECURITY_USERNAME || "admin@empresa.com";
const APP_PASSWORD = process.env.SECURITY_PASSWORD || "gsc-secure-2026";

// Helpers to load/save JSON stores
function loadConfig() {
  if (mysqlPool && appConfig) {
    return appConfig;
  }

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading config file, resetting:", e);
    }
  }
  return {
    mode: "simulated",
    siteUrl: "",
    propertyStrategy: "domain",
    propertyMappings: "",
    clientEmail: "",
    privateKey: "",
    apiKey: ""
  };
}

function saveConfig(config: any) {
  appConfig = config;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  persistStoreValue("config", config);
}

function loadBatches() {
  if (mysqlPool) {
    return checkBatches;
  }

  if (fs.existsSync(BATCHES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BATCHES_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading batches file, resetting:", e);
    }
  }
  return [];
}

function saveBatches(batches: any[]) {
  checkBatches = batches;
  fs.writeFileSync(BATCHES_FILE, JSON.stringify(batches, null, 2), "utf-8");
  persistStoreValue("batches", batches);
}

// Memory stores initialized from file
let appConfig: any = loadConfig();
let checkBatches: any[] = loadBatches();

function isHttpsRequest(req: express.Request) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function getCookie(req: express.Request, name: string): string | null {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return null;
}

function createSession(username: string) {
  const token = "secure-gsc-token-" + crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getRequestToken(req: express.Request) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return getCookie(req, SESSION_COOKIE_NAME);
}

function requireApiAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "Sessão expirada. Faça login novamente." });
  }

  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ success: false, error: "Sessão expirada. Faça login novamente." });
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  next();
}

function getClientIp(req: express.Request) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function isLoginRateLimited(req: express.Request) {
  const key = getClientIp(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

function clearLoginAttempts(req: express.Request) {
  loginAttempts.delete(getClientIp(req));
}

async function persistStoreValue(key: "config" | "batches", value: any) {
  if (!mysqlPool) return;
  try {
    await mysqlPool.execute(
      `INSERT INTO gsc_indexer_store (store_key, payload)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  } catch (err) {
    console.error(`Error persisting ${key} in MySQL:`, err);
  }
}

async function initPersistentStore() {
  if (!DATABASE_URL) return;

  const mysql = await import("mysql2/promise");
  mysqlPool = mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    namedPlaceholders: false
  });

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS gsc_indexer_store (
      store_key VARCHAR(32) PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const [rows] = await mysqlPool.execute("SELECT store_key, payload FROM gsc_indexer_store WHERE store_key IN ('config', 'batches')");
  const savedRows = rows as Array<{ store_key: string; payload: string }>;
  const savedConfig = savedRows.find((row) => row.store_key === "config");
  const savedBatches = savedRows.find((row) => row.store_key === "batches");

  if (savedConfig) {
    appConfig = JSON.parse(savedConfig.payload);
  } else {
    await persistStoreValue("config", appConfig);
  }

  if (savedBatches) {
    checkBatches = JSON.parse(savedBatches.payload);
  } else {
    await persistStoreValue("batches", checkBatches);
  }

  console.log("[GSC Monitor Storage] MySQL ativo via DATABASE_URL/MYSQL_URL.");
}

// -------------------------------------------------------------
// GSC AUTH & API LOGIC
// -------------------------------------------------------------

// Robust private key PEM sanitizer to remove extra newlines, carriage returns, spaces, or escaped sequences
function sanitizePrivateKey(key: string): string {
  if (!key) return "";

  // 1. Replace JSON escaped "\n" sequences with real newlines
  let cleanKey = key.replace(/\\n/g, "\n");

  // 2. Process line by line to trim spacing debris and ignore blank lines
  const lines = cleanKey.split("\n");
  const processedLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    processedLines.push(trimmed);
  }

  return processedLines.join("\n");
}

// Perform immediate sanitization of loaded config on boot if malformed
if (appConfig) {
  let modified = false;
  if (appConfig.privateKey) {
    const sanitizedKey = sanitizePrivateKey(appConfig.privateKey);
    if (sanitizedKey !== appConfig.privateKey) {
      appConfig.privateKey = sanitizedKey;
      modified = true;
    }
  }
  if (appConfig.siteUrl) {
    const trimmedSite = appConfig.siteUrl.trim();
    if (trimmedSite && !trimmedSite.startsWith("http://") && !trimmedSite.startsWith("https://") && !trimmedSite.startsWith("sc-domain:")) {
      appConfig.siteUrl = `sc-domain:${trimmedSite}`;
      modified = true;
    }
  }
  if (modified) {
    saveConfig(appConfig);
  }
}

// Sign JWT and fetch access token for Google API Service Account
function generateJwtAssertion(clientEmail: string, privateKey: string): string {
  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64ClaimSet = Buffer.from(JSON.stringify(claimSet)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${base64Header}.${base64ClaimSet}`);

  // Clean the private key structure completely
  const formattedKey = sanitizePrivateKey(privateKey);
  const signature = sign.sign(formattedKey, "base64url");

  return `${base64Header}.${base64ClaimSet}.${signature}`;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const assertion = generateJwtAssertion(clientEmail, privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Exchanging Service Account Token failed: ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

type PropertyStrategy = "configured" | "domain" | "host" | "origin";

const BR_MULTI_PART_SUFFIXES = new Set([
  "com.br", "org.br", "net.br", "inf.br", "ong.br", "pro.br", "blog.br",
  "srv.br", "gov.br", "edu.br", "adv.br", "agr.br", "art.br", "ind.br",
  "jor.br", "med.br", "tur.br"
]);

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function getCachedAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const cacheKey = `${clientEmail}:${crypto.createHash("sha256").update(privateKey).digest("hex")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const accessToken = await getAccessToken(clientEmail, privateKey);
  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + 55 * 60 * 1000
  });
  return accessToken;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

function getRegistrableDomain(host: string): string {
  const normalized = normalizeHost(host);
  const parts = normalized.split(".").filter(Boolean);

  if (parts.length <= 2) return normalized;

  const suffix = parts.slice(-2).join(".");
  if (BR_MULTI_PART_SUFFIXES.has(suffix) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function parsePropertyMappings(rawMappings = ""): Array<{ host: string; siteUrl: string }> {
  return rawMappings
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^=,;]+?)\s*(?:=>|=|,|;)\s*(.+)$/);
      if (!match) return null;
      return {
        host: normalizeHost(match[1]),
        siteUrl: formatGscProperty(match[2])
      };
    })
    .filter(Boolean) as Array<{ host: string; siteUrl: string }>;
}

function formatGscProperty(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("sc-domain:")) {
    return trimmed;
  }
  return `sc-domain:${normalizeHost(trimmed)}`;
}

function resolveGscPropertyForUrl(url: string, config: any): string {
  const parsed = new URL(url);
  const host = normalizeHost(parsed.hostname);
  const mappings = parsePropertyMappings(config.propertyMappings || "");
  const mapped = mappings.find((entry) => host === entry.host || host.endsWith(`.${entry.host}`));

  if (mapped?.siteUrl) {
    return mapped.siteUrl;
  }

  const strategy = (config.propertyStrategy || (config.siteUrl ? "configured" : "domain")) as PropertyStrategy;
  if (strategy === "configured") {
    return formatGscProperty(config.siteUrl || "");
  }
  if (strategy === "origin") {
    return `${parsed.protocol}//${parsed.hostname}/`;
  }
  if (strategy === "host") {
    return `sc-domain:${host}`;
  }

  return `sc-domain:${getRegistrableDomain(host)}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusLabel(status: string): string {
  if (status === "indexed") return "Indexada";
  if (status === "not_indexed") return "Nao indexada";
  if (status === "checking") return "Processando";
  if (status === "pending") return "Pendente";
  return "Erro";
}

function formatGscLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const labels: Record<string, string> = {
    "PASS": "Aprovado",
    "FAIL": "Falha",
    "NEUTRAL": "Neutro",
    "PARTIAL": "Parcial",
    "URL is unknown to Google": "URL desconhecida pelo Google",
    "Crawled - currently not indexed": "Rastreada, mas ainda nao indexada",
    "Discovered - currently not indexed": "Descoberta, mas ainda nao indexada",
    "Submitted and indexed": "Enviada e indexada",
    "Indexed, not submitted in sitemap": "Indexada, mas nao enviada no sitemap",
    "Page is indexed": "Pagina indexada",
    "Page is not indexed": "Pagina nao indexada",
    "Alternate page with proper canonical tag": "Pagina alternativa com canonical correto",
    "Duplicate without user-selected canonical": "Duplicada sem canonical escolhido pelo usuario",
    "Duplicate, Google chose different canonical than user": "Duplicada; o Google escolheu outro canonical",
    "Duplicate, submitted URL not selected as canonical": "Duplicada; URL enviada nao foi escolhida como canonical",
    "Excluded by 'noindex' tag": "Excluida por tag noindex",
    "Blocked by robots.txt": "Bloqueada pelo robots.txt",
    "Soft 404": "Soft 404",
    "Not found (404)": "Nao encontrada (404)",
    "Redirect error": "Erro de redirecionamento",
    "Page with redirect": "Pagina com redirecionamento",
    "Server error (5xx)": "Erro do servidor (5xx)",
    "Blocked due to access forbidden (403)": "Bloqueada por acesso proibido (403)",
    "Blocked due to other 4xx issue": "Bloqueada por outro problema 4xx",
    "Blocked due to unauthorized request (401)": "Bloqueada por requisicao nao autorizada (401)",
    "Submitted URL blocked by robots.txt": "URL enviada bloqueada pelo robots.txt",
    "Submitted URL marked 'noindex'": "URL enviada marcada como noindex",
    "Submitted URL not found (404)": "URL enviada nao encontrada (404)",
    "Submitted URL seems to be a Soft 404": "URL enviada parece ser Soft 404",
    "Submitted URL has crawl issue": "URL enviada tem problema de rastreamento",
    "Submitted URL has server error (5xx)": "URL enviada tem erro do servidor (5xx)",
    "Crawl allowed?": "Rastreamento permitido?",
    "Indexing allowed?": "Indexacao permitida?",
    "ROBOTS_TXT_STATE_UNSPECIFIED": "Sem dados de robots.txt",
    "ROBOTS_TXT_STATE_ALLOWED": "Permitido pelo robots.txt",
    "ROBOTS_TXT_STATE_DISALLOWED": "Bloqueado pelo robots.txt",
    "INDEXING_STATE_UNSPECIFIED": "Sem dados de diretiva de indexacao",
    "INDEXING_STATE_INDEXING_ALLOWED": "Indexacao permitida",
    "INDEXING_STATE_BLOCKED_BY_META_TAG": "Bloqueado por meta tag noindex",
    "INDEXING_STATE_BLOCKED_BY_HTTP_HEADER": "Bloqueado por cabecalho HTTP",
    "ALLOWED": "Permitido",
    "DISALLOWED": "Bloqueado",
    "BLOCKED": "Bloqueado",
    "INDEXING_ALLOWED": "Indexacao permitida",
    "BLOCKED_BY_META_TAG": "Bloqueado por noindex",
    "BLOCKED_BY_HTTP_HEADER": "Bloqueado por cabecalho HTTP",
    "MOBILE": "Googlebot Smartphone",
    "DESKTOP": "Googlebot Desktop",
    "CRAWLING_USER_AGENT_UNSPECIFIED": "Crawler nao informado",
    "VERDICT_UNSPECIFIED": "Veredito nao informado",
    "AMP_UNSPECIFIED": "AMP nao informado",
    "RICH_RESULTS_UNSPECIFIED": "Resultados aprimorados nao informados",
    "You do not own this site, or the inspected URL is not part of this property.": "Voce nao tem permissao nesta propriedade, ou a URL inspecionada nao pertence a ela."
  };

  return labels[text] || text;
}

function renderBatchHtmlTable(batch: any): string {
  const rows = batch.results.map((item: any) => {
    const lastCrawl = item.lastCrawlTime ? new Date(item.lastCrawlTime).toLocaleString("pt-BR") : "Sem historico";
    return `    <tr>
      <td><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></td>
      <td>${escapeHtml(statusLabel(item.status))}</td>
      <td>${escapeHtml(formatGscLabel(item.coverageState || item.errorMessage || ""))}</td>
      <td>${escapeHtml(item.propertyUsed || "")}</td>
      <td>${escapeHtml(lastCrawl)}</td>
      <td>${escapeHtml(formatGscLabel(item.robotsTxtState || ""))}</td>
      <td>${escapeHtml(formatGscLabel(item.indexingState || ""))}</td>
    </tr>`;
  }).join("\n");

  return `<table border="1" cellpadding="8" cellspacing="0">
  <thead>
    <tr>
      <th>URL</th>
      <th>Condicao de indexacao</th>
      <th>Estado de cobertura</th>
      <th>Propriedade GSC usada</th>
      <th>Ultimo rastreio</th>
      <th>Robots.txt</th>
      <th>Diretiva de indexacao</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

// Call real Google Search Console URL Inspection API
async function inspectGscUrl(url: string, siteUrl: string, clientEmail: string, privateKey: string) {
  try {
    const token = await getCachedAccessToken(clientEmail, privateKey);
    const response = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        inspectionUrl: url,
        siteUrl: siteUrl,
        languageCode: "pt-BR"
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      let errMsg = errJson?.error?.message || `HTTP ${response.status}`;
      
      const lowerErr = errMsg.toLowerCase();
      if (lowerErr.includes("invalid") || lowerErr.includes("mismatch") || lowerErr.includes("not under") || response.status === 400) {
        errMsg = `${errMsg} (Dica: Certifique-se de que a URL da Propriedade GSC configurada é exatamente idêntica à do Search Console, ex: usar "sc-domain:seusite.com" se for propriedade de domínio, ou "https://seusite.com/" com protocolo se for URL-prefix. Além disso, as URLs inspecionadas devem pertencer a essa propriedade GSC)`;
      }

      return {
        status: "error" as const,
        propertyUsed: siteUrl,
        errorMessage: errMsg
      };
    }

    const inspectData = (await response.json()) as any;
    const result = inspectData?.inspectionResult;
    if (!result) {
      return {
        status: "error" as const,
        errorMessage: "Nenhum resultado recebido do Search Console."
      };
    }

    const indexStatus = result.indexStatusResult;
    if (!indexStatus) {
      return {
        status: "error" as const,
        errorMessage: "Objeto indexStatusResult ausente na resposta do Search Console."
      };
    }

    // Determine status
    // GSC verdict can be PASS (indexed), FAIL (not indexed), or NEUTRAL/PARTIAL (issue / not crawled)
    const verdict = indexStatus.verdict;
    const isIndexed = verdict === "PASS";

    return {
      status: (isIndexed ? "indexed" : "not_indexed") as "indexed" | "not_indexed",
      errorMessage: null,
      propertyUsed: siteUrl,
      coverageState: formatGscLabel(indexStatus.coverageState || "Status desconhecido"),
      lastCrawlTime: indexStatus.lastCrawlTime || null,
      googleBotMobile: indexStatus.crawledAs === "MOBILE",
      robotsTxtState: formatGscLabel(indexStatus.robotsTxtState || "DESCONHECIDO"),
      indexingState: formatGscLabel(indexStatus.indexingState || "DESCONHECIDO")
    };
  } catch (err: any) {
    return {
      status: "error" as const,
      propertyUsed: siteUrl,
      errorMessage: err.message || "Erro de rede ao conectar com GSC"
    };
  }
}

// Background batch runner loop
async function processBatchAsync(batchId: string) {
  const batchIdx = checkBatches.findIndex((b) => b.id === batchId);
  if (batchIdx === -1 || checkBatches[batchIdx].status !== "processing") return;

  const batch = checkBatches[batchIdx];
  const config = loadConfig();

  for (let i = 0; i < batch.results.length; i++) {
    // Reload dynamically to check if job was cancelled or deleted
    const currentBatches = loadBatches();
    const currentBatchIdx = currentBatches.findIndex((b: any) => b.id === batchId);
    if (currentBatchIdx === -1 || currentBatches[currentBatchIdx].status !== "processing") {
      console.log(`Batch ${batchId} was interrupted.`);
      return;
    }

    const item = batch.results[i];
    if (item.status !== "pending") {
      continue;
    }

    // Set item status to checking
    item.status = "checking";
    batch.checkedUrls = i;
    saveBatches(checkBatches);

    let inspectionResult;

    if (config.mode === "simulated") {
      // Simulate real indexing states with a small realistic checking delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      const mockVerdicts = [
        {
          status: "indexed" as const,
          coverageState: "Indexado, enviado no sitemap",
          googleBotMobile: true,
          robotsTxtState: "PERMITIDO",
          indexingState: "INDEXAÇÃO_PERMITIDA"
        },
        {
          status: "indexed" as const,
          coverageState: "Indexado, mas não enviado no sitemap",
          googleBotMobile: true,
          robotsTxtState: "PERMITIDO",
          indexingState: "INDEXAÇÃO_PERMITIDA"
        },
        {
          status: "not_indexed" as const,
          coverageState: "Rastreado, mas não indexado no momento",
          googleBotMobile: true,
          robotsTxtState: "PERMITIDO",
          indexingState: "INDEXAÇÃO_PERMITIDA"
        },
        {
          status: "not_indexed" as const,
          coverageState: "Excluído por tag 'noindex'",
          googleBotMobile: false,
          robotsTxtState: "PERMITIDO",
          indexingState: "BLOQUEADO_POR_NOINDEX"
        },
        {
          status: "not_indexed" as const,
          coverageState: "Não encontrado (404)",
          googleBotMobile: true,
          robotsTxtState: "PERMITIDO",
          indexingState: "INDEXAÇÃO_PERMITIDA"
        },
        {
          status: "not_indexed" as const,
          coverageState: "Bloqueado pelo robots.txt",
          googleBotMobile: false,
          robotsTxtState: "BLOQUEADO",
          indexingState: "BLOQUEADO_POR_ROBOTS"
        }
      ];

      // Add variation based on matching key strings in URLs (to make simulation interactive)
      let idxOffset = Math.floor(Math.random() * mockVerdicts.length);
      if (item.url.includes("noindex")) {
        idxOffset = 3;
      } else if (item.url.includes("404") || item.url.includes("error")) {
        idxOffset = 4;
      } else if (item.url.includes("robots")) {
        idxOffset = 5;
      } else if (item.url.includes("sucesso") || item.url.includes("artigo") || item.url.includes("produto")) {
        idxOffset = 0;
      }

      const selectedMock = mockVerdicts[idxOffset % mockVerdicts.length];

      inspectionResult = {
        ...selectedMock,
        propertyUsed: resolveGscPropertyForUrl(item.url, config),
        lastCrawlTime: new Date(Date.now() - Math.random() * 24 * 3600 * 1000 * 15).toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage: null
      };
    } else {
      // Real API mode
      // GSC limits rate checks, but let's throttle checks by 1.2s to be completely safe
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const propertyUsed = resolveGscPropertyForUrl(item.url, config);

      if (!config.clientEmail || !config.privateKey || !propertyUsed) {
        inspectionResult = {
          status: "error" as const,
          errorMessage: "Configurações de credenciais da API do Google Search Console ausentes ou incorretas.",
          propertyUsed,
          updatedAt: new Date().toISOString()
        };
      } else {
        inspectionResult = await inspectGscUrl(
          item.url,
          propertyUsed,
          config.clientEmail,
          config.privateKey
        );
      }
    }

    // Assign to item
    item.status = inspectionResult.status;
    item.errorMessage = inspectionResult.errorMessage;
    item.coverageState = inspectionResult.coverageState;
    item.lastCrawlTime = inspectionResult.lastCrawlTime;
    item.googleBotMobile = inspectionResult.googleBotMobile;
    item.robotsTxtState = inspectionResult.robotsTxtState;
    item.indexingState = inspectionResult.indexingState;
    item.propertyUsed = inspectionResult.propertyUsed;
    item.updatedAt = new Date().toISOString();

    batch.checkedUrls = i + 1;
    saveBatches(checkBatches);

    // Stop execution early if the batch status isn't "processing" anymore (e.g., deleted or paused)
    const testBatches = loadBatches();
    const testIdx = testBatches.findIndex((b: any) => b.id === batchId);
    if (testIdx === -1 || testBatches[testIdx].status !== "processing") {
      return;
    }
  }

  // Finished processing all items
  batch.status = "completed";
  batch.checkedUrls = batch.totalUrls;
  saveBatches(checkBatches);
}

// -------------------------------------------------------------
// ENDPOINTS DE SEGURANÇA & SESSÃO (LOGIN)
// -------------------------------------------------------------

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  if (isLoginRateLimited(req)) {
    return res.status(429).json({ success: false, error: "Muitas tentativas de login. Aguarde alguns minutos." });
  }

  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Usuário e senha são obrigatórios." });
  }

  if (username.trim().toLowerCase() === APP_USER.trim().toLowerCase() && password === APP_PASSWORD) {
    clearLoginAttempts(req);
    const token = createSession(APP_USER);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isHttpsRequest(req),
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
      path: "/"
    });
    return res.json({
      success: true,
      user: {
        username: APP_USER,
        name: "Administrador"
      },
      token
    });
  }

  return res.status(401).json({ success: false, error: "Credenciais de acesso incorretas." });
});

// Security Warning Banner API
app.get("/api/auth/details", (req, res) => {
  const isDefault = (APP_USER === "admin@empresa.com" && APP_PASSWORD === "gsc-secure-2026");
  res.json({
    success: true,
    user: APP_USER,
    isUsingDefaultCredentials: isDefault
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getRequestToken(req);
  if (token) activeSessions.delete(token);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

app.use("/api", requireApiAuth);

// -------------------------------------------------------------
// API DE CONFIGURAÇÕES DO GSC
// -------------------------------------------------------------

app.get("/api/config", (req, res) => {
  const cfg = loadConfig();
  // We sanitize private key and credentials for frontend safety
  res.json({
    success: true,
    mode: cfg.mode || "simulated",
    siteUrl: cfg.siteUrl || "",
    propertyStrategy: cfg.propertyStrategy || "domain",
    propertyMappings: cfg.propertyMappings || "",
    clientEmail: cfg.clientEmail || "",
    hasPrivateKey: !!cfg.privateKey,
    hasApiKey: !!cfg.apiKey
  });
});

app.post("/api/config", (req, res) => {
  const { mode, siteUrl, propertyStrategy, propertyMappings, clientEmail, privateKey, apiKey } = req.body;

  if (!mode || (mode !== "simulated" && mode !== "production")) {
    return res.status(400).json({ success: false, error: "Modo operacional inválido." });
  }

  const normalizedStrategy = (propertyStrategy || "domain") as PropertyStrategy;
  if (!["configured", "domain", "host", "origin"].includes(normalizedStrategy)) {
    return res.status(400).json({ success: false, error: "Estratégia de propriedade GSC inválida." });
  }

  const newConfig = {
    mode,
    siteUrl: formatGscProperty(siteUrl || ""),
    propertyStrategy: normalizedStrategy,
    propertyMappings: propertyMappings || "",
    clientEmail: clientEmail || "",
    privateKey: privateKey ? sanitizePrivateKey(privateKey) : "",
    apiKey: apiKey || ""
  };

  // If private key is omitted (frontend sends placeholder or empty to keep existing),
  // we preserve the old private key
  const prevConfig = loadConfig();
  if (!newConfig.privateKey && prevConfig.privateKey) {
    newConfig.privateKey = prevConfig.privateKey;
  }
  if (!newConfig.apiKey && prevConfig.apiKey) {
    newConfig.apiKey = prevConfig.apiKey;
  }

  // Validation if production is selected
  if (mode === "production") {
    if (newConfig.propertyStrategy === "configured" && !newConfig.siteUrl) {
      return res.status(400).json({ success: false, error: "No modo Produção, a URL da propriedade GSC é obrigatória." });
    }
    if (!newConfig.clientEmail || !newConfig.privateKey) {
      return res.status(400).json({ success: false, error: "No modo Produção, o E-mail e Chave Privada do Service Account são obrigatórios." });
    }
  }

  appConfig = newConfig;
  saveConfig(newConfig);

  res.json({ success: true, message: "Configuração do GSC salva com sucesso!" });
});

// -------------------------------------------------------------
// API DE LOTES / LOT COMPLETED SYSTEM
// -------------------------------------------------------------

// Get list of batches
app.get("/api/batches", (req, res) => {
  res.json({ success: true, batches: checkBatches });
});

// Render one batch as a plain HTML table for publishing or pasting in editors
app.get("/api/batches/:id/html", (req, res) => {
  const batch = checkBatches.find((b) => b.id === req.params.id);
  if (!batch) {
    return res.status(404).send("Lote de verificacao nao encontrado.");
  }
  res.type("html").send(renderBatchHtmlTable(batch));
});

// Get a single batch with full inspection rows
app.get("/api/batches/:id", (req, res) => {
  const batch = checkBatches.find((b) => b.id === req.params.id);
  if (!batch) {
    return res.status(404).json({ success: false, error: "Lote de verificação não encontrado." });
  }
  res.json({ success: true, batch });
});

// Create a new batch check job
app.post("/api/batches", (req, res) => {
  const { name, urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, error: "Envie uma lista de URLs válida." });
  }

  // Validate and sanitize URLs
  const cleanUrls: string[] = [];
  const urlRegex = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i;

  for (const rawUrl of urls) {
    const trimmed = rawUrl.trim();
    if (trimmed) {
      if (urlRegex.test(trimmed)) {
        cleanUrls.push(trimmed);
      } else {
        // Fallback for missing protocol
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
          const patched = `https://${trimmed}`;
          if (urlRegex.test(patched)) {
            cleanUrls.push(patched);
          }
        }
      }
    }
  }

  if (cleanUrls.length === 0) {
    return res.status(400).json({ success: false, error: "Nenhuma URL informada possui formato válido (ex: https://dominio.com/pagina)." });
  }

  // Limit block size to 150 URLs per request to ensure safety
  const finalUrls = cleanUrls.slice(0, 150);

  const newBatch = {
    id: "batch-" + crypto.randomBytes(6).toString("hex"),
    name: name?.trim() || `Lote #${checkBatches.length + 1} (${finalUrls.length} URLs)`,
    createdAt: new Date().toISOString(),
    totalUrls: finalUrls.length,
    checkedUrls: 0,
    status: "processing" as const,
    results: finalUrls.map((u) => ({
      url: u,
      status: "pending" as const,
      errorMessage: null,
      coverageState: "Aguardando fila de processamento...",
      lastCrawlTime: null,
      googleBotMobile: true,
      robotsTxtState: "PENDENTE",
      indexingState: "PENDENTE",
      propertyUsed: "",
      updatedAt: new Date().toISOString()
    }))
  };

  checkBatches.unshift(newBatch);
  saveBatches(checkBatches);

  // Trigger background asynchronous processing
  processBatchAsync(newBatch.id);

  res.status(201).json({ success: true, batch: newBatch });
});

// Cancel/stop active processing of a batch
app.post("/api/batches/:id/stop", (req, res) => {
  const batchIdx = checkBatches.findIndex((b) => b.id === req.params.id);
  if (batchIdx === -1) {
    return res.status(404).json({ success: false, error: "Lote não encontrado." });
  }

  const batch = checkBatches[batchIdx];
  if (batch.status === "processing") {
    batch.status = "failed"; // Marks it stopped
    // Mark remaining pending as Stopped
    batch.results.forEach((item) => {
      if (item.status === "pending" || item.status === "checking") {
        item.status = "error";
        item.coverageState = "Verificação cancelada pelo usuário.";
      }
    });
    saveBatches(checkBatches);
    return res.json({ success: true, message: "Verificações canceladas com sucesso.", batch });
  }

  res.json({ success: true, message: "O lote já não estava em andamento.", batch });
});

// Delete a batch
app.delete("/api/batches/:id", (req, res) => {
  const batchIdx = checkBatches.findIndex((b) => b.id === req.params.id);
  if (batchIdx === -1) {
    return res.status(404).json({ success: false, error: "Lote de verificação não encontrado." });
  }

  checkBatches.splice(batchIdx, 1);
  saveBatches(checkBatches);

  res.json({ success: true, message: "Lote excluído com sucesso do histórico." });
});

// Clean up database (reset all)
app.post("/api/batches/clear-all", (req, res) => {
  checkBatches = [];
  saveBatches(checkBatches);
  res.json({ success: true, message: "Histórico limpo com sucesso!" });
});


// -------------------------------------------------------------
// VITE OR STATIC SERVING MIDDLEWARE
// -------------------------------------------------------------

async function startServer() {
  await initPersistentStore();

  if (process.env.NODE_ENV !== "production") {
    // Mount Vite development server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve absolute built assets
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GSC Monitor Service] Rodando na porta ${PORT}`);
    console.log(`[GSC Monitor Service] Endereço local: http://localhost:${PORT}`);
    console.log(`[GSC Monitor API Login] Usuário: ${APP_USER} | Senha: ${APP_PASSWORD}`);
  });
}

startServer();
