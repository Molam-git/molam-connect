import { RuleEngineWorker } from '../../src/workers/ruleEngineWorker';

describe('RuleEngineWorker', () => {
    let worker: RuleEngineWorker;

    beforeEach(() => {
        worker = new RuleEngineWorker();
    });

    it('should evaluate duplicate transaction rule', async () => {
        // Test de la règle de doublon
        // À compléter avec des mocks et des assertions
    });

    // Autres tests unitaires...
});