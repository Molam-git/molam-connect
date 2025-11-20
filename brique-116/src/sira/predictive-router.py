"""
Brique 116sexies: Predictive Routing - Sira Forecasting Engine
ML-based route prediction for optimal payment routing
"""

import logging
from typing import Dict, List, Optional
from datetime import date, datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import statistics

logger = logging.getLogger(__name__)


class PredictiveRouter:
    """Moteur de prévision de routage basé sur l'historique"""

    def __init__(self, db_connection_string: str):
        self.db_url = db_connection_string
        self.conn = None

    def _get_connection(self):
        """Obtenir connexion DB"""
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.db_url)
        return self.conn

    def generate_forecasts(
        self,
        merchant_id: str,
        currency: str,
        routes: List[str],
        lookback_days: int = 30
    ) -> List[Dict]:
        """
        Générer des prévisions pour toutes les routes

        Args:
            merchant_id: ID du marchand
            currency: Devise
            routes: Liste des routes à évaluer
            lookback_days: Jours d'historique à analyser

        Returns:
            Liste de prévisions
        """
        forecasts = []
        forecast_date = date.today()

        for route in routes:
            forecast = self._predict_route_performance(
                merchant_id, currency, route, lookback_days, forecast_date
            )
            if forecast:
                forecasts.append(forecast)

        # Sauvegarder dans la DB
        self._save_forecasts(forecasts)

        logger.info(f"Generated {len(forecasts)} forecasts for {merchant_id}/{currency}")
        return forecasts

    def _predict_route_performance(
        self,
        merchant_id: str,
        currency: str,
        route: str,
        lookback_days: int,
        forecast_date: date
    ) -> Optional[Dict]:
        """
        Prédire la performance d'une route basée sur l'historique

        Méthode simple : moyenne pondérée des résultats récents
        """
        conn = self._get_connection()
        cutoff_date = datetime.now() - timedelta(days=lookback_days)

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Récupérer historique de la route
            cur.execute("""
                SELECT
                    r.success,
                    r.latency_ms,
                    r.fee_percent,
                    r.created_at
                FROM routing_ab_results r
                JOIN routing_ab_tests t ON r.ab_test_id = t.id
                WHERE t.merchant_id = %s
                  AND t.currency = %s
                  AND r.route_name = %s
                  AND r.created_at > %s
                ORDER BY r.created_at DESC
                LIMIT 1000
            """, (merchant_id, currency, route, cutoff_date))

            results = cur.fetchall()

        if not results:
            logger.warning(f"No historical data for route {route}")
            return None

        # Calcul des métriques prédites (moyenne pondérée)
        total_weight = 0
        weighted_success = 0
        weighted_latency = 0
        weighted_fee = 0

        for i, result in enumerate(results):
            # Poids décroissant pour les résultats plus anciens
            weight = 1.0 / (i + 1)
            total_weight += weight

            weighted_success += (1 if result['success'] else 0) * weight
            weighted_latency += float(result['latency_ms'] or 0) * weight
            weighted_fee += float(result['fee_percent'] or 0) * weight

        predicted_success_rate = weighted_success / total_weight
        predicted_latency_ms = weighted_latency / total_weight
        predicted_fee_percent = weighted_fee / total_weight

        # Calcul de la confiance basée sur le volume de données
        data_volume_factor = min(1.0, len(results) / 100.0)  # Max confiance à 100 txn
        variance_penalty = self._calculate_variance_penalty(results)
        sira_confidence = data_volume_factor * (1 - variance_penalty)

        return {
            'merchant_id': merchant_id,
            'currency': currency,
            'route': route,
            'forecast_date': forecast_date,
            'predicted_success_rate': round(predicted_success_rate, 4),
            'predicted_latency_ms': round(predicted_latency_ms, 2),
            'predicted_fee_percent': round(predicted_fee_percent, 4),
            'sira_confidence': round(sira_confidence, 4),
            'model_version': 'v1-weighted-avg'
        }

    def _calculate_variance_penalty(self, results: List[Dict]) -> float:
        """Calculer pénalité de variance (haute variance = moins de confiance)"""
        if len(results) < 2:
            return 0.5

        success_rates = [1 if r['success'] else 0 for r in results]
        latencies = [float(r['latency_ms'] or 0) for r in results]

        try:
            success_variance = statistics.variance(success_rates) if len(success_rates) > 1 else 0
            latency_variance = statistics.variance(latencies) if len(latencies) > 1 else 0

            # Normaliser les variances (0-1)
            normalized_variance = min(1.0, (success_variance + latency_variance / 10000) / 2)
            return normalized_variance * 0.3  # Max 30% penalty
        except:
            return 0.2

    def _save_forecasts(self, forecasts: List[Dict]):
        """Sauvegarder les prévisions dans la DB"""
        conn = self._get_connection()

        with conn.cursor() as cur:
            for forecast in forecasts:
                cur.execute("""
                    INSERT INTO routing_forecasts (
                        merchant_id, currency, route, forecast_date,
                        predicted_success_rate, predicted_latency_ms,
                        predicted_fee_percent, sira_confidence, model_version
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (merchant_id, currency, route, forecast_date)
                    DO UPDATE SET
                        predicted_success_rate = EXCLUDED.predicted_success_rate,
                        predicted_latency_ms = EXCLUDED.predicted_latency_ms,
                        predicted_fee_percent = EXCLUDED.predicted_fee_percent,
                        sira_confidence = EXCLUDED.sira_confidence,
                        model_version = EXCLUDED.model_version,
                        created_at = now()
                """, (
                    forecast['merchant_id'],
                    forecast['currency'],
                    forecast['route'],
                    forecast['forecast_date'],
                    forecast['predicted_success_rate'],
                    forecast['predicted_latency_ms'],
                    forecast['predicted_fee_percent'],
                    forecast['sira_confidence'],
                    forecast['model_version']
                ))

            conn.commit()

    def get_best_route(self, merchant_id: str, currency: str) -> Optional[Dict]:
        """Obtenir la meilleure route prédite pour aujourd'hui"""
        conn = self._get_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM get_best_predicted_route(%s, %s, CURRENT_DATE)
            """, (merchant_id, currency))

            result = cur.fetchone()
            return dict(result) if result else None

    def get_all_forecasts(
        self,
        merchant_id: str,
        currency: str,
        forecast_date: date = None
    ) -> List[Dict]:
        """Obtenir toutes les prévisions pour un merchant/currency"""
        conn = self._get_connection()
        if forecast_date is None:
            forecast_date = date.today()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM routing_forecasts
                WHERE merchant_id = %s
                  AND currency = %s
                  AND forecast_date = %s
                ORDER BY sira_confidence DESC
            """, (merchant_id, currency, forecast_date))

            return cur.fetchall()

    def cleanup_old_forecasts(self):
        """Nettoyer les vieilles prévisions"""
        conn = self._get_connection()

        with conn.cursor() as cur:
            cur.execute("SELECT cleanup_old_forecasts()")
            conn.commit()

        logger.info("Cleaned up old forecasts")

    def close(self):
        """Fermer connexion"""
        if self.conn and not self.conn.closed:
            self.conn.close()


# Exemple d'utilisation
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    router = PredictiveRouter("postgresql://postgres:password@localhost:5432/molam_connect")

    # Générer prévisions pour toutes les routes
    forecasts = router.generate_forecasts(
        merchant_id="11111111-1111-1111-1111-111111111111",
        currency="XOF",
        routes=["bank_bci", "bank_coris", "mobile_money"],
        lookback_days=30
    )

    print(f"\n📊 Generated {len(forecasts)} forecasts:")
    for f in forecasts:
        print(f"  {f['route']}: success={f['predicted_success_rate']:.2%}, "
              f"latency={f['predicted_latency_ms']:.0f}ms, "
              f"confidence={f['sira_confidence']:.2%}")

    # Obtenir la meilleure route
    best = router.get_best_route(
        merchant_id="11111111-1111-1111-1111-111111111111",
        currency="XOF"
    )

    if best:
        print(f"\n🏆 Best route: {best['route']} (confidence: {best['sira_confidence']:.2%})")

    router.close()
