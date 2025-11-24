import { publish } from "../utils/kafka";

export async function handleFraudEvent(evt: any) {
    const score = evt.score || 0;
    let action = { action: "allow", reason: "low_risk" };

    if (score >= 0.96) {
        action = { action: "hold", reason: "high_score" };
    } else if (score >= 0.8) {
        action = { action: "review", reason: "medium_risk" };
    }

    await publish("fraud_actions", {
        correlation_id: evt.correlation_id,
        action,
        score,
        entity_id: evt.entity_id,
        entity_type: evt.entity_type,
    });
}

export async function evaluateRules(evt: any, rules: any[]) {
    const hits: any = {};

    for (const rule of rules) {
        if (rule.condition(evt)) {
            hits[rule.severity] = true;
        }
    }

    return hits;
}

export async function loadRulesForZone(zone: string) {
    return [];
}