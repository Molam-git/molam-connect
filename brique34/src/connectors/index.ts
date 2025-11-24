// src/connectors/index.ts
import { BankConnector } from './BankConnectorInterface';
import { sandboxBankConnector } from './sandboxBankConnector';
import { BankConnectorService } from '../services/bankConnectorService';

export const bankConnectorService = new BankConnectorService();

// Enregistrer les connecteurs disponibles
bankConnectorService.registerConnector('sandbox', sandboxBankConnector);

export { BankConnector } from './BankConnectorInterface';