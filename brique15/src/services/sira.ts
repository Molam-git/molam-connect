export function chooseChannelsWithSira(input: {
    requested: string[];
    eventKey: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    userRisk: 'low' | 'medium' | 'high';
}): string[] {
    let chosen = [...input.requested];

    if (input.userRisk === 'high' && input.priority === 'low') {
        chosen = chosen.filter(c => c === 'inapp' || c === 'push');
    }

    if (input.priority === 'critical' && !chosen.includes('sms')) {
        chosen.push('sms');
    }

    if ((/payout|failed/.test(input.eventKey)) && !chosen.includes('email')) {
        chosen.push('email');
    }
    return Array.from(new Set(chosen));
}