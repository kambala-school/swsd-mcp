export type SwsdMethod = "GET" | "POST" | "PUT";

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface SwsdClientOptions {
  baseUrl?: string;
  token?: string;
  acceptHeader?: string;
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

  constructor(options: SwsdClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.SOLARWINDS_SERVICE_DESK_BASE_URL ?? "https://api.samanage.com",
    );
    this.token = options.token ?? process.env.SOLARWINDS_SERVICE_DESK_TOKEN ?? "";
    this.acceptHeader = options.acceptHeader ?? process.env.SOLARWINDS_SERVICE_DESK_ACCEPT ?? "application/vnd.samanage.v2.1+json";
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
    const response = await fetch(url, {
      method,
      headers: {
        "Accept": this.acceptHeader,
        "Content-Type": "application/json",
        "X-Samanage-Authorization": `Bearer ${this.token}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      const renderedBody =
        typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2);
      throw new SwsdApiError(
        `SolarWinds Service Desk API ${method} ${url} failed with HTTP ${response.status}: ${renderedBody}`,
        response.status,
        method,
        url,
        responseBody,
      );
    }

    return responseBody as T;
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
