export async function emitAudit(_tx: any, params: {
    actorUserId: number;
    action: string;
    target: { type: string; id: number };
    data: any;
}) {
    // Implémentation réelle pour l'audit
    console.log('Audit event:', params);
}