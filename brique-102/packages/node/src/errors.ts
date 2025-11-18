/**
 * Industrial error type for Molam SDK
 */
export class MolamError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: any;

  constructor(code: string, message: string, status: number = 500, requestId?: string, details?: any) {
    super(message);
    this.name = "MolamError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }

  static fromAxios(err: any) {
    const status = err?.response?.status ?? 500;
    const body = err?.response?.data;
    const code = body?.error?.code ?? (status >= 500 ? "server_error" : "request_failed");
    const message = body?.error?.message ?? err.message ?? "unknown_error";
    const requestId = err?.response?.headers?.["x-molam-request-id"];
    return new MolamError(code, message, status, requestId, body);
  }
}
