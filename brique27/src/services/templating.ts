import * as Mustache from "mustache";
import { fetchTemplate } from "../store/templates";

export async function renderTemplates(
    eventType: string,
    channels: string[],
    lang: string,
    data: any
) {
    const out = [];

    for (const ch of channels) {
        const t = await fetchTemplate(eventType, lang, ch);
        if (!t) continue;

        const subject = t.subject ? Mustache.render(t.subject, data) : undefined;
        const body = Mustache.render(t.body, data);

        out.push({
            channel: ch,
            subject,
            body,
            payload: data
        });
    }

    return out;
}