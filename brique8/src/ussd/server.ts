import express from "express";
import { verifyGatewayHmac, normalizeGatewayInput } from "./us/gateway";
import { handleUssdLogic } from "./us/logic";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.all("/api/ussd/receive", async (req, res) => {
    try {
        const norm = normalizeGatewayInput(req);

        // En mode test, on loggue mais on ne bloque pas sur les erreurs HMAC
        if (process.env.NODE_ENV !== 'test') {
            await verifyGatewayHmac(req, norm);
        }

        const { responseText, shouldClose } = await handleUssdLogic(norm);

        res.type("text/plain").send(`${shouldClose ? "END" : "CON"} ${responseText}`);
    } catch (e: any) {
        console.error("USSD error", e.message);

        // En mode test, on renvoie des réponses plus détaillées pour le débogage
        if (process.env.NODE_ENV === 'test') {
            res.type("text/plain").send(`END Error: ${e.message}`);
        } else {
            res.type("text/plain").send("END Service temporairement indisponible. Réessayez plus tard.");
        }
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "OK", service: "ussd" });
});

export default app;