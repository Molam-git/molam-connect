import { getSession, setSession } from "../util/redisSession";
import { t } from "../util/i18n";
import { rateLimitCheck } from "../util/ratelimit";
import { fetchOrCreateMsisdnProfile } from "../util/profile";
import { verifyPin } from "../util/pin";
import {
    walletBalance,
    p2pPreviewFees,
    p2pTransfer,
    cashinInit,
    withdrawInit
} from "../util/wallet";
import { audit } from "../util/audit";

interface NormalizedInput {
    sessionId: string;
    msisdn: string;
    text: string;
    operator: string;
    shortcode: string;
    countryCode: string;
}

interface Session {
    sessionId: string;
    state: string;
    lang: string;
    country_code: string;
    currency: string;
    ctx: any;
    tries: { pin: number };
}

export async function handleUssdLogic(norm: NormalizedInput): Promise<{ responseText: string; shouldClose: boolean }> {
    await rateLimitCheck(norm.msisdn);
    const lang = "fr";
    const prof = await fetchOrCreateMsisdnProfile(norm.msisdn, norm.countryCode);
    const session = await getSession(norm.sessionId, prof, lang);
    const inputs = norm.text ? norm.text.split("*").filter(Boolean) : [];

    // Gestion des codes courts directs
    if (norm.shortcode.includes("*131*1#")) session.state = "BALANCE";
    if (norm.shortcode.includes("*131*2#")) session.state = "CASHIN_AGENT";
    if (norm.shortcode.includes("*131*3#")) session.state = "P2P_DEST";
    if (norm.shortcode.includes("*131*99#")) session.state = "PIN_RESET";

    let ui = "";
    let end = false;

    switch (session.state) {
        case "HOME": {
            ui = [
                t(lang, "home.welcome"),
                "1. " + t(lang, "home.balance"),
                "2. " + t(lang, "home.cashin"),
                "3. " + t(lang, "home.transfer"),
                "4. " + t(lang, "home.withdraw"),
                "99. " + t(lang, "home.pinreset"),
                "0. " + t(lang, "home.quit")
            ].join("\n");

            if (inputs.length) {
                const sel = inputs[0];
                if (sel === "1") session.state = "BALANCE";
                else if (sel === "2") session.state = "CASHIN_AGENT";
                else if (sel === "3") session.state = "P2P_DEST";
                else if (sel === "4") session.state = "WITHDRAW";
                else if (sel === "99") session.state = "PIN_RESET";
                else if (sel === "0") { ui = t(lang, "home.bye"); end = true; }
                else ui = t(lang, "home.invalid");
            }
            break;
        }

        case "BALANCE": {
            if (!session.ctx.pin_ok) {
                ui = t(lang, "pin.enter");
                if (inputs.length) {
                    const pin = inputs[inputs.length - 1];
                    const ok = await verifyPin(prof.user_id, pin);
                    await audit(norm, "pin_check", { action: "balance" }, ok ? "ok" : "denied");
                    if (!ok) {
                        session.tries.pin++;
                        ui = t(lang, "pin.bad");
                        if (session.tries.pin >= 3) {
                            ui = t(lang, "pin.locked");
                            end = true;
                        }
                        break;
                    }
                    session.ctx.pin_ok = true;
                    session.tries.pin = 0;
                } else break;
            }
            const bal = await walletBalance(prof.user_id, prof.currency);
            ui = t(lang, "balance.show", { amount: bal.toFixed(2), currency: prof.currency });
            end = true;
            break;
        }

        case "P2P_DEST": {
            ui = t(lang, "p2p.enterDest");
            if (inputs.length) {
                const dest = inputs[inputs.length - 1].replace(/[^\d+]/g, "");
                session.ctx.p2p_dest = dest;
                session.state = "P2P_AMOUNT";
                ui = t(lang, "p2p.enterAmount", { currency: prof.currency });
            }
            break;
        }

        case "P2P_AMOUNT": {
            if (inputs.length) {
                const amt = Number(inputs[inputs.length - 1]);
                if (isNaN(amt) || amt <= 0) {
                    ui = t(lang, "p2p.invalidAmount");
                    break;
                }
                session.ctx.p2p_amount = amt;
                const prev = await p2pPreviewFees(prof.country_code, amt);
                session.ctx.p2p_fees = prev;
                ui = t(lang, "p2p.confirm", {
                    amt: amt,
                    cur: prof.currency,
                    fees: prev.totalFees
                });
                session.state = "P2P_PIN";
            } else {
                ui = t(lang, "p2p.enterAmount", { currency: prof.currency });
            }
            break;
        }

        case "P2P_PIN": {
            ui = t(lang, "pin.enterToConfirm");
            if (inputs.length) {
                const pin = inputs[inputs.length - 1];
                const ok = await verifyPin(prof.user_id, pin);
                await audit(norm, "p2p_create", {
                    to: session.ctx.p2p_dest,
                    amount: session.ctx.p2p_amount
                }, ok ? "ok" : "denied");

                if (!ok) {
                    session.tries.pin++;
                    ui = t(lang, "pin.bad");
                    if (session.tries.pin >= 3) {
                        ui = t(lang, "pin.locked");
                        end = true;
                    }
                    break;
                }

                session.ctx.pin_ok = true;
                session.tries.pin = 0;
                const tid = await p2pTransfer({
                    fromUserId: prof.user_id,
                    toMsisdn: session.ctx.p2p_dest,
                    amount: session.ctx.p2p_amount,
                    currency: prof.currency,
                    feesPreview: session.ctx.p2p_fees
                });
                ui = t(lang, "p2p.done", { txn: tid });
                end = true;
            }
            break;
        }

        case "CASHIN_AGENT": {
            if (!session.ctx.agent_code) {
                ui = t(lang, "cashin.enterAgent");
                if (inputs.length) {
                    session.ctx.agent_code = inputs[inputs.length - 1];
                } else break;
            }
            if (!session.ctx.amount) {
                ui = t(lang, "cashin.enterAmount", { currency: prof.currency });
                if (inputs.length >= 2) {
                    const amount = Number(inputs[inputs.length - 1]);
                    if (isNaN(amount) || amount <= 0) {
                        ui = t(lang, "cashin.invalidAmount");
                        break;
                    }
                    session.ctx.amount = amount;
                } else break;
            }

            const init = await cashinInit(prof.user_id, session.ctx.agent_code, session.ctx.amount, prof.currency);
            await audit(norm, "cashin_init", init, "ok");
            ui = t(lang, "cashin.started", {
                amt: session.ctx.amount,
                cur: prof.currency,
                code: init.reference
            });
            end = true;
            break;
        }

        case "WITHDRAW": {
            if (!session.ctx.amount) {
                ui = t(lang, "withdraw.enterAmount", { currency: prof.currency });
                if (inputs.length) {
                    const amount = Number(inputs[inputs.length - 1]);
                    if (isNaN(amount) || amount <= 0) {
                        ui = t(lang, "withdraw.invalidAmount");
                        break;
                    }
                    session.ctx.amount = amount;
                } else break;
            }

            if (!session.ctx.pin_ok) {
                ui = t(lang, "pin.enterToConfirm");
                if (inputs.length >= 2) {
                    const pin = inputs[inputs.length - 1];
                    const ok = await verifyPin(prof.user_id, pin);
                    await audit(norm, "withdraw_pin", { amount: session.ctx.amount }, ok ? "ok" : "denied");
                    if (!ok) {
                        session.tries.pin++;
                        ui = t(lang, "pin.bad");
                        if (session.tries.pin >= 3) {
                            ui = t(lang, "pin.locked");
                            end = true;
                        }
                        break;
                    }
                    session.ctx.pin_ok = true;
                    session.tries.pin = 0;
                } else break;
            }

            const ref = await withdrawInit(prof.user_id, session.ctx.amount, prof.currency);
            await audit(norm, "withdraw_init", { ref }, "ok");
            ui = t(lang, "withdraw.code", { ref });
            end = true;
            break;
        }

        case "PIN_RESET": {
            ui = t(lang, "pin.reset.redirect");
            end = true;
            break;
        }

        default:
            session.state = "HOME";
            ui = t(lang, "home.reload");
            break;
    }

    await setSession(norm.sessionId, session);
    return { responseText: ui, shouldClose: end };
}