// Interface minimale pour la base de données
export const db = {
    any: async (_query: string, _params: any[] = []) => {
        // Implémentation réelle utilisant pg-promise ou autre
        return [];
    },
    one: async (_query: string, _params: any[] = []) => {
        // Implémentation réelle
        return {};
    },
    none: async (_query: string, _params: any[] = []) => {
        // Implémentation réelle
    },
    tx: async (callback: (t: any) => Promise<any>) => {
        // Implémentation réelle de transaction
        return callback(db);
    }
};