// tests/unit/voiceWorker.test.ts
import { handleMessage } from "../../src/workers/voiceWorker";
import { pool } from "../../src/db";
import { publishKafka } from "../../src/lib/kafka";

jest.mock("../../src/db");
jest.mock("../../src/lib/kafka");

describe("Voice Worker", () => {
    it("should process voice message successfully", async () => {
        const mockEvent = {
            user_id: "user123",
            phone: "+1234567890",
            provider_id: "twilio",
            text: "Hello world",
            template_id: "tpl123",
            country: "SN",
            region: "CEDEAO"
        };

        await handleMessage(mockEvent);

        expect(publishKafka).toHaveBeenCalledWith(
            "notification_events",
            expect.objectContaining({
                type: "voice_sent"
            })
        );
    });
});