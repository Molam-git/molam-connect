import { computePlans } from './policyEngine';
import { createOrders } from './rebalanceService';

export async function runFloatCron(): Promise<{ plans: number; orders: number }> {
    // Exemple: USD, EUR, XOF — à lier à table des devises actives
    const currencies = ['USD', 'EUR', 'XOF'];
    let totalPlans = 0;
    let totalOrders = 0;

    for (const cur of currencies) {
        const plans = await computePlans(cur);
        if (plans.length === 0) continue;

        const orders = await createOrders(plans);
        totalPlans += plans.length;
        totalOrders += orders.length;
    }

    return { plans: totalPlans, orders: totalOrders };
}