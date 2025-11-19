export async function publishEvent(
  tenantType: string,
  tenantId: string,
  type: string,
  data?: Record<string, unknown>
) {
  console.log("[publishEvent]", tenantType, tenantId, type, data ? "…payload" : "");
  return { ok: true };
}

