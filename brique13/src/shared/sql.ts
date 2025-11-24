// Utilitaires SQL
export class SQL {
    static escapeLike(value: string): string {
        return value.replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    static buildInClause(field: string, values: any[]): { sql: string, params: any[] } {
        if (values.length === 0) {
            return { sql: 'FALSE', params: [] };
        }

        const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
        return {
            sql: `${field} IN (${placeholders})`,
            params: values
        };
    }
}