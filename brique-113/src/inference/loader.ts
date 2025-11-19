/**
 * Brique 113: Model Loader
 * Downloads models from S3 and manages in-memory model registry
 */

import { Pool } from 'pg';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { modelsLoadedGauge, modelLoadErrorsTotal } from '../utils/metrics';

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
});

const MODELS_DIR = process.env.MODELS_DIR || '/tmp/models';
const CHECK_INTERVAL_MS = parseInt(process.env.MODEL_CHECK_INTERVAL_MS || '30000', 10);
const MODEL_BUCKET = process.env.MODEL_BUCKET || 'molam-models';

export interface ModelMetadata {
  model_id: string;
  name: string;
  version: string;
  product: string;
  status: string;
  storage_s3_key: string;
  feature_names: string[];
  metrics: any;
  shap_summary: any;
  created_at: Date;
}

export interface LoadedModel {
  model_id: string;
  path: string;
  metadata: ModelMetadata;
  loaded_at: Date;
}

export class ModelManager extends EventEmitter {
  private registry: Map<string, LoadedModel> = new Map();
  private pg: Pool;
  private ready = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(pgPool: Pool) {
    super();
    this.pg = pgPool;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Fetch active models from database registry
   */
  async fetchRegistry(): Promise<ModelMetadata[]> {
    try {
      const { rows } = await pool.query<ModelMetadata>(
        `SELECT * FROM siramodel_registry
         WHERE status IN ('production', 'canary')
         ORDER BY created_at DESC`
      );

      logger.debug('Fetched model registry', { count: rows.length });
      return rows;
    } catch (err) {
      logger.error('Failed to fetch model registry', { error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Download model artifact from S3 to local filesystem
   */
  async downloadModel(s3Key: string, localPath: string): Promise<void> {
    try {
      logger.info('Downloading model from S3', { s3_key: s3Key, local_path: localPath });

      // Extract bucket and key from s3://bucket/key format
      const match = s3Key.match(/^s3:\/\/([^\/]+)\/(.+)$/);
      const bucket = match ? match[1] : MODEL_BUCKET;
      const key = match ? match[2] : s3Key;

      const params = {
        Bucket: bucket,
        Key: key,
      };

      const tmpPath = localPath + '.tmp';

      // Create models directory if it doesn't exist
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Stream download to temp file
      const s3Stream = s3.getObject(params).createReadStream();
      const writeStream = fs.createWriteStream(tmpPath);

      await new Promise<void>((resolve, reject) => {
        s3Stream.pipe(writeStream);

        writeStream.on('close', () => {
          // Atomic rename
          fs.renameSync(tmpPath, localPath);
          logger.info('Model downloaded successfully', { local_path: localPath });
          resolve();
        });

        writeStream.on('error', (err) => {
          logger.error('Failed to write model file', { error: err.message });
          reject(err);
        });

        s3Stream.on('error', (err) => {
          logger.error('Failed to download model from S3', { error: err.message });
          reject(err);
        });
      });
    } catch (err) {
      logger.error('Model download failed', {
        s3_key: s3Key,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Ensure all active models are downloaded and loaded
   */
  async ensureModels(): Promise<void> {
    try {
      const records = await this.fetchRegistry();

      for (const record of records) {
        const key = `${record.product}:${record.version}`;
        const localPath = path.join(MODELS_DIR, `${record.model_id}.onnx`);

        // Skip if already loaded
        if (this.registry.has(key) && fs.existsSync(localPath)) {
          logger.debug('Model already loaded', { model_id: record.model_id });
          continue;
        }

        try {
          // Download if not exists
          if (!fs.existsSync(localPath)) {
            await this.downloadModel(record.storage_s3_key, localPath);
          }

          // Add to registry
          const loadedModel: LoadedModel = {
            model_id: record.model_id,
            path: localPath,
            metadata: record,
            loaded_at: new Date(),
          };

          this.registry.set(key, loadedModel);
          this.emit('model_loaded', { product: record.product, model_id: record.model_id });

          logger.info('Model loaded', {
            model_id: record.model_id,
            product: record.product,
            version: record.version,
          });
        } catch (err) {
          logger.error('Failed to load model', {
            model_id: record.model_id,
            error: (err as Error).message,
          });

          modelLoadErrorsTotal.inc({
            model_id: record.model_id,
            error_type: 'download_failed',
          });
        }
      }

      this.ready = true;

      // Update metrics
      modelsLoadedGauge.set(this.registry.size);

      logger.info('Model loading complete', { models_loaded: this.registry.size });
    } catch (err) {
      logger.error('Failed to ensure models', { error: (err as Error).message });
    }
  }

  /**
   * Get model path by model_id
   */
  getModelPath(modelId: string): string | null {
    for (const loadedModel of this.registry.values()) {
      if (loadedModel.model_id === modelId) {
        return loadedModel.path;
      }
    }

    logger.warn('Model not found in registry', { model_id: modelId });
    return null;
  }

  /**
   * Get model metadata by model_id
   */
  getModelMetadata(modelId: string): ModelMetadata | null {
    for (const loadedModel of this.registry.values()) {
      if (loadedModel.model_id === modelId) {
        return loadedModel.metadata;
      }
    }

    return null;
  }

  /**
   * List all loaded models
   */
  listLoadedModels(): LoadedModel[] {
    return Array.from(this.registry.values());
  }

  /**
   * Start model manager (initial load + periodic refresh)
   */
  async start(): Promise<void> {
    logger.info('Starting model manager', {
      models_dir: MODELS_DIR,
      check_interval_ms: CHECK_INTERVAL_MS,
    });

    // Initial load
    await this.ensureModels();

    // Periodic refresh
    this.checkInterval = setInterval(() => {
      this.ensureModels().catch((err) => {
        logger.error('Model check failed', { error: err.message });
      });
    }, CHECK_INTERVAL_MS);

    logger.info('Model manager started');
  }

  /**
   * Stop model manager
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('Model manager stopped');
  }
}

// Singleton instance (injected with pool in server.ts)
let modelManagerInstance: ModelManager | null = null;

export function createModelManager(pool: Pool): ModelManager {
  if (!modelManagerInstance) {
    modelManagerInstance = new ModelManager(pool);
  }
  return modelManagerInstance;
}

export function getModelManager(): ModelManager {
  if (!modelManagerInstance) {
    throw new Error('ModelManager not initialized. Call createModelManager first.');
  }
  return modelManagerInstance;
}
