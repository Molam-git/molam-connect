// ============================================================================
// Brique 121 — Bank Connectors Main Export
// ============================================================================

// Types & Interfaces
export * from './types';

// Connectors
export { RestSandboxConnector } from './connectors/rest-sandbox-connector';
export { logConnectorExecution } from './connectors/logger';

// Utilities
export {
  VaultClient,
  initVaultClient,
  getVaultClient,
  getVaultSecret,
  resolveConnectorConfig,
  encryptLocal,
  decryptLocal
} from './utils/vault';

export {
  HSMManager,
  initHSMManager,
  getHSMManager,
  signXmlWithHSM,
  verifyXmlSignature,
  signPain001,
  signWithHMAC,
  verifyHMAC,
  generateIdempotencyKey,
  verifyBankSignature,
  loadMTLSCertificates
} from './utils/hsm';

export {
  CircuitBreaker,
  RetryExecutor,
  ResilientExecutor,
  CircuitBreakerRegistry,
  getCircuitBreakerRegistry,
  createResilientExecutor,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_POLICY,
  State as CircuitBreakerState
} from './utils/circuit-breaker';

export {
  parseMT940,
  parseCSVStatement,
  validateMT940,
  MT940Statement,
  MT940Transaction,
  MT940Balance
} from './utils/mt940-parser';

// Version
export const VERSION = '1.0.0-beta';

// ============================================================================
// End of exports
// ============================================================================
