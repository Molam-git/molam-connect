/**
 * Brique 84 — Payouts Engine
 * Bank Connector Factory
 *
 * Manages bank connector instances and routing
 */

import { BankConnector } from './bankConnector';
import { ACHConnector } from './achConnector';
import { WireConnector } from './wireConnector';
import { SEPAConnector } from './sepaConnector';

export interface ConnectorConfig {
  connectorId: string;
  rail: string;
  enabled: boolean;
  config: Record<string, any>;
}

export class BankConnectorFactory {
  private connectors: Map<string, BankConnector> = new Map();

  constructor(configs?: ConnectorConfig[]) {
    if (configs) {
      this.registerConnectors(configs);
    } else {
      this.registerDefaultConnectors();
    }
  }

  /**
   * Register connectors from config
   */
  private registerConnectors(configs: ConnectorConfig[]): void {
    for (const config of configs) {
      if (!config.enabled) continue;

      const connector = this.createConnector(config.connectorId, config.rail, config.config);
      if (connector) {
        this.connectors.set(this.getKey(config.connectorId, config.rail), connector);
      }
    }
  }

  /**
   * Register default connectors (for testing)
   */
  private registerDefaultConnectors(): void {
    const defaultConfigs: ConnectorConfig[] = [
      {
        connectorId: 'default',
        rail: 'ach',
        enabled: true,
        config: {
          baseURL: process.env.ACH_BASE_URL || 'https://api.achbank.example.com',
          apiKey: process.env.ACH_API_KEY || 'test_key'
        }
      },
      {
        connectorId: 'default',
        rail: 'wire',
        enabled: true,
        config: {
          baseURL: process.env.WIRE_BASE_URL || 'https://api.wirebank.example.com',
          apiKey: process.env.WIRE_API_KEY || 'test_key'
        }
      },
      {
        connectorId: 'default',
        rail: 'sepa',
        enabled: true,
        config: {
          baseURL: process.env.SEPA_BASE_URL || 'https://api.sepa.example.com',
          apiKey: process.env.SEPA_API_KEY || 'test_key'
        }
      }
    ];

    this.registerConnectors(defaultConfigs);
  }

  /**
   * Create connector instance based on rail type
   */
  private createConnector(
    connectorId: string,
    rail: string,
    config: Record<string, any>
  ): BankConnector | null {
    switch (rail.toLowerCase()) {
      case 'ach':
        return new ACHConnector(connectorId, config);

      case 'wire':
      case 'fedwire':
        return new WireConnector(connectorId, config);

      case 'sepa':
        return new SEPAConnector(connectorId, config);

      // Add more rails as needed:
      // case 'faster_payments':
      //   return new FasterPaymentsConnector(connectorId, config);
      //
      // case 'mobile_money':
      //   return new MobileMoneyConnector(connectorId, config);

      default:
        console.warn(`[ConnectorFactory] Unknown rail type: ${rail}`);
        return null;
    }
  }

  /**
   * Get connector by ID and rail
   */
  getConnector(connectorId: string, rail: string): BankConnector | null {
    const key = this.getKey(connectorId, rail);
    const connector = this.connectors.get(key);

    if (!connector) {
      console.warn(`[ConnectorFactory] Connector not found: ${key}`);
      // Fallback to default connector for this rail
      return this.connectors.get(this.getKey('default', rail)) || null;
    }

    return connector;
  }

  /**
   * Register a new connector
   */
  registerConnector(
    connectorId: string,
    rail: string,
    connector: BankConnector
  ): void {
    const key = this.getKey(connectorId, rail);
    this.connectors.set(key, connector);
    console.log(`[ConnectorFactory] Registered connector: ${key}`);
  }

  /**
   * List all registered connectors
   */
  listConnectors(): Array<{ connectorId: string; rail: string; capabilities: any }> {
    const result: Array<{ connectorId: string; rail: string; capabilities: any }> = [];

    this.connectors.forEach((connector, key) => {
      const [connectorId, rail] = key.split(':');
      result.push({
        connectorId,
        rail,
        capabilities: connector.getCapabilities()
      });
    });

    return result;
  }

  /**
   * Health check all connectors
   */
  async healthCheckAll(): Promise<Record<string, { healthy: boolean; message?: string }>> {
    const results: Record<string, { healthy: boolean; message?: string }> = {};

    for (const [key, connector] of this.connectors) {
      try {
        results[key] = await connector.healthCheck();
      } catch (error: any) {
        results[key] = {
          healthy: false,
          message: error.message
        };
      }
    }

    return results;
  }

  /**
   * Generate connector key
   */
  private getKey(connectorId: string, rail: string): string {
    return `${connectorId}:${rail}`;
  }
}
