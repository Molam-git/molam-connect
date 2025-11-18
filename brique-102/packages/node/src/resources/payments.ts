/**
 * Payment Intents resource
 */
import { HttpClient } from "../http";
import { PaymentIntentCreate, PaymentIntent } from "../types";

export class PaymentsResource {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async create(payload: PaymentIntentCreate): Promise<PaymentIntent> {
    const data = await this.http.post<{ data: PaymentIntent }>(
      "/v1/payment_intents",
      { payment_intent: payload }
    );
    return data.data;
  }

  async retrieve(id: string): Promise<PaymentIntent> {
    const data = await this.http.get<{ data: PaymentIntent }>(`/v1/payment_intents/${id}`);
    return data.data;
  }

  async confirm(id: string): Promise<PaymentIntent> {
    const data = await this.http.post<{ data: PaymentIntent }>(`/v1/payment_intents/${id}/confirm`);
    return data.data;
  }

  async cancel(id: string): Promise<PaymentIntent> {
    const data = await this.http.post<{ data: PaymentIntent }>(`/v1/payment_intents/${id}/cancel`);
    return data.data;
  }

  async list(params?: { limit?: number; starting_after?: string }): Promise<{ data: PaymentIntent[] }> {
    return this.http.get<{ data: PaymentIntent[] }>("/v1/payment_intents", { params });
  }
}
