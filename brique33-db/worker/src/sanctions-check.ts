// worker/src/sanctions-check.ts
export interface SanctionsCheckResult {
    flag: boolean;
    matches: string[];
    score: number;
}

export async function checkSanctions(names: string[]): Promise<SanctionsCheckResult> {
    // Intégration avec des listes de sanctions (OFAC, ONU, etc.)
    const sanctionsLists = [
        "TERRORIST_1", "SANCTIONED_ENTITY_2" // Données simulées
    ];

    const matches: string[] = [];
    let flag = false;

    for (const name of names) {
        for (const sanctioned of sanctionsLists) {
            if (name.toLowerCase().includes(sanctioned.toLowerCase())) {
                matches.push(`${name} matched ${sanctioned}`);
                flag = true;
            }
        }
    }

    return {
        flag,
        matches,
        score: flag ? 100 : 0
    };
}