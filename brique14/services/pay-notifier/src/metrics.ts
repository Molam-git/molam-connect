// Metrics collection for Prometheus
export class NotificationMetrics {
    private static sentCounter = new Map<string, number>();
    private static failedCounter = new Map<string, number>();

    static recordSent(channel: string, type: string) {
        const key = `${channel}_${type}`;
        this.sentCounter.set(key, (this.sentCounter.get(key) || 0) + 1);
    }

    static recordFailed(channel: string, type: string) {
        const key = `${channel}_${type}`;
        this.failedCounter.set(key, (this.failedCounter.get(key) || 0) + 1);
    }

    static getMetrics(): string {
        const lines: string[] = [];

        lines.push('# HELP notif_sent_total Total notifications sent');
        lines.push('# TYPE notif_sent_total counter');
        this.sentCounter.forEach((count, key) => {
            const [channel, type] = key.split('_');
            lines.push(`notif_sent_total{channel="${channel}",type="${type}"} ${count}`);
        });

        lines.push('# HELP notif_failed_total Total notifications failed');
        lines.push('# TYPE notif_failed_total counter');
        this.failedCounter.forEach((count, key) => {
            const [channel, type] = key.split('_');
            lines.push(`notif_failed_total{channel="${channel}",type="${type}"} ${count}`);
        });

        return lines.join('\n') + '\n';
    }
}