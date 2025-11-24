import app from './ussd/server';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 USSD Server running on port ${PORT}`);
    console.log(`📞 Endpoint: /api/ussd/receive`);
});