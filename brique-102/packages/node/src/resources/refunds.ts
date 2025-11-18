/**
 * Refunds resource
 */
import { HttpClient } from "../http";
import { RefundCreate, Refund } from "../types";

export class RefundsResource {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async create(payload: RefundCreate, idempotencyKey?: string): Promise<Refund> {
    const headers = idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined;
    const data = await this.http.post<{ data: Refund }>(
      "/v1/refunds",
      { refund: payload },
      headers
    );
    return data.data;
  }

  async retrieve(id: string): Promise<Refund> {
    const data = await this.http.get<{ data: Refund }>(`/v1/refunds/${id}`);
    return data.data;
  }

  async list(params?: { limit?: number; starting_after?: string }): Promise<{ data: Refund[] }> {
    return this.http.get<{ data: Refund[] }>("/v1/refunds", { params });
  }
}
