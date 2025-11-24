export const notifyUser = async (userId: string, message: string) => {
    // Mock notification - in production, send push/email/SMS
    console.log(`Notification to ${userId}: ${message}`);
    return Promise.resolve();
};