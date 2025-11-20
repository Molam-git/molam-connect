/**
 * BRIQUE 144 — Push Notification Provider Adapter
 * Supports FCM (Firebase Cloud Messaging) for Android/iOS/Web
 */
import admin from "firebase-admin";
import { pool } from "../db";

let firebaseInitialized = false;

export async function initializeFirebase() {
  if (firebaseInitialized) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn('Firebase service account not configured');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccount))
    });
    firebaseInitialized = true;
    console.log('Firebase initialized');
  } catch (error: any) {
    console.error('Firebase initialization failed:', error.message);
  }
}

export async function sendPush(
  provider: any,
  opts: {
    tokens: string[];
    title?: string;
    body?: string;
    data?: any;
    notificationId?: string;
  }
) {
  if (!firebaseInitialized) {
    await initializeFirebase();
  }

  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized');
  }

  if (provider.type === 'fcm') {
    const message = {
      notification: {
        title: opts.title || '',
        body: opts.body || ''
      },
      data: opts.data || {},
      tokens: opts.tokens
    };

    const response = await admin.messaging().sendMulticast(message);

    // Log delivery
    if (opts.notificationId) {
      await pool.query(
        `INSERT INTO notification_logs(notification_id, channel, provider, provider_ref, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          opts.notificationId,
          'push',
          provider.provider_key,
          `success:${response.successCount}`,
          'sent',
          JSON.stringify({ success: response.successCount, failure: response.failureCount })
        ]
      );
    }

    return {
      providerRef: `success:${response.successCount}`,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  }

  if (provider.type === 'apns') {
    // Apple Push Notification Service implementation would go here
    throw new Error('APNs not implemented in this sample');
  }

  throw new Error(`unsupported_push_provider: ${provider.type}`);
}
