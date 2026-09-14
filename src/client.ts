import { setTimeout as delay } from "node:timers/promises";

export type SwsdMethod = "GET" | "POST" | "PUT";

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface SwsdClientOptions {
  baseUrl?: string;
  token?: string;
  acceptHeader?: string;
  timeoutMs?: number;
}

export class SwsdApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly method: SwsdMethod,
    public readonly url: string,
    public readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "SwsdApiError";
  }
}

export class SwsdClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly acceptHeader: string;
  private readonly timeoutMs: number;

  constructor(options: SwsdClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.SOLARWINDS_SERVICE_DESK_BASE_URL ?? "https://api.samanage.com",
    );
    this.token = options.token ?? process.env.SOLARWINDS_SERVICE_DESK_TOKEN ?? "";
    this.acceptHeader = options.acceptHeader ?? process.env.SOLARWINDS_SERVICE_DESK_ACCEPT ?? "application/vnd.samanage.v2.1+json";
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
      throw new Error("timeoutMs must be a positive integer no greater than 2147483647.");
    }
  }

  async request<T = unknown>(
    method: SwsdMethod,
    path: string,
    options: { query?: QueryParams; body?: unknown } = {},
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        "SOLARWINDS_SERVICE_DESK_TOKEN is not set. Create an API token in SolarWinds Service Desk and pass it as an environment variable.",
      );
    }

    const url = this.buildUrl(path, options.query);
    for (let attempt = 0; ; attempt += 1) {
      let response: Response | undefined;
      const signal = AbortSignal.timeout(this.timeoutMs);
      try {
        response = await fetch(url, {
          method,
          headers: {
            "Accept": this.acceptHeader,
            "Content-Type": "application/json",
            "X-Samanage-Authorization": `Bearer ${this.token}`,
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
        });

        const responseBody = await parseResponseBody(response);
        if (!response.ok) {
          const renderedBody =
            typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2);
          throw new SwsdApiError(
            `SolarWinds Service Desk API ${method} ${url} failed with HTTP ${response.status}${response.headers.has("retry-after") ? ` (Retry-After: ${response.headers.get("retry-after")})` : ""}: ${renderedBody}`,
            response.status,
            method,
            url,
            responseBody,
          );
        }

        return responseBody as T;
      } catch (error) {
        const retryable = error instanceof SwsdApiError
          ? [408, 429, 500, 502, 503, 504].includes(error.status)
          : error instanceof TypeError || signal.aborted;
        const retryAfter = response?.headers.get("retry-after");
        const retryMs = retryAfter == null ? NaN : /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now();
        const waitMs = Number.isNaN(retryMs) ? 500 * 2 ** attempt : Math.max(0, retryMs);
        // ponytail: long Retry-After delays surface to the caller; queue jobs if longer waits are needed.
        if (method !== "GET" || !retryable || attempt >= 2 || waitMs > 5000) {
          if (signal.aborted) {
            throw new Error(`SolarWinds Service Desk API ${method} timed out after ${this.timeoutMs}ms.${method === "GET" ? "" : " The write may have succeeded; verify the record before retrying."}`, { cause: error });
          }
          throw error;
        }
        await delay(waitMs);
      }
    }
  }

  get<T = unknown>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T = unknown>(path: string, body: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>("POST", path, { query, body });
  }

  put<T = unknown>(path: string, body: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>("PUT", path, { query, body });
  }

  private buildUrl(path: string, query: QueryParams = {}): string {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(`${this.baseUrl}/${normalizedPath}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
