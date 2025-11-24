import { Pool } from 'pg';

export interface AgentLocation {
    location_id: string;
    agent_id: string;
    name: string;
    address: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    open_hours: any; // JSONB
    services: string[];
    created_at: Date;
}

export class AgentLocationModel {
    constructor(private db: Pool) { }

    async create(location: Omit<AgentLocation, 'location_id' | 'created_at'>): Promise<AgentLocation> {
        const query = `
      INSERT INTO agent_locations (agent_id, name, address, city, latitude, longitude, open_hours, services)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const values = [
            location.agent_id,
            location.name,
            location.address,
            location.city,
            location.latitude,
            location.longitude,
            location.open_hours,
            location.services
        ];

        const { rows } = await this.db.query(query, values);
        return rows[0];
    }

    async findByAgentId(agent_id: string): Promise<AgentLocation[]> {
        const { rows } = await this.db.query('SELECT * FROM agent_locations WHERE agent_id = $1', [agent_id]);
        return rows;
    }
}