import { BankConnector } from '../connectors/BankConnectorInterface';
import { sandboxBankConnector } from '../connectors/sandboxBankConnector';

export class BankConnectorService {
    private connectors: Map<string, BankConnector> = new Map();

    constructor() {
        this.registerConnector('sandbox', sandboxBankConnector);
        // Enregistrer d'autres connecteurs ici
    }

    registerConnector(name: string, connector: BankConnector) {
        this.connectors.set(name, connector);
    }

    getConnector(name: string): BankConnector {
        const connector = this.connectors.get(name);
        if (!connector) {
            throw new Error(`Connector ${name} not found`);
        }
        return connector;
    }

    async sendPayment(connectorName: string, payout: any) {
        const connector = this.getConnector(connectorName);
        return connector.sendPayment(payout);
    }

    // Autres méthodes pour utiliser le connecteur
}