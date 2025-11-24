// ui/src/wsClient.ts
export function createWS(url: string, token: string, onMessage: (ev: any) => void) {
    let ws: WebSocket | null = null;
    let stop = false;

    function connect() {
        const u = new URL(url);
        u.searchParams.set("token", token);
        ws = new WebSocket(u.toString());

        ws.onopen = () => console.log("WS connected");
        ws.onmessage = (e) => {
            try {
                const doc = JSON.parse(e.data);
                onMessage(doc);
            } catch (error) {
                console.error("WS message error:", error);
            }
        };
        ws.onclose = () => {
            if (!stop) {
                console.log("WS disconnected, reconnecting...");
                setTimeout(connect, 2000);
            }
        };
        ws.onerror = (error) => {
            console.error("WS error:", error);
        };
    }

    connect();

    return {
        close: () => {
            stop = true;
            ws?.close();
        }
    };
}