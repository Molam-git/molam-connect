"""
Brique 116septies: AI Anomaly-Based Failover - Sira Detector
Détection d'anomalies et déclenchement de failover automatique
"""

import logging
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SiraAnomalyDetector:
    """Détecteur d'anomalies pour les connecteurs de paiement"""

    def __init__(self, db_connection_string: str):
        self.db_url = db_connection_string
        self.conn = None
        self.thresholds = {
            'critical_failure': 0.80,   # < 80% success
            'high_failure': 0.90,       # < 90% success
            'critical_latency': 2000,   # > 2s
            'high_latency': 1000,       # > 1s
        }

    def _get_connection(self):
        """Obtenir connexion DB"""
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.db_url)
        return self.conn

    def run_detection_cycle(self):
        """Exécuter un cycle de détection d'anomalies"""
        logger.info("🔍 Starting anomaly detection cycle")

        # 1. Récupérer l'état des connecteurs
        connectors = self._get_connectors_health()

        # 2. Détecter anomalies
        anomalies = []
        for connector in connectors:
            anomaly = self._detect_anomaly(connector)
            if anomaly:
                anomalies.append(anomaly)

        logger.info(f"📊 Detected {len(anomalies)} anomalies")

        # 3. Enregistrer anomalies et recommander failover
        for anomaly in anomalies:
            self._create_anomaly_event(anomaly)

        return anomalies

    def _get_connectors_health(self) -> List[Dict]:
        """Récupérer l'état de santé des connecteurs"""
        conn = self._get_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM connector_health
                WHERE updated_at > now() - INTERVAL '10 minutes'
                ORDER BY updated_at DESC
            """)
            return cur.fetchall()

    def _detect_anomaly(self, connector: Dict) -> Optional[Dict]:
        """
        Détecter si un connecteur présente une anomalie

        Heuristiques simples:
        - Taux de succès < seuil
        - Latence > seuil
        - Status = 'down' ou 'degraded'
        """
        success_rate = float(connector['success_rate'] or 1.0)
        latency = float(connector['avg_latency_ms'] or 0)
        status = connector['status']

        anomaly_type = None
        anomaly_score = 0.0

        # Détection par règles
        if success_rate < self.thresholds['critical_failure']:
            anomaly_type = 'critical_failure_rate'
            anomaly_score = 0.95
        elif success_rate < self.thresholds['high_failure']:
            anomaly_type = 'high_failure_rate'
            anomaly_score = 0.75
        elif latency > self.thresholds['critical_latency']:
            anomaly_type = 'critical_latency'
            anomaly_score = 0.85
        elif latency > self.thresholds['high_latency']:
            anomaly_type = 'high_latency'
            anomaly_score = 0.65
        elif status in ('down', 'degraded'):
            anomaly_type = 'connector_down'
            anomaly_score = 0.90

        if not anomaly_type:
            return None

        # Trouver alternative
        alternative = self._find_alternative(
            connector['connector_name'],
            connector['region'],
            connector['currency']
        )

        if not alternative:
            logger.warning(f"⚠️  No alternative found for {connector['connector_name']}")
            return None

        return {
            'connector_name': connector['connector_name'],
            'region': connector['region'],
            'currency': connector['currency'],
            'anomaly_type': anomaly_type,
            'anomaly_score': anomaly_score,
            'metric': {
                'success_rate': success_rate,
                'latency_ms': latency,
                'status': status,
                'error_count': connector.get('error_count', 0),
            },
            'sira_decision': {
                'recommendation': 'failover',
                'candidate': alternative,
                'confidence': anomaly_score,
                'reason': f"{anomaly_type}: success={success_rate:.2%}, latency={latency:.0f}ms"
            }
        }

    def _find_alternative(
        self,
        connector_name: str,
        region: str,
        currency: str
    ) -> Optional[str]:
        """Trouver un connecteur alternatif en bonne santé"""
        conn = self._get_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT connector_name FROM connector_health
                WHERE region = %s
                  AND currency = %s
                  AND connector_name != %s
                  AND status = 'ok'
                  AND success_rate >= 0.95
                ORDER BY success_rate DESC, avg_latency_ms ASC
                LIMIT 1
            """, (region, currency, connector_name))

            result = cur.fetchone()
            return result['connector_name'] if result else None

    def _create_anomaly_event(self, anomaly: Dict):
        """Créer un événement d'anomalie dans la DB"""
        conn = self._get_connection()

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO anomaly_events (
                        connector_name, region, currency, anomaly_type,
                        metric, anomaly_score, sira_decision
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    anomaly['connector_name'],
                    anomaly['region'],
                    anomaly['currency'],
                    anomaly['anomaly_type'],
                    json.dumps(anomaly['metric']),
                    anomaly['anomaly_score'],
                    json.dumps(anomaly['sira_decision'])
                ))

                anomaly_id = cur.fetchone()[0]
                conn.commit()

                logger.info(
                    f"🚨 Anomaly created: {anomaly['connector_name']} "
                    f"→ {anomaly['sira_decision']['candidate']} "
                    f"(score: {anomaly['anomaly_score']:.2%})"
                )

                # Déclencher évaluation de failover automatique
                self._evaluate_auto_failover(anomaly_id, anomaly)

        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Error creating anomaly: {e}")

    def _evaluate_auto_failover(self, anomaly_id: str, anomaly: Dict):
        """Évaluer si un failover automatique doit être déclenché"""
        conn = self._get_connection()

        try:
            # Récupérer politique
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT config FROM ops_failover_policies
                    WHERE name = 'auto_failover' AND enabled = true
                    LIMIT 1
                """)
                policy_row = cur.fetchone()

            if not policy_row:
                logger.info("⏸️  Auto-failover policy not enabled")
                return

            policy = policy_row['config']
            auto_threshold = policy.get('auto_threshold', 0.8)
            confidence = anomaly['anomaly_score']

            # Vérifier si confiance suffisante
            if confidence < auto_threshold:
                logger.info(
                    f"📋 Confidence too low ({confidence:.2%} < {auto_threshold:.2%}), "
                    "escalating to Ops"
                )
                return

            # Vérifier cooldown
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT can_failover(%s, %s)",
                    (anomaly['connector_name'], policy.get('cooldown_minutes', 15))
                )
                can_failover = cur.fetchone()[0]

            if not can_failover:
                logger.info(f"⏱️  Cooldown active for {anomaly['connector_name']}, skipping")
                return

            # Créer action de failover
            self._create_failover_action(anomaly)

        except Exception as e:
            logger.error(f"❌ Error evaluating auto-failover: {e}")

    def _create_failover_action(self, anomaly: Dict):
        """Créer une action de failover automatique"""
        conn = self._get_connection()

        action_ref = f"sira-auto-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{anomaly['connector_name']}"

        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO failover_actions (
                        action_ref, connector_from, connector_to, region, currency,
                        requested_by, rationale, sira_score, status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (action_ref) DO NOTHING
                    RETURNING id
                """, (
                    action_ref,
                    anomaly['connector_name'],
                    anomaly['sira_decision']['candidate'],
                    anomaly['region'],
                    anomaly['currency'],
                    'sira_auto',
                    json.dumps(anomaly['sira_decision']),
                    anomaly['anomaly_score'],
                    'pending'
                ))

                result = cur.fetchone()
                conn.commit()

                if result:
                    logger.info(
                        f"✅ Failover action created: {action_ref} "
                        f"({anomaly['connector_name']} → {anomaly['sira_decision']['candidate']})"
                    )
                else:
                    logger.info(f"ℹ️  Failover action already exists: {action_ref}")

        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Error creating failover action: {e}")

    def close(self):
        """Fermer connexion"""
        if self.conn and not self.conn.closed:
            self.conn.close()


def run_daemon(db_url: str, interval_seconds: int = 60):
    """Exécuter le détecteur en mode daemon"""
    detector = SiraAnomalyDetector(db_url)

    logger.info(f"🚀 Sira Anomaly Detector started (interval: {interval_seconds}s)")

    try:
        while True:
            try:
                detector.run_detection_cycle()
            except Exception as e:
                logger.error(f"❌ Detection cycle error: {e}")

            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        logger.info("⏹️  Stopping detector...")
    finally:
        detector.close()


if __name__ == "__main__":
    import os

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/molam_connect"
    )

    # Mode daemon: exécute toutes les 60 secondes
    run_daemon(db_url, interval_seconds=60)
