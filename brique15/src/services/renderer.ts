import { Pool } from 'pg';
import { createIntl, createIntlCache } from '@formatjs/intl';
import { DateTime } from 'luxon';
import { chooseChannelsWithSira } from './sira';
import { queueOutbox } from './worker-queue';
import { getUserLocaleProfile, getTemplates, getPreferences } from './store';

const cache = createIntlCache();

export async function renderAndQueue(evt: any) {
    const profile = await getUserLocaleProfile(evt.userId);
    const intl = createIntl({ locale: evt.locale || profile.locale || 'en' }, cache);

    const channels = chooseChannelsWithSira({
        requested: evt.preferredChannels ?? profile.defaultChannels ?? ['inapp', 'push', 'sms', 'email'],
        eventKey: evt.eventKey,
        priority: evt.siraPriority ?? 'normal',
        userRisk: profile.siraRisk ?? 'low'
    });

    const prefs = await getPreferences(evt.userId, evt.eventKey);
    const deliverable = channels.filter(ch => {
        const p = prefs.find(x => x.channel === ch) ?? prefs.find(x => x.eventKey === '*' && x.channel === ch);
        if (p && (!p.optedIn || p.dnd)) return false;
        if (p?.quietHoursStart && p?.quietHoursEnd) {
            const now = DateTime.now().setZone(profile.timeZone || 'UTC').toFormat('HH:mm:ss');
            if (inQuietHours(now, p.quietHoursStart, p.quietHoursEnd)) return ch === 'inapp';
        }
        return true;
    });

    const templates = await getTemplates(evt.eventKey, deliverable, evt.locale || profile.locale || 'en');
    const payloadByChannel = deliverable.map(ch => {
        const t = templates[ch];
        if (!t) return null;
        const vars = {
            ...evt.renderVars,
            amount: Number(evt.renderVars.amount ?? 0),
            txRef: evt.renderVars.txRef,
            currency: evt.currency || profile.currency || 'USD'
        };
        const subject = t.subject_template ? intl.formatMessage({ id: `${evt.eventKey}.subject`, defaultMessage: t.subject_template as any }, vars) : undefined;
        const body = intl.formatMessage({ id: `${evt.eventKey}.body`, defaultMessage: t.body_template as any }, vars);
        return { channel: ch, subject, body };
    }).filter(Boolean);

    await queueOutbox(evt, payloadByChannel as any);
}

function inQuietHours(now: string, start: string, end: string) {
    return start <= end ? (now >= start && now <= end) : (now >= start || now <= end);
}