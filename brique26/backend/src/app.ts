import express from 'express';
import { Pool } from 'pg';
import floatRoutes from './routes/floatRoutes';

const app = express();
app.use(express.json());

// Middleware de base de données
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

app.use((req, res, next) => {
    (req as any).db = pool;
    next();
});

// Routes
app.use('/api/float', floatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Float Management Service running on port ${PORT}`);
});