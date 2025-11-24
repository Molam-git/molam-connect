import { pool } from "../store/db";
import { UserContext } from "./molamId";

export async function chooseChannels(eventType: string, ctx: UserContext): Promise<string[]> {
    // Vérifier les préférences utilisateur d'abord
    const enabledChannels: string[] = [];
    if (ctx.prefs.push_enabled) enabledChannels.push('push');
    if (ctx.prefs.sms_enabled) enabledChannels.push('sms');
    if (ctx.prefs.email_enabled) enabledChannels.push('email');
    if (ctx.prefs.ussd_enabled) enabledChannels.push('ussd');

    // Chercher la configuration par pays d'abord
    const zoneQuery = `
    SELECT primary_channel, fallback_channel
    FROM channel_routing_zones
    WHERE country = $1 AND event_type = $2
  `;
    const { rows: zoneRows } = await pool.query(zoneQuery, [ctx.country, eventType]);

    if (zoneRows.length > 0) {
        const zone = zoneRows[0];
        const channels = [zone.primary_channel, zone.fallback_channel].filter(Boolean);
        return channels.filter(ch => enabledChannels.includes(ch));
    }

    // Fallback global
    const globalQuery = `
    SELECT primary_channel, fallback_channel
    FROM channel_routing
    WHERE event_type = $1
  `;
    const { rows: globalRows } = await pool.query(globalQuery, [eventType]);

    if (globalRows.length > 0) {
        const global = globalRows[0];
        const channels = [global.primary_channel, global.fallback_channel].filter(Boolean);
        return channels.filter(ch => enabledChannels.includes(ch));
    }

    // Défaut final
    return ['push', 'sms'].filter(ch => enabledChannels.includes(ch));
}