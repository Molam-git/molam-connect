import { Pool } from "pg";
import { FloatAlert } from "../models/floatModels";

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export class AlertManager {
    constructor(private pool: Pool) { }

    // Créer une alerte
    async createAlert(alert: Omit<FloatAlert, 'id' | 'created_at' | 'acknowledged' | 'acknowledged_by' | 'acknowledged_at'>): Promise<FloatAlert> {
        try {
            const { rows } = await this.pool.query(`
        INSERT INTO float_alerts (entity_id, alert_type, severity, message)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [alert.entity_id, alert.alert_type, alert.severity, alert.message]);

            return rows[0];
        } catch (error) {
            throw new Error(`Failed to create alert: ${getErrorMessage(error)}`);
        }
    }

    // ... le reste des méthodes avec le même pattern de gestion d'erreurs
}