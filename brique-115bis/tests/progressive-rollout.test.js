/**
 * Sous-Brique 115ter: Progressive Rollout Tests
 * Tests pour valider le système de déploiement progressif (canary release)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

describe('Progressive Rollout System (115ter)', () => {
  let pool;

  before(async () => {
    // Setup test database
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_test'
    });

    // Run migrations
    const migration001 = require('fs').readFileSync('./brique-115bis/migrations/001_rollback_automatic.sql', 'utf8');
    const migration002 = require('fs').readFileSync('./brique-115bis/migrations/002_progressive_rollout.sql', 'utf8');

    await pool.query(migration001);
    await pool.query(migration002);
  });

  after(async () => {
    // Cleanup test tables
    await pool.query('DROP TABLE IF EXISTS plugin_rollouts CASCADE');
    await pool.query('DROP TABLE IF EXISTS plugin_upgrade_logs CASCADE');
    await pool.query('DROP TABLE IF EXISTS plugin_backups CASCADE');
    await pool.query('DROP TABLE IF EXISTS plugin_rollback_history CASCADE');
    await pool.end();
  });

  /**
   * Test Case 1: Create progressive rollout with random strategy
   */
  describe('Case 1: Create Progressive Rollout (Random Strategy)', () => {
    it('should create a rollout with 5% random selection', async () => {
      const { rows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, plugin_name, version, rollout_percentage, rollout_strategy, status`,
        ['woocommerce', '4.0.0', 5, 'random', 'active']
      );

      assert.strictEqual(rows[0].plugin_name, 'woocommerce');
      assert.strictEqual(rows[0].version, '4.0.0');
      assert.strictEqual(rows[0].rollout_percentage, 5);
      assert.strictEqual(rows[0].rollout_strategy, 'random');
      assert.strictEqual(rows[0].status, 'active');

      console.log('✅ Random rollout created: 5% of merchants will receive upgrade');
    });
  });

  /**
   * Test Case 2: Merchant selection - Random strategy
   */
  describe('Case 2: Merchant Selection (Random Strategy)', () => {
    it('should select approximately 10% of merchants with random strategy', async () => {
      // Create 10% rollout
      await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        ['prestashop', '1.8.0', 10, 'random', 'active']
      );

      // Test 100 different merchants
      let selected = 0;
      const testMerchants = [];

      for (let i = 0; i < 100; i++) {
        const merchantId = `test-merchant-${i.toString().padStart(3, '0')}`;
        testMerchants.push(merchantId);

        const { rows } = await pool.query(
          `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
          [merchantId, 'prestashop']
        );

        if (rows[0].should_upgrade) {
          selected++;
        }
      }

      // Should be approximately 10% (allow 3-17% range for randomness)
      assert.ok(selected >= 3 && selected <= 17, `Expected ~10%, got ${selected}%`);
      console.log(`✅ Random selection: ${selected}/100 merchants selected (~10% target)`);

      // Verify deterministic: same merchant should always get same result
      const testId = testMerchants[0];
      const { rows: check1 } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [testId, 'prestashop']
      );

      const { rows: check2 } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [testId, 'prestashop']
      );

      assert.strictEqual(check1[0].should_upgrade, check2[0].should_upgrade);
      console.log('✅ Selection is deterministic (same merchant always gets same result)');
    });
  });

  /**
   * Test Case 3: Geo-targeted rollout
   */
  describe('Case 3: Geo-Targeted Rollout', () => {
    it('should only select merchants from target countries', async () => {
      // Create geo rollout: 50% of US and FR merchants
      await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy,
          target_countries, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['shopify', '2.5.0', 50, 'geo', ['US', 'FR'], 'active']
      );

      // Test US merchant (should have ~50% chance)
      const usMerchantId = 'us-merchant-test-001';
      const { rows: usCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2, $3) as should_upgrade`,
        [usMerchantId, 'shopify', 'US']
      );

      console.log(`✅ US merchant eligibility: ${usCheck[0].should_upgrade}`);

      // Test non-target country merchant (should always be false)
      const cnMerchantId = 'cn-merchant-test-001';
      const { rows: cnCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2, $3) as should_upgrade`,
        [cnMerchantId, 'shopify', 'CN']
      );

      assert.strictEqual(cnCheck[0].should_upgrade, false);
      console.log('✅ Non-target country (CN) correctly excluded from rollout');

      // Test multiple US merchants to verify percentage works
      let usSelected = 0;
      for (let i = 0; i < 50; i++) {
        const merchantId = `us-merchant-${i}`;
        const { rows } = await pool.query(
          `SELECT should_merchant_upgrade($1, $2, $3) as should_upgrade`,
          [merchantId, 'shopify', 'US']
        );
        if (rows[0].should_upgrade) usSelected++;
      }

      // Should be approximately 50% of US merchants (allow 35-65% range)
      assert.ok(usSelected >= 17 && usSelected <= 33, `Expected ~50% of US merchants, got ${usSelected}/50`);
      console.log(`✅ Geo rollout: ${usSelected}/50 US merchants selected (~50% target)`);
    });
  });

  /**
   * Test Case 4: Merchant tier targeting
   */
  describe('Case 4: Merchant Tier Targeting', () => {
    it('should prioritize enterprise tier merchants', async () => {
      // Create tier rollout: enterprise tier gets priority
      await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy,
          target_tiers, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['magento', '2.4.6', 25, 'merchant_tier', ['enterprise'], 'active']
      );

      // Test enterprise merchant (should always be selected)
      const enterpriseMerchantId = 'enterprise-merchant-001';
      const { rows: enterpriseCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2, NULL, $3) as should_upgrade`,
        [enterpriseMerchantId, 'magento', 'enterprise']
      );

      assert.strictEqual(enterpriseCheck[0].should_upgrade, true);
      console.log('✅ Enterprise tier merchant always selected');

      // Test standard tier merchant (should use random percentage)
      const standardMerchantId = 'standard-merchant-001';
      const { rows: standardCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2, NULL, $3) as should_upgrade`,
        [standardMerchantId, 'magento', 'standard']
      );

      console.log(`✅ Standard tier merchant uses random selection: ${standardCheck[0].should_upgrade}`);
    });
  });

  /**
   * Test Case 5: Update rollout percentage
   */
  describe('Case 5: Increase Rollout Percentage (5% → 25% → 100%)', () => {
    it('should gradually increase rollout coverage', async () => {
      // Create initial 5% rollout
      const { rows: initialRows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        ['drupal', '10.0.0', 5, 'random', 'active']
      );

      const rolloutId = initialRows[0].id;

      // Check initial coverage
      let selected = await countSelectedMerchants('drupal', 100);
      console.log(`✅ Initial 5% rollout: ${selected}/100 merchants selected`);

      // Increase to 25%
      await pool.query(
        `UPDATE plugin_rollouts SET rollout_percentage = 25 WHERE id = $1`,
        [rolloutId]
      );

      selected = await countSelectedMerchants('drupal', 100);
      assert.ok(selected >= 15 && selected <= 35, `Expected ~25%, got ${selected}%`);
      console.log(`✅ Increased to 25%: ${selected}/100 merchants selected`);

      // Increase to 100%
      await pool.query(
        `UPDATE plugin_rollouts SET rollout_percentage = 100 WHERE id = $1`,
        [rolloutId]
      );

      selected = await countSelectedMerchants('drupal', 100);
      assert.strictEqual(selected, 100);
      console.log(`✅ Full rollout (100%): ${selected}/100 merchants selected`);
    });
  });

  /**
   * Test Case 6: Pause/Resume rollout
   */
  describe('Case 6: Pause and Resume Rollout', () => {
    it('should prevent upgrades when paused, allow when resumed', async () => {
      // Create active rollout
      const { rows: createRows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        ['joomla', '4.2.0', 50, 'random', 'active']
      );

      const rolloutId = createRows[0].id;
      const testMerchantId = 'test-merchant-pause';

      // Check if merchant would be selected (when active)
      const { rows: activeCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [testMerchantId, 'joomla']
      );

      const wasSelected = activeCheck[0].should_upgrade;
      console.log(`✅ When active, merchant selection: ${wasSelected}`);

      // Pause rollout
      await pool.query(
        `UPDATE plugin_rollouts SET status = 'paused' WHERE id = $1`,
        [rolloutId]
      );

      // Check again (should now be false)
      const { rows: pausedCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [testMerchantId, 'joomla']
      );

      assert.strictEqual(pausedCheck[0].should_upgrade, false);
      console.log('✅ When paused, merchant correctly excluded');

      // Resume rollout
      await pool.query(
        `UPDATE plugin_rollouts SET status = 'active' WHERE id = $1`,
        [rolloutId]
      );

      // Check again (should return to original selection)
      const { rows: resumedCheck } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [testMerchantId, 'joomla']
      );

      assert.strictEqual(resumedCheck[0].should_upgrade, wasSelected);
      console.log(`✅ When resumed, merchant selection restored: ${wasSelected}`);
    });
  });

  /**
   * Test Case 7: Sira auto-pause on high error rate
   */
  describe('Case 7: Sira Auto-Pause (Error Rate > Threshold)', () => {
    it('should auto-pause rollout when error rate exceeds threshold', async () => {
      // Create rollout with 3% error threshold
      const { rows: rolloutRows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy,
          status, sira_monitoring, error_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        ['wordpress', '6.4.0', 20, 'random', 'active', true, 0.03]
      );

      const rolloutId = rolloutRows[0].id;

      // Simulate upgrades with high failure rate
      const merchantsTotal = 50;
      const merchantsFailed = 5; // 10% failure rate (exceeds 3% threshold)

      for (let i = 0; i < merchantsTotal; i++) {
        const merchantId = `wp-merchant-${i}`;
        const status = i < merchantsFailed ? 'failed' : 'success';

        await pool.query(
          `INSERT INTO plugin_upgrade_logs (
            merchant_id, plugin_name, from_version, to_version, status
          ) VALUES ($1, $2, $3, $4, $5)`,
          [merchantId, 'wordpress', '6.3.0', '6.4.0', status]
        );
      }

      // Check error rate
      const { rows: errorRateRows } = await pool.query(
        `SELECT get_rollout_error_rate($1) as error_rate`,
        [rolloutId]
      );

      const errorRate = parseFloat(errorRateRows[0].error_rate);
      console.log(`✅ Current error rate: ${(errorRate * 100).toFixed(2)}% (threshold: 3%)`);
      assert.ok(errorRate > 0.03, 'Error rate should exceed threshold');

      // Trigger Sira auto-pause check
      const { rows: pausedRows } = await pool.query(
        `SELECT auto_pause_failing_rollouts() as paused_count`
      );

      const pausedCount = pausedRows[0].paused_count;
      assert.strictEqual(pausedCount, 1);
      console.log(`✅ Sira auto-paused ${pausedCount} rollout(s)`);

      // Verify rollout is paused
      const { rows: statusRows } = await pool.query(
        `SELECT status FROM plugin_rollouts WHERE id = $1`,
        [rolloutId]
      );

      assert.strictEqual(statusRows[0].status, 'paused');
      console.log('✅ Rollout status changed to "paused"');

      // Verify rollback history logged
      const { rows: historyRows } = await pool.query(
        `SELECT sira_triggered, error_rate_detected
         FROM plugin_rollback_history
         WHERE plugin_name = $1 AND sira_triggered = TRUE
         ORDER BY created_at DESC
         LIMIT 1`,
        ['wordpress']
      );

      assert.ok(historyRows.length > 0);
      assert.strictEqual(historyRows[0].sira_triggered, true);
      assert.ok(parseFloat(historyRows[0].error_rate_detected) > 0.03);
      console.log('✅ Sira-triggered rollback logged in history');
    });
  });

  /**
   * Test Case 8: Complete rollout (mark as completed)
   */
  describe('Case 8: Complete Rollout', () => {
    it('should mark rollout as completed when fully deployed', async () => {
      // Create 100% rollout
      const { rows: createRows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        ['typo3', '12.0.0', 100, 'random', 'active']
      );

      const rolloutId = createRows[0].id;

      // Mark as completed
      await pool.query(
        `UPDATE plugin_rollouts
         SET status = 'completed', completed_at = now()
         WHERE id = $1`,
        [rolloutId]
      );

      // Verify status
      const { rows } = await pool.query(
        `SELECT status, completed_at FROM plugin_rollouts WHERE id = $1`,
        [rolloutId]
      );

      assert.strictEqual(rows[0].status, 'completed');
      assert.ok(rows[0].completed_at !== null);
      console.log('✅ Rollout marked as completed');
    });
  });

  /**
   * Test Case 9: View active rollouts with metrics
   */
  describe('Case 9: Active Rollouts View with Metrics', () => {
    it('should return rollout metrics via view', async () => {
      // Create rollout
      const { rows: rolloutRows } = await pool.query(
        `INSERT INTO plugin_rollouts (
          plugin_name, version, rollout_percentage, rollout_strategy, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        ['concrete5', '9.2.0', 15, 'random', 'active']
      );

      const rolloutId = rolloutRows[0].id;

      // Simulate some upgrades
      for (let i = 0; i < 20; i++) {
        await pool.query(
          `INSERT INTO plugin_upgrade_logs (
            merchant_id, plugin_name, to_version, status
          ) VALUES ($1, $2, $3, $4)`,
          [`merchant-${i}`, 'concrete5', '9.2.0', i < 18 ? 'success' : 'failed']
        );
      }

      // Query view
      const { rows } = await pool.query(
        `SELECT * FROM v_active_rollouts WHERE id = $1`,
        [rolloutId]
      );

      assert.strictEqual(rows[0].plugin_name, 'concrete5');
      assert.strictEqual(rows[0].version, '9.2.0');
      assert.strictEqual(rows[0].rollout_percentage, 15);
      assert.strictEqual(rows[0].merchants_upgraded, 20);

      const errorRate = parseFloat(rows[0].error_rate);
      assert.ok(errorRate > 0 && errorRate < 0.15); // ~10% error rate

      console.log(`✅ View returned metrics: ${rows[0].merchants_upgraded} merchants, ${(errorRate * 100).toFixed(1)}% error rate`);
    });
  });

  // Helper function
  async function countSelectedMerchants(pluginName, count) {
    let selected = 0;
    for (let i = 0; i < count; i++) {
      const merchantId = `test-merchant-${pluginName}-${i}`;
      const { rows } = await pool.query(
        `SELECT should_merchant_upgrade($1, $2) as should_upgrade`,
        [merchantId, pluginName]
      );
      if (rows[0].should_upgrade) selected++;
    }
    return selected;
  }
});
