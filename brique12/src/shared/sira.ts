export const siraNotify = async (event: string, data: any) => {
    // Mock SIRA integration - in production, call SIRA service
    console.log(`SIRA Notification: ${event}`, data);
    return Promise.resolve();
};