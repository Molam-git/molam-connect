export interface PushResult {
    provider: string;
    messageId: string;
    success: boolean;
}

export async function sendPush(userId: string, title: string, message: string): Promise<PushResult> {
    // TODO: Resolve device tokens by userId from molam_devices table
    // TODO: Call FCM/APNs/HMS depending on device type
    // For now, simulate successful push
    console.log(`[PUSH] to user ${userId}: ${title} - ${message}`);

    return {
        provider: "push",
        messageId: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: true
    };
}