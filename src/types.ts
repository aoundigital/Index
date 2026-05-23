export type IndexingStatus = 'pending' | 'checking' | 'indexed' | 'not_indexed' | 'error';

export interface UrlCheckResult {
  url: string;
  status: IndexingStatus;
  errorMessage?: string | null;
  coverageState?: string;       // GSC API verbatim coverage status
  lastCrawlTime?: string | null;
  googleBotMobile?: boolean;    // Smartphone vs Desktop crawler
  robotsTxtState?: string;      // Pass / Fail / Blocked
  indexingState?: string;       // Allowed / Blocked by noindex
  propertyUsed?: string;        // Search Console property used for this URL
  updatedAt?: string;
}

export type OperationMode = 'simulated' | 'production';
export type PropertyStrategy = 'configured' | 'domain' | 'host' | 'origin';

export interface GscCredentials {
  mode: OperationMode;
  apiKey?: string;
  clientEmail?: string;
  privateKey?: string;
  siteUrl?: string; // Property URL in GSC (e.g. "sc-domain:example.com" or "https://example.com/")
  propertyStrategy?: PropertyStrategy;
  propertyMappings?: string;
}

export interface BatchCheckJob {
  id: string;
  name: string;
  createdAt: string;
  totalUrls: number;
  checkedUrls: number;
  status: 'idle' | 'processing' | 'completed' | 'failed';
  results: UrlCheckResult[];
}
