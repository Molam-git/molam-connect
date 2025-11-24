import { Kafka } from "kafkajs";
import { resolveUserContext } from "../services/molamId";
import { chooseChannels } from "../services/routing";
import { renderTemplates } from "../services/templating";
import { insertOutbox } from "../store/outbox";
import { enrichAmounts } from "../services/fx";

const kafka = new Kafka({
    clientId: "notif-orch",
    brokers: process.env.KAFKA_BROKERS!.split(",")
});

function computeTargets(evt: any): number[] {
    const targets = new Set<number>();

    if (evt.actor_user_id) targets.add(evt.actor_user_id);
    if (evt.counterparty_user_id) targets.add(evt.counterparty_user_id);

    // Events spécifiques avec cibles additionnelles
    switch (evt.event_type) {
        case 'agent.settlement.generated':
        case 'agent.settlement.paid':
            if (evt.agent_user_id) targets.add(evt.agent_user_id);
            break;
        case 'risk.alert':
            // Sira détermine les cibles
            if (evt.target_user_ids) {
                evt.target_user_ids.forEach((id: number) => targets.add(id));
            }
            break;
    }

    return Array.from(targets);
}

export async function startConsumer() {
    const c = kafka.consumer({ groupId: "notif-orch-g1" });
    await c.connect();
    await c.subscribe({ topic: "wallet.events" });

    await c.run({
        eachMessage: async ({ message }) => {
            try {
                const evt = JSON.parse(message.value!.toString());

                const targets = computeTargets(evt);
                console.log(`Processing event ${evt.event_id} for ${targets.length} targets`);

                for (const userId of targets) {
                    try {
                        const ctx = await resolveUserContext(userId);
                        const money = await enrichAmounts(evt, ctx.currency);

                        const channels = await chooseChannels(evt.event_type, ctx);
                        const rendered = await renderTemplates(
                            evt.event_type,
                            channels,
                            ctx.lang,
                            { ...evt, ...money, ctx }
                        );

                        for (const r of rendered) {
                            await insertOutbox({
                                event_id: evt.event_id,
                                user_id: userId,
                                event_type: evt.event_type,
                                channel: r.channel,
                                lang: ctx.lang,
                                currency: ctx.currency,
                                payload: r.payload,
                                rendered_subject: r.subject,
                                rendered_body: r.body
                            });
                        }
                    } catch (userError) {
                        console.error(`Error processing user ${userId} for event ${evt.event_id}:`, userError);
                    }
                }
            } catch (error) {
                console.error('Error processing Kafka message:', error);
            }
        }
    });
}