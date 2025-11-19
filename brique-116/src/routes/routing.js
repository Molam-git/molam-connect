/**
 * Brique 116: Charge Routing Logs API
 * Endpoints pour logger et analyser les tentatives de paiement
 */

const express = require('express');
const router = express.Router();

let pool;

// Middleware pour l'authentification par rôle
const requireRole = (roles) => {
  return (req, res, next) => {
    const userRole = req.headers['x-user-role'];
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'forbidden', required_roles: roles });
    }
    next();
  };
};

// Initialiser le pool de connexion
function setPool(pgPool) {
  pool = pgPool;
}

/**
 * POST /api/charges/routing-log
 * Logger une tentative de routing de paiement
 */
router.post('/routing-log', requireRole(['ops_debug', 'sira_ai', 'plugin_client']), async (req, res) => {
  try {
    const {
      transaction_id,
      merchant_id,
      user_id,
      method,
      route,
      amount,
      currency,
      status,
      latency_ms,
      error_code,
      fallback_route,
      country_code,
      provider,
      metadata
    } = req.body;

    // Validation
    if (!transaction_id || !merchant_id || !method || !route || !amount || !currency || !status) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['transaction_id', 'merchant_id', 'method', 'route', 'amount', 'currency', 'status']
      });
    }

    const validMethods = ['wallet', 'card', 'bank'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'invalid_method', valid: validMethods });
    }

    const validStatuses = ['success', 'failed', 'retried'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'invalid_status', valid: validStatuses });
    }

    await pool.query(
      `INSERT INTO charge_routing_logs (
        transaction_id, merchant_id, user_id, method, route,
        amount, currency, status, latency_ms, error_code,
        fallback_route, country_code, provider, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        transaction_id,
        merchant_id,
        user_id,
        method,
        route,
        amount,
        currency,
        status,
        latency_ms || null,
        error_code || null,
        fallback_route || null,
        country_code || null,
        provider || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    console.log(`✅ Routing log: ${transaction_id} → ${route} (${status})`);

    res.json({ ok: true, message: 'Routing logged successfully' });
  } catch (error) {
    console.error('❌ Routing log failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/routing-stats/:merchantId
 * Statistiques de routing par route pour un marchand
 */
router.get('/routing-stats/:merchantId', requireRole(['ops_debug', 'ops_finance', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { method, days = 7 } = req.query;

    let query = `
      SELECT
        route,
        method,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate,
        ROUND(AVG(latency_ms)::numeric, 2) as avg_latency,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) as p95_latency,
        SUM(amount) as total_volume,
        currency
      FROM charge_routing_logs
      WHERE merchant_id = $1
        AND created_at >= now() - INTERVAL '${parseInt(days)} days'
    `;

    const params = [merchantId];
    let paramIndex = 2;

    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method);
    }

    query += `
      GROUP BY route, method, currency
      ORDER BY total DESC
    `;

    const { rows } = await pool.query(query, params);

    res.json({
      merchant_id: merchantId,
      period_days: days,
      stats: rows
    });
  } catch (error) {
    console.error('❌ Routing stats failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/routing-recommendations/:merchantId
 * Recommandations Sira pour optimiser les routes
 */
router.get('/routing-recommendations/:merchantId', requireRole(['ops_debug', 'sira_ai', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { method } = req.query;

    const { rows } = await pool.query(
      `SELECT * FROM get_route_recommendations($1, $2)`,
      [merchantId, method || null]
    );

    res.json({
      merchant_id: merchantId,
      recommendations: rows
    });
  } catch (error) {
    console.error('❌ Get recommendations failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/routing-anomalies
 * Détection d'anomalies en temps réel (Sira monitoring)
 */
router.get('/routing-anomalies', requireRole(['sira_ai', 'ops_debug']), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM detect_routing_anomalies()');

    res.json({
      anomalies: rows,
      detected_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Anomaly detection failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/failing-routes
 * Routes avec taux d'échec élevé (> 10%)
 */
router.get('/failing-routes', requireRole(['ops_debug', 'sira_ai']), async (req, res) => {
  try {
    const { merchant_id, limit = 20 } = req.query;

    let query = 'SELECT * FROM v_failing_routes WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    query += ` ORDER BY failure_rate_pct DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    res.json({
      failing_routes: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Get failing routes failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/slow-routes
 * Routes avec latence élevée (p95 > 2000ms)
 */
router.get('/slow-routes', requireRole(['ops_debug', 'sira_ai']), async (req, res) => {
  try {
    const { merchant_id, limit = 20 } = req.query;

    let query = 'SELECT * FROM v_slow_routes WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    query += ` ORDER BY p95_latency_ms DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    res.json({
      slow_routes: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Get slow routes failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/routing-history
 * Historique des logs de routing avec filtres
 */
router.get('/routing-history', requireRole(['ops_debug', 'ops_finance']), async (req, res) => {
  try {
    const {
      merchant_id,
      transaction_id,
      route,
      method,
      status,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM charge_routing_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    if (transaction_id) {
      query += ` AND transaction_id = $${paramIndex++}`;
      params.push(transaction_id);
    }

    if (route) {
      query += ` AND route = $${paramIndex++}`;
      params.push(route);
    }

    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({
      logs: rows,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Get routing history failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/charges/routing-overview
 * Vue d'ensemble des performances de routing
 */
router.get('/routing-overview', requireRole(['ops_debug', 'ops_finance', 'merchant_view']), async (req, res) => {
  try {
    const { merchant_id } = req.query;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id required' });
    }

    // Stats globales
    const { rows: globalStats } = await pool.query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate,
        ROUND(AVG(latency_ms)::numeric, 2) as avg_latency,
        SUM(amount) as total_volume,
        currency
      FROM charge_routing_logs
      WHERE merchant_id = $1
        AND created_at >= now() - INTERVAL '7 days'
      GROUP BY currency`,
      [merchant_id]
    );

    // Performance par méthode
    const { rows: methodStats } = await pool.query(
      `SELECT * FROM v_routing_stats_by_method
       WHERE merchant_id = $1
       ORDER BY total_attempts DESC`,
      [merchant_id]
    );

    // Top 5 routes
    const { rows: topRoutes } = await pool.query(
      `SELECT * FROM v_routing_stats_by_route
       WHERE merchant_id = $1
       ORDER BY total_attempts DESC
       LIMIT 5`,
      [merchant_id]
    );

    // Recommandations
    const { rows: recommendations } = await pool.query(
      `SELECT * FROM get_route_recommendations($1, NULL)`,
      [merchant_id]
    );

    res.json({
      merchant_id,
      period: 'last_7_days',
      global_stats: globalStats[0] || null,
      performance_by_method: methodStats,
      top_routes: topRoutes,
      recommendations: recommendations.filter(r => r.recommendation !== 'ok')
    });
  } catch (error) {
    console.error('❌ Get routing overview failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * ============================================================================
 * Sous-Brique 116bis: Smart Auto-Routing by Sira
 * ============================================================================
 */

/**
 * POST /api/charges/auto-route
 * Get Sira's automatic routing decision
 */
router.post('/auto-route', requireRole(['plugin_client', 'merchant_api', 'ops_debug']), async (req, res) => {
  try {
    const {
      transaction_id,
      merchant_id,
      user_id,
      method,
      amount,
      currency
    } = req.body;

    // Validation
    if (!transaction_id || !merchant_id || !method || !amount || !currency) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['transaction_id', 'merchant_id', 'method', 'amount', 'currency']
      });
    }

    // Get candidate routes from historical data
    const { rows: candidates } = await pool.query(
      `SELECT * FROM get_candidate_routes($1, $2, $3)`,
      [merchant_id, method, currency]
    );

    if (candidates.length === 0) {
      return res.status(404).json({
        error: 'no_routes_available',
        message: 'No routing data available for this merchant/method/currency combination'
      });
    }

    // Convert to scores object
    const candidateScores = {};
    candidates.forEach(c => {
      candidateScores[c.route] = parseFloat(c.score);
    });

    // Choose best route (highest score)
    const bestRoute = candidates[0].route;
    const confidence = parseFloat(candidates[0].score);
    const fallbackRoute = candidates.length > 1 ? candidates[1].route : null;
    const siraVersion = 'v2.1'; // Could be dynamic

    // Save decision
    await pool.query(
      `INSERT INTO routing_decisions (
        transaction_id, merchant_id, user_id, method, amount, currency,
        candidate_routes, chosen_route, confidence, fallback_route, sira_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        transaction_id,
        merchant_id,
        user_id,
        method,
        amount,
        currency,
        JSON.stringify(candidateScores),
        bestRoute,
        confidence,
        fallbackRoute,
        siraVersion
      ]
    );

    console.log(`🤖 Sira auto-route: ${bestRoute} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    res.json({
      route: bestRoute,
      confidence: confidence,
      fallback: fallbackRoute,
      candidates: candidateScores,
      sira_version: siraVersion
    });
  } catch (error) {
    console.error('❌ Auto-route failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/decisions/:merchantId
 * Get routing decisions for a merchant
 */
router.get('/decisions/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { rows } = await pool.query(
      `SELECT * FROM v_routing_decisions_with_results
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset]
    );

    res.json({
      merchant_id: merchantId,
      decisions: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Get decisions failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/sira-performance
 * Get Sira routing performance metrics
 */
router.get('/sira-performance', requireRole(['ops_debug', 'sira_ai']), async (req, res) => {
  try {
    const { sira_version } = req.query;

    const { rows } = await pool.query(
      `SELECT * FROM analyze_sira_accuracy($1)`,
      [sira_version || null]
    );

    res.json({
      performance: rows
    });
  } catch (error) {
    console.error('❌ Get Sira performance failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/routing/decisions/:id/override
 * Override Sira decision manually (Ops)
 */
router.post('/decisions/:id/override', requireRole(['ops_debug', 'pay_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { new_route, reason, operator_id } = req.body;

    if (!new_route || !reason || !operator_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['new_route', 'reason', 'operator_id']
      });
    }

    const { rows } = await pool.query(
      `UPDATE routing_decisions
       SET chosen_route = $2,
           override_by = $3,
           override_reason = $4
       WHERE id = $1
       RETURNING *`,
      [id, new_route, operator_id, reason]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'decision_not_found' });
    }

    console.log(`🔧 Decision ${id} overridden to ${new_route} by ${operator_id}`);

    res.json({
      ok: true,
      decision: rows[0]
    });
  } catch (error) {
    console.error('❌ Override decision failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * ============================================================================
 * Sous-Brique 116ter: Predictive Routing Simulator (Sira)
 * ============================================================================
 */

/**
 * POST /api/charges/simulate-routing
 * Simulate routing outcomes before execution
 */
router.post('/simulate-routing', requireRole(['plugin_client', 'merchant_api', 'ops_debug']), async (req, res) => {
  try {
    const {
      merchant_id,
      user_id,
      method,
      amount,
      currency,
      country_code
    } = req.body;

    // Validation
    if (!merchant_id || !method || !amount || !currency) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['merchant_id', 'method', 'amount', 'currency']
      });
    }

    const validMethods = ['wallet', 'card', 'bank'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'invalid_method', valid: validMethods });
    }

    // Run simulation
    const { rows: simulatedRoutes } = await pool.query(
      `SELECT * FROM simulate_routing($1, $2, $3, $4, $5)
       ORDER BY predicted_success_rate_pct DESC`,
      [merchant_id, method, amount, currency, country_code || null]
    );

    if (simulatedRoutes.length === 0) {
      return res.status(404).json({
        error: 'no_routes_available',
        message: 'Insufficient historical data to simulate routing for this merchant/method/currency'
      });
    }

    // Convert to structured format
    const routesData = {};
    simulatedRoutes.forEach(r => {
      routesData[r.route] = {
        predicted_success_rate_pct: parseFloat(r.predicted_success_rate_pct),
        predicted_latency_ms: parseFloat(r.predicted_latency_ms),
        predicted_fees_usd: parseFloat(r.predicted_fees_usd),
        confidence: parseFloat(r.confidence),
        risk_level: r.risk_level,
        recommendation: r.recommendation
      };
    });

    const siraVersion = 'v2.1-simulator'; // Could be dynamic

    // Save simulation to database
    const { rows: savedSimulation } = await pool.query(
      `INSERT INTO routing_simulations (
        merchant_id, user_id, method, amount, currency,
        simulated_routes, sira_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING simulation_id, created_at`,
      [
        merchant_id,
        user_id || null,
        method,
        amount,
        currency,
        JSON.stringify(routesData),
        siraVersion
      ]
    );

    const simulationId = savedSimulation[0].simulation_id;

    console.log(`🔮 Routing simulation created: ${simulationId} for ${merchant_id} (${simulatedRoutes.length} routes)`);

    // Prepare response with best route recommendation
    const bestRoute = simulatedRoutes[0];

    res.json({
      simulation_id: simulationId,
      merchant_id: merchant_id,
      method: method,
      amount: amount,
      currency: currency,
      simulated_at: savedSimulation[0].created_at,
      sira_version: siraVersion,
      routes: routesData,
      recommendation: {
        route: bestRoute.route,
        predicted_success_rate_pct: parseFloat(bestRoute.predicted_success_rate_pct),
        predicted_latency_ms: parseFloat(bestRoute.predicted_latency_ms),
        predicted_fees_usd: parseFloat(bestRoute.predicted_fees_usd),
        risk_level: bestRoute.risk_level,
        confidence: parseFloat(bestRoute.confidence)
      }
    });
  } catch (error) {
    console.error('❌ Simulate routing failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/routing/simulations/:simulationId/execute
 * Record actual outcome after executing a simulated route
 */
router.post('/simulations/:simulationId/execute', requireRole(['plugin_client', 'merchant_api', 'ops_debug']), async (req, res) => {
  try {
    const { simulationId } = req.params;
    const { chosen_route, actual_outcome } = req.body;

    // Validation
    if (!chosen_route || !actual_outcome) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['chosen_route', 'actual_outcome']
      });
    }

    const validOutcomes = ['success', 'failed'];
    if (!validOutcomes.includes(actual_outcome)) {
      return res.status(400).json({ error: 'invalid_outcome', valid: validOutcomes });
    }

    // Record outcome
    const { rows: result } = await pool.query(
      `SELECT record_simulation_outcome($1, $2, $3) as was_correct`,
      [simulationId, chosen_route, actual_outcome]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'simulation_not_found' });
    }

    const wasCorrect = result[0].was_correct;

    console.log(`✅ Simulation ${simulationId} executed: ${chosen_route} → ${actual_outcome} (prediction ${wasCorrect ? 'correct' : 'incorrect'})`);

    res.json({
      ok: true,
      simulation_id: simulationId,
      chosen_route: chosen_route,
      actual_outcome: actual_outcome,
      was_prediction_correct: wasCorrect,
      message: 'Simulation outcome recorded successfully'
    });
  } catch (error) {
    console.error('❌ Record simulation outcome failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/simulations/:merchantId
 * Get simulation history for a merchant
 */
router.get('/simulations/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { limit = 50, offset = 0, executed_only = 'false' } = req.query;

    let query = `
      SELECT * FROM routing_simulations
      WHERE merchant_id = $1
    `;

    const params = [merchantId, limit, offset];

    if (executed_only === 'true') {
      query += ` AND executed_at IS NOT NULL`;
    }

    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;

    const { rows } = await pool.query(query, params);

    res.json({
      merchant_id: merchantId,
      simulations: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Get simulations failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/simulation-accuracy
 * Get simulation accuracy metrics
 */
router.get('/simulation-accuracy', requireRole(['ops_debug', 'sira_ai']), async (req, res) => {
  try {
    const { sira_version, days_back = 30 } = req.query;

    const { rows } = await pool.query(
      `SELECT * FROM analyze_simulation_accuracy($1, $2)`,
      [sira_version || null, parseInt(days_back)]
    );

    // Get accuracy by route
    const { rows: routeAccuracy } = await pool.query(
      `SELECT * FROM v_prediction_accuracy_by_route
       ORDER BY total_predictions DESC
       LIMIT 20`
    );

    res.json({
      overall_accuracy: rows,
      accuracy_by_route: routeAccuracy
    });
  } catch (error) {
    console.error('❌ Get simulation accuracy failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/simulations/:simulationId/details
 * Get detailed simulation results
 */
router.get('/simulations/:simulationId/details', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { simulationId } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM routing_simulations WHERE simulation_id = $1`,
      [simulationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'simulation_not_found' });
    }

    const simulation = rows[0];

    res.json({
      simulation_id: simulation.simulation_id,
      merchant_id: simulation.merchant_id,
      method: simulation.method,
      amount: simulation.amount,
      currency: simulation.currency,
      simulated_routes: simulation.simulated_routes,
      chosen_route: simulation.chosen_route,
      actual_outcome: simulation.actual_outcome,
      was_prediction_correct: simulation.was_prediction_correct,
      sira_version: simulation.sira_version,
      created_at: simulation.created_at,
      executed_at: simulation.executed_at,
      preview_duration_sec: simulation.executed_at
        ? (new Date(simulation.executed_at) - new Date(simulation.created_at)) / 1000
        : null
    });
  } catch (error) {
    console.error('❌ Get simulation details failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * ============================================================================
 * Sous-Brique 116quater: AI Adaptive Routing Over Time (Sira)
 * ============================================================================
 */

/**
 * POST /api/routing/performance/update
 * Update daily performance metrics for a route
 */
router.post('/performance/update', requireRole(['plugin_client', 'sira_ai']), async (req, res) => {
  try {
    const {
      route,
      merchant_id,
      method,
      currency,
      success,
      latency_ms,
      fee_percent,
      amount
    } = req.body;

    // Validation
    if (!route || !merchant_id || !method || !currency || success === undefined || !latency_ms || !amount) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['route', 'merchant_id', 'method', 'currency', 'success', 'latency_ms', 'amount']
      });
    }

    // Update daily performance
    await pool.query(
      `SELECT update_daily_performance($1, $2, $3, $4, $5, $6, $7, $8)`,
      [route, merchant_id, method, currency, success, latency_ms, fee_percent || 0.03, amount]
    );

    res.json({
      ok: true,
      message: 'Daily performance updated successfully'
    });
  } catch (error) {
    console.error('❌ Update daily performance failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/adaptive-recommendation/:merchantId
 * Get adaptive routing recommendation based on historical performance
 */
router.get('/adaptive-recommendation/:merchantId', requireRole(['plugin_client', 'merchant_api', 'ops_debug']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { method, currency, days_back = 30 } = req.query;

    if (!method || !currency) {
      return res.status(400).json({
        error: 'missing_required_params',
        required: ['method', 'currency']
      });
    }

    const { rows } = await pool.query(
      `SELECT * FROM get_adaptive_route_recommendation($1, $2, $3, $4)`,
      [merchantId, method, currency, parseInt(days_back)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'no_data_available',
        message: 'Insufficient historical data for adaptive routing'
      });
    }

    const recommendation = rows[0];

    console.log(`🧠 Adaptive recommendation for ${merchantId}: ${recommendation.best_route} (score: ${recommendation.adaptive_score})`);

    res.json({
      merchant_id: merchantId,
      method: method,
      currency: currency,
      recommended_route: recommendation.best_route,
      adaptive_score: parseFloat(recommendation.adaptive_score),
      success_rate_pct: parseFloat(recommendation.success_rate_pct),
      avg_latency_ms: parseFloat(recommendation.avg_latency),
      trend: recommendation.trend,
      alternatives: recommendation.alternatives,
      days_analyzed: parseInt(days_back)
    });
  } catch (error) {
    console.error('❌ Get adaptive recommendation failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/performance/:merchantId
 * Get performance history for a merchant
 */
router.get('/performance/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { days = 30, route, method } = req.query;

    let query = `
      SELECT * FROM routing_performance_history
      WHERE merchant_id = $1
        AND period >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    `;

    const params = [merchantId];
    let paramIndex = 2;

    if (route) {
      query += ` AND route = $${paramIndex++}`;
      params.push(route);
    }

    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method);
    }

    query += ` ORDER BY period DESC, route`;

    const { rows } = await pool.query(query, params);

    res.json({
      merchant_id: merchantId,
      performance_history: rows,
      days_analyzed: parseInt(days),
      total_records: rows.length
    });
  } catch (error) {
    console.error('❌ Get performance history failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/heatmap/:merchantId
 * Get routing performance heatmap (7 days)
 */
router.get('/heatmap/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM v_routing_heatmap_7d WHERE merchant_id = $1 ORDER BY period DESC, route`,
      [merchantId]
    );

    // Group by route for easier visualization
    const heatmapData = {};
    rows.forEach(row => {
      if (!heatmapData[row.route]) {
        heatmapData[row.route] = [];
      }
      heatmapData[row.route].push({
        date: row.period,
        success_rate: parseFloat(row.success_rate_pct),
        latency: parseFloat(row.avg_latency_ms),
        total_txn: row.total_txn,
        anomaly_score: parseFloat(row.anomaly_score),
        health_status: row.health_status
      });
    });

    res.json({
      merchant_id: merchantId,
      heatmap: heatmapData,
      period: 'last_7_days'
    });
  } catch (error) {
    console.error('❌ Get heatmap failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/trends/:merchantId
 * Get routing trends and analysis
 */
router.get('/trends/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { method, currency } = req.query;

    if (!method || !currency) {
      return res.status(400).json({
        error: 'missing_required_params',
        required: ['method', 'currency']
      });
    }

    // Get all unique routes
    const { rows: routes } = await pool.query(
      `SELECT DISTINCT route FROM routing_performance_history
       WHERE merchant_id = $1 AND method = $2 AND currency = $3
         AND period >= CURRENT_DATE - INTERVAL '30 days'`,
      [merchantId, method, currency]
    );

    // Calculate adaptive score for each route
    const trends = [];
    for (const routeRow of routes) {
      const { rows: scoreRows } = await pool.query(
        `SELECT * FROM calculate_adaptive_score($1, $2, $3, $4, 30)`,
        [merchantId, method, currency, routeRow.route]
      );

      if (scoreRows.length > 0) {
        trends.push({
          route: scoreRows[0].route,
          adaptive_score: parseFloat(scoreRows[0].adaptive_score),
          success_rate_pct: parseFloat(scoreRows[0].success_rate_pct),
          avg_latency_ms: parseFloat(scoreRows[0].avg_latency),
          avg_fee_pct: parseFloat(scoreRows[0].avg_fee) * 100,
          trend: scoreRows[0].trend,
          seasonal_boost: parseFloat(scoreRows[0].seasonal_boost)
        });
      }
    }

    // Sort by adaptive score
    trends.sort((a, b) => b.adaptive_score - a.adaptive_score);

    res.json({
      merchant_id: merchantId,
      method: method,
      currency: currency,
      trends: trends,
      best_route: trends[0]?.route || null,
      analyzed_period_days: 30
    });
  } catch (error) {
    console.error('❌ Get trends failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/routing/detect-anomalies
 * Manually trigger anomaly detection
 */
router.post('/detect-anomalies', requireRole(['ops_debug', 'sira_ai']), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT detect_daily_anomalies() as anomaly_count');
    const anomalyCount = rows[0].anomaly_count;

    console.log(`🔍 Anomaly detection completed: ${anomalyCount} anomalies detected`);

    res.json({
      ok: true,
      anomalies_detected: anomalyCount,
      message: 'Anomaly detection completed successfully'
    });
  } catch (error) {
    console.error('❌ Anomaly detection failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/routing/performance-30d/:merchantId
 * Get aggregated 30-day performance
 */
router.get('/performance-30d/:merchantId', requireRole(['ops_debug', 'merchant_view']), async (req, res) => {
  try {
    const { merchantId } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM v_routing_performance_30d WHERE merchant_id = $1 ORDER BY avg_success_rate_pct DESC`,
      [merchantId]
    );

    res.json({
      merchant_id: merchantId,
      performance_summary: rows,
      period: 'last_30_days'
    });
  } catch (error) {
    console.error('❌ Get 30d performance failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/routing/seasonal-pattern
 * Add a seasonal pattern
 */
router.post('/seasonal-pattern', requireRole(['ops_debug', 'pay_admin']), async (req, res) => {
  try {
    const {
      route,
      merchant_id,
      pattern_type,
      pattern_name,
      start_period,
      end_period,
      impact_factor,
      confidence
    } = req.body;

    if (!route || !pattern_type || !start_period || !end_period || !impact_factor || !confidence) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['route', 'pattern_type', 'start_period', 'end_period', 'impact_factor', 'confidence']
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO routing_seasonal_patterns (
        route, merchant_id, pattern_type, pattern_name,
        start_period, end_period, impact_factor, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [route, merchant_id || null, pattern_type, pattern_name, start_period, end_period, impact_factor, confidence]
    );

    console.log(`📅 Seasonal pattern added: ${pattern_name} for ${route} (${start_period} to ${end_period})`);

    res.json({
      ok: true,
      pattern: rows[0]
    });
  } catch (error) {
    console.error('❌ Add seasonal pattern failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

module.exports = { router, setPool };
