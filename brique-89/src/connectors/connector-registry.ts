// Connector Registry
// Manages bank connector instances

import { BaseBankConnector } from './base-connector';
import { SandboxConnector } from './sandbox-connector';
import { pool } from '../utils/db';

class ConnectorRegistry {
  private connectors: Map<string, BaseBankConnector>;

  constructor() {
    this.connectors = new Map();
  }

  /**
   * Register a connector for a bank profile
   */
  register(bank_profile_id: string, connector: BaseBankConnector): void {
    this.connectors.set(bank_profile_id, connector);
    console.log(`✅ Registered connector for bank profile: ${bank_profile_id}`);
  }

  /**
   * Get connector for a bank profile
   */
  get(bank_profile_id: string): BaseBankConnector | undefined {
    return this.connectors.get(bank_profile_id);
  }

  /**
   * Get connector or throw error
   */
  getOrThrow(bank_profile_id: string): BaseBankConnector {
    const connector = this.get(bank_profile_id);
    if (!connector) {
      throw new Error(`No connector registered for bank profile: ${bank_profile_id}`);
    }
    return connector;
  }

  /**
   * Check if connector exists for bank profile
   */
  has(bank_profile_id: string): boolean {
    return this.connectors.has(bank_profile_id);
  }

  /**
   * Get all registered connectors
   */
  getAll(): Map<string, BaseBankConnector> {
    return this.connectors;
  }

  /**
   * Health check all connectors
   */
  async healthCheckAll(): Promise<Map<string, any>> {
    const results = new Map();

    for (const [bank_profile_id, connector] of this.connectors.entries()) {
      try {
        const health = await connector.healthCheck();
        results.set(bank_profile_id, {
          connector_name: connector.getName(),
          ...health,
        });
      } catch (error: any) {
        results.set(bank_profile_id, {
          connector_name: connector.getName(),
          healthy: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Unregister connector
   */
  unregister(bank_profile_id: string): boolean {
    return this.connectors.delete(bank_profile_id);
  }
}

// Singleton instance
export const connectorRegistry = new ConnectorRegistry();

/**
 * Initialize connectors from database configuration
 */
export async function initializeConnectors(): Promise<void> {
  console.log('🔌 Initializing bank connectors...');

  try {
    // Query bank profiles
    const { rows: bankProfiles } = await pool.query(
      `SELECT id, bank_name, connector_type, connector_config, active
       FROM bank_profiles
       WHERE active = TRUE`
    );

    for (const profile of bankProfiles) {
      const connector = createConnector(
        profile.connector_type,
        profile.connector_config || {}
      );

      if (connector) {
        connectorRegistry.register(profile.id, connector);
      }
    }

    console.log(`✅ Initialized ${connectorRegistry.getAll().size} connectors`);
  } catch (error: any) {
    console.error('❌ Failed to initialize connectors:', error.message);

    // Fallback: register sandbox connector
    console.log('⚠️  Using sandbox connector as fallback');
    connectorRegistry.register('sandbox', new SandboxConnector());
  }
}

/**
 * Create connector instance based on type
 */
function createConnector(
  connector_type: string,
  config: any
): BaseBankConnector | null {
  switch (connector_type) {
    case 'sandbox':
      return new SandboxConnector(config);

    // Add other connector types here:
    // case 'stripe':
    //   return new StripeConnector(config);
    // case 'wise':
    //   return new WiseConnector(config);
    // case 'modulr':
    //   return new ModulrConnector(config);

    default:
      console.warn(`Unknown connector type: ${connector_type}`);
      return null;
  }
}

/**
 * Get connector for bank profile (helper function)
 */
export function getBankConnector(bank_profile_id: string): BaseBankConnector {
  return connectorRegistry.getOrThrow(bank_profile_id);
}
