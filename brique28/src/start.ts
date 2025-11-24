// src/start.ts
import app from "./server";

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Molam Notifications Service running on port ${PORT}`);
});