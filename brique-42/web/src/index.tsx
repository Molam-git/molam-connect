/**
 * Brique 42 - Connect Payments
 * Web Application Entry Point
 */

import React from "react";
import { createRoot } from "react-dom/client";
import WebhooksManager from "./WebhooksManager";

// Configuration
const CONNECT_ACCOUNT_ID = "ca_test123"; // Remplacez par votre ID de compte
const API_URL = "http://localhost:8042";
const AUTH_TOKEN = "dev-token"; // Token JWT de Molam ID (sera remplacé après login)

// Initialize React
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f7" }}>
      <WebhooksManager
        connectAccountId={CONNECT_ACCOUNT_ID}
        apiUrl={API_URL}
        authToken={AUTH_TOKEN}
      />
    </div>
  </React.StrictMode>
);