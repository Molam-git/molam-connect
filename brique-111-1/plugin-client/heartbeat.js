/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Plugin Client Heartbeat Snippet
 * 
 * This snippet runs inside the plugin/CMS and sends heartbeat + telemetry
 * Usage: Install this in your plugin and call sendHeartbeat() every 2 minutes
 */

const fetch = require("node-fetch");
const os = require("os");

// Configuration (set at plugin installation)
let config = {
  merchantId: null,
  pluginId: null,
  apiBase: process.env.MOLAM_API_BASE || "https://api.molam.com",
  pluginVersion: null,
  pluginSecret: null, // Encrypted secret provided at install
  env: {
    node_version: process.version,
    platform: os.platform(),
    arch: os.arch()
  }
};

// Error tracking
let errorCount = 0;
let errorLog = [];

// Webhook failure tracking
let webhookFailures = 0;
let webhookTotal = 0;

/**
 * Initialize heartbeat client
 */
function init(pluginConfig) {
  config = { ...config, ...pluginConfig };
  
  // Validate required config
  if (!config.merchantId || !config.pluginId || !config.pluginSecret) {
    throw new Error("Missing required config: merchantId, pluginId, pluginSecret");
  }
  
  // Start heartbeat interval (every 2 minutes)
  setInterval(sendHeartbeat, 2 * 60 * 1000);
  
  // Send initial heartbeat
  sendHeartbeat();
  
  console.log("✅ Molam Self-Healing heartbeat initialized");
}

/**
 * Send heartbeat with telemetry
 */
async function sendHeartbeat() {
  try {
    const payload = {
      merchant_id: config.merchantId,
      plugin_id: config.pluginId,
      plugin_version: config.pluginVersion,
      env: config.env,
      uptime: process.uptime ? Math.floor(process.uptime()) : null,
      errors_last_24h: await getErrorCount(),
      webhook_fail_rate: await getWebhookFailRate(),
      timestamp: new Date().toISOString()
    };

    const res = await fetch(`${config.apiBase}/api/plugins/heartbeat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.pluginSecret}`,
        "Content-Type": "application/json",
        "X-Plugin-Version": config.pluginVersion
      },
      body: JSON.stringify(payload),
      timeout: 5000
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ Heartbeat failed:", res.status, errorText);
      // Local logging + fallback
      logError("heartbeat_failed", { status: res.status, error: errorText });
      return;
    }

    const response = await res.json();
    
    // Check for commands from server
    if (response.commands && response.commands.length > 0) {
      await processCommands(response.commands);
    }

    console.log("✅ Heartbeat sent successfully");
  } catch (error) {
    console.error("❌ Heartbeat error:", error.message);
    logError("heartbeat_error", { error: error.message });
  }
}

/**
 * Process commands from server (update, rollback, config_update, etc.)
 */
async function processCommands(commands) {
  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case "update":
          await handleUpdateCommand(cmd);
          break;
        case "rollback":
          await handleRollbackCommand(cmd);
          break;
        case "config_update":
          await handleConfigUpdateCommand(cmd);
          break;
        case "health_check":
          await handleHealthCheckCommand(cmd);
          break;
        default:
          console.warn("Unknown command type:", cmd.type);
      }
    } catch (error) {
      console.error(`Failed to process command ${cmd.type}:`, error);
      // Notify server of command failure
      await notifyCommandFailure(cmd.id, error.message);
    }
  }
}

/**
 * Handle update command
 */
async function handleUpdateCommand(cmd) {
  console.log(`📦 Update command received: ${cmd.payload.version}`);
  
  // In a real implementation, this would:
  // 1. Download new version
  // 2. Verify signature
  // 3. Install in staging mode
  // 4. Run smoke tests
  // 5. Switch to production if tests pass
  
  // For now, just log
  console.log("Update would be applied:", cmd.payload);
  
  // Notify server of command acknowledgment
  await notifyCommandAcknowledged(cmd.id, { status: "acknowledged" });
}

/**
 * Handle rollback command
 */
async function handleRollbackCommand(cmd) {
  console.log(`⏪ Rollback command received: ${cmd.payload.version}`);
  
  // Rollback to specified version
  console.log("Rollback would be applied:", cmd.payload);
  
  await notifyCommandAcknowledged(cmd.id, { status: "acknowledged" });
}

/**
 * Handle config update command
 */
async function handleConfigUpdateCommand(cmd) {
  console.log("⚙️ Config update command received");
  
  // Update plugin configuration
  console.log("Config would be updated:", cmd.payload);
  
  await notifyCommandAcknowledged(cmd.id, { status: "acknowledged" });
}

/**
 * Handle health check command
 */
async function handleHealthCheckCommand(cmd) {
  const health = {
    status: "healthy",
    uptime: process.uptime(),
    error_count: errorCount,
    webhook_fail_rate: await getWebhookFailRate(),
    timestamp: new Date().toISOString()
  };
  
  await notifyCommandAcknowledged(cmd.id, health);
}

/**
 * Notify server that command was acknowledged
 */
async function notifyCommandAcknowledged(commandId, result) {
  try {
    await fetch(`${config.apiBase}/api/plugins/commands/${commandId}/ack`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.pluginSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ result })
    });
  } catch (error) {
    console.error("Failed to notify command acknowledgment:", error);
  }
}

/**
 * Notify server of command failure
 */
async function notifyCommandFailure(commandId, error) {
  try {
    await fetch(`${config.apiBase}/api/plugins/commands/${commandId}/fail`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.pluginSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error })
    });
  } catch (error) {
    console.error("Failed to notify command failure:", error);
  }
}

/**
 * Get error count for last 24 hours
 */
async function getErrorCount() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  // Filter errors from last 24h
  errorLog = errorLog.filter(e => e.timestamp > oneDayAgo);
  
  return errorLog.length;
}

/**
 * Get webhook failure rate
 */
async function getWebhookFailRate() {
  if (webhookTotal === 0) return 0;
  return webhookFailures / webhookTotal;
}

/**
 * Log an error (called by plugin when errors occur)
 */
function logError(errorType, errorData) {
  errorCount++;
  errorLog.push({
    type: errorType,
    data: errorData,
    timestamp: Date.now()
  });
  
  // Keep only last 1000 errors
  if (errorLog.length > 1000) {
    errorLog = errorLog.slice(-1000);
  }
}

/**
 * Track webhook call (called by plugin when webhook is called)
 */
function trackWebhookCall(success) {
  webhookTotal++;
  if (!success) {
    webhookFailures++;
  }
  
  // Reset counters daily
  if (webhookTotal > 10000) {
    webhookFailures = Math.floor(webhookFailures * 0.9);
    webhookTotal = Math.floor(webhookTotal * 0.9);
  }
}

// Export functions
module.exports = {
  init,
  sendHeartbeat,
  logError,
  trackWebhookCall,
  processCommands
};

// Auto-initialize if config provided via environment
if (process.env.MOLAM_PLUGIN_CONFIG) {
  try {
    const pluginConfig = JSON.parse(process.env.MOLAM_PLUGIN_CONFIG);
    init(pluginConfig);
  } catch (error) {
    console.error("Failed to auto-initialize heartbeat:", error);
  }
}



