/**
 * HTTP client with retries, idempotency, and observability
 */
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { MolamError } from "./errors";
import { Logger } from "./logger";
import { backoff, isRetryableStatus } from "./utils/retry";
import { ensureIdempotencyKey } from "./utils/idempotency";

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

export class HttpClient {
  private ax: AxiosInstance;
  private opts: HttpClientOptions;

  constructor(opts: HttpClientOptions) {
    this.opts = {
      timeoutMs: 8000,
      maxRetries: 3,
      userAgent: "Molam-SDK-Node/2.0",
      ...opts
    };

    this.ax = axios.create({
      baseURL: this.opts.baseUrl,
      timeout: this.opts.timeoutMs,
      headers: {
        "Authorization": `Bearer ${this.opts.apiKey}`,
        "User-Agent": this.opts.userAgent,
        "Content-Type": "application/json"
      }
    });
  }

  private async requestWithRetry<T>(config: AxiosRequestConfig, maxRetries = 3) : Promise<T> {
    let attempt = 0;
    const idempotencyKey = ensureIdempotencyKey(config.headers as any);
    config.headers = { ...(config.headers || {}), "Idempotency-Key": idempotencyKey };

    while (true) {
      try {
        Logger.info(`HTTP ${config.method} ${config.url} attempt=${attempt+1}`);
        const res = await this.ax.request<T>(config);
        return res.data;
      } catch (err: any) {
        const status = err?.response?.status;
        const me = MolamError.fromAxios(err);
        Logger.warn(`HTTP error ${config.method} ${config.url} status=${status} attempt=${attempt+1}`, { code: me.code });

        if (attempt >= maxRetries || !isRetryableStatus(status)) {
          throw me;
        }

        const wait = backoff(attempt);
        await new Promise(r => setTimeout(r, wait));
        attempt++;
      }
    }
  }

  async get<T = any>(path: string, opts?: AxiosRequestConfig) {
    return this.requestWithRetry<T>({ method: "GET", url: path, ...opts }, this.opts.maxRetries);
  }

  async post<T = any>(path: string, body?: any, opts?: AxiosRequestConfig) {
    return this.requestWithRetry<T>({ method: "POST", url: path, data: body, ...opts }, this.opts.maxRetries);
  }

  async put<T = any>(path: string, body?: any, opts?: AxiosRequestConfig) {
    return this.requestWithRetry<T>({ method: "PUT", url: path, data: body, ...opts }, this.opts.maxRetries);
  }

  async delete<T = any>(path: string, opts?: AxiosRequestConfig) {
    return this.requestWithRetry<T>({ method: "DELETE", url: path, ...opts }, this.opts.maxRetries);
  }
}
