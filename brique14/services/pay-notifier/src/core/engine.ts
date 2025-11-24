// Main notification engine orchestrator
import { publishNotification } from "../queue/publisher.js";

export type NotificationChannel = "push" | "sms" | "email" | "ussd" | "whatsapp";
export type NotificationType = "txn" | "reward" | "bill" | "security" | "system";
export type NotificationPriority = "low" | "normal" | "high" | "critical";

export interface NotificationOptions {
    type: NotificationType;
    priority?: NotificationPriority;
    channels?: NotificationChannel[];
    idempotencyKey?: string;
}

export class NotificationEngine {
    static async send(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: NotificationOptions = { type: "system" }
    ) {
        return publishNotification({
            userId,
            type: options.type,
            templateCode,
            variables,
            suggestedChannels: options.channels,
            idempotencyKey: options.idempotencyKey
        });
    }

    // Méthodes utilitaires pour les types courants de notifications
    static async sendTransaction(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: Omit<NotificationOptions, 'type'> = {}
    ) {
        return this.send(userId, templateCode, variables, {
            ...options,
            type: "txn"
        });
    }

    static async sendReward(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: Omit<NotificationOptions, 'type'> = {}
    ) {
        return this.send(userId, templateCode, variables, {
            ...options,
            type: "reward"
        });
    }

    static async sendBillReminder(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: Omit<NotificationOptions, 'type'> = {}
    ) {
        return this.send(userId, templateCode, variables, {
            ...options,
            type: "bill"
        });
    }

    static async sendSecurityAlert(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: Omit<NotificationOptions, 'type'> = {}
    ) {
        return this.send(userId, templateCode, variables, {
            ...options,
            type: "security"
        });
    }

    static async sendSystem(
        userId: string,
        templateCode: string,
        variables: Record<string, any>,
        options: Omit<NotificationOptions, 'type'> = {}
    ) {
        return this.send(userId, templateCode, variables, {
            ...options,
            type: "system"
        });
    }
}