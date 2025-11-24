import sequelize from '../src/config/database';

const runMigration = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB établie');

    const migrationQuery = `
      CREATE TABLE IF NOT EXISTS molam_qr_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        transaction_id UUID,
        qr_value TEXT NOT NULL,
        amount NUMERIC(18,2),
        currency TEXT NOT NULL DEFAULT 'XOF',
        expires_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        used_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_qr_user ON molam_qr_codes(user_id);
      CREATE INDEX IF NOT EXISTS idx_qr_status ON molam_qr_codes(status);
      CREATE INDEX IF NOT EXISTS idx_qr_expiry ON molam_qr_codes(expires_at);
    `;

    await sequelize.query(migrationQuery);
    console.log('✅ Table molam_qr_codes créée avec succès');

  } catch (error) {
    console.error('❌ Erreur migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

runMigration();