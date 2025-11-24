import express from 'express';
import agentsRouter from './routes/agents';
import treasuryRouter from './routes/treasury';
import siraRouter from './routes/sira';

const app = express();

app.use(express.json());
app.use('/api/agents', agentsRouter);
app.use('/api/treasury', treasuryRouter);
app.use('/api/sira', siraRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export { app };