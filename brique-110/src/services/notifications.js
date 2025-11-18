// src/services/notifications.js
// Plugin Upgrade Notification Service

let pool; // Initialized by setPool()

/**
 * Send upgrade notification to merchant
 * @param {Object} params - Notification parameters
 * @returns {Promise<Object>} Notification record
 */
async function sendUpgradeNotification({
  plugin,
  current_version,
  latest_version,
  changelog,
  channel = 'email'
}) {
  try {
    // Determine upgrade type
    const upgradeType = determineUpgradeType(current_version, latest_version);
    const upgradePriority = determineUpgradePriority(upgradeType, changelog);

    // Create notification record
    const { rows } = await pool.query(
      `INSERT INTO plugin_upgrade_notifications
       (merchant_id, plugin_id, current_version, latest_version,
        upgrade_type, upgrade_priority, release_notes, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        plugin.merchant_id,
        plugin.id,
        current_version,
        latest_version,
        upgradeType,
        upgradePriority,
        changelog,
        channel
      ]
    );

    const notification = rows[0];

    // Send notification based on channel
    switch (channel) {
      case 'email':
        await sendEmailNotification(plugin, notification, changelog);
        break;

      case 'webhook':
        await sendWebhookNotification(plugin, notification);
        break;

      case 'in-app':
        // In-app notifications are polled by merchant dashboard
        break;

      default:
        console.warn(`[NOTIFICATIONS] Unknown channel: ${channel}`);
    }

    console.log(`[NOTIFICATIONS] Sent upgrade notification: ${plugin.cms} ${current_version} -> ${latest_version}`);
    return notification;
  } catch (error) {
    console.error('[NOTIFICATIONS] Send upgrade notification failed:', error);
    throw error;
  }
}

/**
 * Send email notification
 * @param {Object} plugin - Plugin installation
 * @param {Object} notification - Notification record
 * @param {string} changelog - Release notes
 */
async function sendEmailNotification(plugin, notification, changelog) {
  // Mock email sending - integrate with SendGrid, SES, etc.
  const emailBody = `
    <h2>Molam Form Plugin Update Available</h2>

    <p>Hi ${plugin.merchant_name || 'Merchant'},</p>

    <p>A new version of the Molam Form plugin for ${plugin.cms} is available.</p>

    <h3>Current Version: ${notification.current_version}</h3>
    <h3>Latest Version: ${notification.latest_version}</h3>

    <h4>What's New:</h4>
    <p>${changelog || 'Bug fixes and improvements'}</p>

    <p>
      <strong>Upgrade Priority: ${notification.upgrade_priority.toUpperCase()}</strong>
    </p>

    <p>
      <a href="https://dashboard.molam.com/plugins/upgrade/${plugin.id}" style="background: #0A84FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
        Upgrade Now
      </a>
    </p>

    <p>
      If you have any questions, please contact support@molam.com
    </p>

    <p>Best regards,<br>Molam Team</p>
  `;

  console.log(`[NOTIFICATIONS] Email sent to: ${plugin.merchant_email}`);
  console.log(`[NOTIFICATIONS] Subject: Molam Form ${plugin.cms} Update Available (${notification.latest_version})`);

  // TODO: Integrate with actual email service
  // await emailService.send({
  //   to: plugin.merchant_email,
  //   subject: `Molam Form ${plugin.cms} Update Available (${notification.latest_version})`,
  //   html: emailBody
  // });
}

/**
 * Send webhook notification
 * @param {Object} plugin - Plugin installation
 * @param {Object} notification - Notification record
 */
async function sendWebhookNotification(plugin, notification) {
  // TODO: Integrate with webhook system (Brique 45)
  const payload = {
    event: 'plugin.upgrade_available',
    data: {
      plugin_id: plugin.id,
      cms: plugin.cms,
      current_version: notification.current_version,
      latest_version: notification.latest_version,
      upgrade_type: notification.upgrade_type,
      upgrade_priority: notification.upgrade_priority,
      release_notes: notification.release_notes
    }
  };

  console.log(`[NOTIFICATIONS] Webhook payload: ${JSON.stringify(payload)}`);

  // await webhookService.send(plugin.merchant_id, payload);
}

/**
 * Get pending notifications for merchant
 * @param {string} merchant_id - Merchant ID
 * @returns {Promise<Array>} Pending notifications
 */
async function getPendingNotifications(merchant_id) {
  try {
    const { rows } = await pool.query(
      `SELECT pun.*, pi.cms, pi.plugin_version
       FROM plugin_upgrade_notifications pun
       JOIN plugin_installations pi ON pun.plugin_id = pi.id
       WHERE pun.merchant_id = $1
         AND pun.acknowledged_at IS NULL
       ORDER BY pun.sent_at DESC`,
      [merchant_id]
    );

    return rows;
  } catch (error) {
    console.error('[NOTIFICATIONS] Get pending notifications failed:', error);
    return [];
  }
}

/**
 * Acknowledge notification
 * @param {string} notification_id - Notification ID
 * @returns {Promise<void>}
 */
async function acknowledgeNotification(notification_id) {
  try {
    await pool.query(
      `UPDATE plugin_upgrade_notifications
       SET acknowledged_at = now()
       WHERE id = $1`,
      [notification_id]
    );

    console.log(`[NOTIFICATIONS] Acknowledged notification: ${notification_id}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Acknowledge notification failed:', error);
  }
}

/**
 * Mark notification as upgraded
 * @param {string} notification_id - Notification ID
 * @returns {Promise<void>}
 */
async function markAsUpgraded(notification_id) {
  try {
    await pool.query(
      `UPDATE plugin_upgrade_notifications
       SET upgraded_at = now()
       WHERE id = $1`,
      [notification_id]
    );

    console.log(`[NOTIFICATIONS] Marked as upgraded: ${notification_id}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Mark as upgraded failed:', error);
  }
}

/**
 * Determine upgrade type from version strings
 * @param {string} current - Current version
 * @param {string} latest - Latest version
 * @returns {string} Upgrade type
 */
function determineUpgradeType(current, latest) {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  if (latestParts[0] > currentParts[0]) return 'major';
  if (latestParts[1] > currentParts[1]) return 'minor';
  if (latestParts[2] > currentParts[2]) return 'patch';

  return 'patch';
}

/**
 * Determine upgrade priority
 * @param {string} upgradeType - Upgrade type
 * @param {string} changelog - Release notes
 * @returns {string} Priority level
 */
function determineUpgradePriority(upgradeType, changelog) {
  const changelogLower = (changelog || '').toLowerCase();

  if (changelogLower.includes('critical') || changelogLower.includes('security')) {
    return 'critical';
  }

  if (changelogLower.includes('important') || upgradeType === 'major') {
    return 'high';
  }

  if (upgradeType === 'minor') {
    return 'normal';
  }

  return 'low';
}

/**
 * Set database pool
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  sendUpgradeNotification,
  getPendingNotifications,
  acknowledgeNotification,
  markAsUpgraded
};
