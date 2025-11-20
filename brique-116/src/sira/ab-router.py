"""
Brique 116quinquies: Dynamic A/B Routing - Sira Engine
Intelligent A/B testing router for payment routes optimization
"""

import random
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


@dataclass
class RouteScore:
    """Score d'une route de paiement"""
    route_type: str
    total_txn: int
    success_rate: float
    avg_latency: float
    avg_fee: float
    score: float


@dataclass
class ABTestConfig:
    """Configuration d'un test A/B"""
    id: str
    merchant_id: str
    currency: str
    primary_route: str
    test_route: str
    allocation_percent: int
    status: str


class ABRouter:
    """Moteur de routage A/B intelligent"""

    def __init__(self, db_connection_string: str):
        self.db_url = db_connection_string
        self.conn = None

    def _get_connection(self):
        """Obtenir une connexion à la base de données"""
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.db_url)
        return self.conn

    def get_active_test(self, merchant_id: str, currency: str) -> Optional[ABTestConfig]:
        """
        Récupérer un test A/B actif pour un merchant et une devise

        Args:
            merchant_id: ID du marchand
            currency: Code devise (XOF, EUR, etc.)

        Returns:
            Configuration du test ou None
        """
        conn = self._get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, merchant_id, currency, primary_route, test_route,
                       allocation_percent, status
                FROM routing_ab_tests
                WHERE merchant_id = %s
                  AND currency = %s
                  AND status = 'active'
                  AND (end_date IS NULL OR end_date > now())
                ORDER BY start_date DESC
                LIMIT 1
            """, (merchant_id, currency))

            row = cur.fetchone()
            if row:
                return ABTestConfig(**row)
            return None

    def pick_route(
        self,
        merchant_id: str,
        currency: str,
        default_route: str = None
    ) -> Tuple[str, Optional[str], Optional[str]]:
        """
        Choisir une route pour une transaction (primary ou test)

        Args:
            merchant_id: ID du marchand
            currency: Code devise
            default_route: Route par défaut si pas de test actif

        Returns:
            Tuple (route_name, route_type, ab_test_id)
            - route_name: Le nom de la route à utiliser
            - route_type: 'primary', 'test', ou None
            - ab_test_id: ID du test A/B ou None
        """
        test = self.get_active_test(merchant_id, currency)

        if not test:
            # Pas de test actif, utiliser la route par défaut
            return (default_route or "default", None, None)

        # Décider si on utilise la route de test
        if random.random() < test.allocation_percent / 100.0:
            logger.info(f"A/B Test {test.id}: Using test route {test.test_route}")
            return (test.test_route, "test", test.id)
        else:
            logger.info(f"A/B Test {test.id}: Using primary route {test.primary_route}")
            return (test.primary_route, "primary", test.id)

    def record_result(
        self,
        ab_test_id: str,
        txn_id: str,
        route_used: str,
        route_name: str,
        success: bool,
        latency_ms: float,
        fee_percent: float,
        error_code: str = None,
        error_message: str = None
    ):
        """
        Enregistrer le résultat d'une transaction dans le test A/B

        Args:
            ab_test_id: ID du test A/B
            txn_id: ID de la transaction
            route_used: Type de route ('primary' ou 'test')
            route_name: Nom de la route utilisée
            success: Succès de la transaction
            latency_ms: Latence en millisecondes
            fee_percent: Frais en pourcentage
            error_code: Code d'erreur si échec
            error_message: Message d'erreur si échec
        """
        conn = self._get_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO routing_ab_results (
                    ab_test_id, txn_id, route_used, route_name,
                    success, latency_ms, fee_percent,
                    error_code, error_message
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                ab_test_id, txn_id, route_used, route_name,
                success, latency_ms, fee_percent,
                error_code, error_message
            ))
            conn.commit()
            logger.info(f"Recorded A/B result for test {ab_test_id}, txn {txn_id}")

    def evaluate(self, ab_test_id: str) -> Dict[str, RouteScore]:
        """
        Évaluer les performances d'un test A/B

        Args:
            ab_test_id: ID du test à évaluer

        Returns:
            Dict avec les scores 'primary' et 'test'
        """
        conn = self._get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM get_ab_test_stats(%s)", (ab_test_id,))
            results = cur.fetchall()

            scores = {}
            for row in results:
                scores[row['route_type']] = RouteScore(
                    route_type=row['route_type'],
                    total_txn=row['total_txn'],
                    success_rate=float(row['success_rate'] or 0),
                    avg_latency=float(row['avg_latency'] or 0),
                    avg_fee=float(row['avg_fee'] or 0),
                    score=float(row['score'] or 0)
                )

            return scores

    def _calculate_score(self, results: List[Dict]) -> float:
        """
        Calculer le score d'une route

        Score = Success Rate - (Fee Impact) - (Latency Impact)
        """
        if not results:
            return 0.0

        success_rate = sum(1 for r in results if r['success']) / len(results)
        avg_latency = sum(r['latency_ms'] for r in results) / len(results)
        avg_fee = sum(r['fee_percent'] for r in results) / len(results)

        # Formule de scoring
        score = success_rate - (avg_fee * 0.01) - (avg_latency * 0.0005)
        return score

    def make_decision(
        self,
        ab_test_id: str,
        min_transactions: int = 100,
        auto_apply: bool = False
    ) -> Optional[Dict]:
        """
        Prendre une décision basée sur les résultats du test A/B

        Args:
            ab_test_id: ID du test
            min_transactions: Nombre minimum de transactions pour décider
            auto_apply: Appliquer automatiquement la décision

        Returns:
            Dict avec la décision ou None si pas assez de données
        """
        scores = self.evaluate(ab_test_id)

        if not scores:
            logger.warning(f"No results found for test {ab_test_id}")
            return None

        primary = scores.get('primary')
        test = scores.get('test')

        if not primary or not test:
            logger.warning(f"Missing route data for test {ab_test_id}")
            return None

        total_txn = primary.total_txn + test.total_txn
        if total_txn < min_transactions:
            logger.info(f"Not enough transactions ({total_txn}/{min_transactions})")
            return None

        # Déterminer le gagnant
        if test.score > primary.score:
            winning_route = "test"
            decision_reason = (
                f"Test route has better score ({test.score:.4f} vs {primary.score:.4f}). "
                f"Success: {test.success_rate:.2%} vs {primary.success_rate:.2%}, "
                f"Latency: {test.avg_latency:.0f}ms vs {primary.avg_latency:.0f}ms, "
                f"Fee: {test.avg_fee:.2%} vs {primary.avg_fee:.2%}"
            )
        else:
            winning_route = "primary"
            decision_reason = (
                f"Primary route remains best ({primary.score:.4f} vs {test.score:.4f}). "
                f"Success: {primary.success_rate:.2%} vs {test.success_rate:.2%}, "
                f"Latency: {primary.avg_latency:.0f}ms vs {test.avg_latency:.0f}ms, "
                f"Fee: {primary.avg_fee:.2%} vs {test.avg_fee:.2%}"
            )

        decision = {
            'ab_test_id': ab_test_id,
            'winning_route': winning_route,
            'primary_score': primary.score,
            'test_score': test.score,
            'decision_reason': decision_reason,
            'transactions_analyzed': total_txn,
            'auto_applied': auto_apply
        }

        # Sauvegarder la décision
        self._save_decision(decision)

        logger.info(f"Decision made for test {ab_test_id}: {winning_route} wins")
        return decision

    def _save_decision(self, decision: Dict):
        """Sauvegarder une décision dans la base"""
        conn = self._get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Récupérer les infos du test
            cur.execute("""
                SELECT merchant_id, currency, test_route, primary_route
                FROM routing_ab_tests WHERE id = %s
            """, (decision['ab_test_id'],))
            test = cur.fetchone()

            if not test:
                logger.error(f"Test {decision['ab_test_id']} not found")
                return

            # Déterminer la route gagnante
            winning_route_name = (
                test['test_route'] if decision['winning_route'] == 'test'
                else test['primary_route']
            )

            cur.execute("""
                INSERT INTO routing_ab_decisions (
                    ab_test_id, merchant_id, currency, winning_route,
                    primary_score, test_score, decision_reason,
                    transactions_analyzed, auto_applied
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                decision['ab_test_id'],
                test['merchant_id'],
                test['currency'],
                winning_route_name,
                decision['primary_score'],
                decision['test_score'],
                decision['decision_reason'],
                decision['transactions_analyzed'],
                decision['auto_applied']
            ))

            conn.commit()
            decision_id = cur.fetchone()['id']
            logger.info(f"Decision saved with ID {decision_id}")

    def get_performance_view(self, merchant_id: str = None) -> List[Dict]:
        """
        Obtenir la vue des performances de tous les tests

        Args:
            merchant_id: Filtrer par merchant (optionnel)

        Returns:
            Liste des performances par test
        """
        conn = self._get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if merchant_id:
                cur.execute("""
                    SELECT * FROM routing_ab_performance
                    WHERE merchant_id = %s
                    ORDER BY start_date DESC
                """, (merchant_id,))
            else:
                cur.execute("SELECT * FROM routing_ab_performance ORDER BY start_date DESC")

            return cur.fetchall()

    def close(self):
        """Fermer la connexion à la base"""
        if self.conn and not self.conn.closed:
            self.conn.close()


# Exemple d'utilisation
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Connexion à la base
    router = ABRouter("postgresql://postgres:password@localhost:5432/molam_connect")

    # Tester le routage
    route, route_type, test_id = router.pick_route(
        merchant_id="11111111-1111-1111-1111-111111111111",
        currency="XOF"
    )
    print(f"Selected route: {route} (type: {route_type}, test: {test_id})")

    # Évaluer un test
    if test_id:
        scores = router.evaluate(test_id)
        for route_type, score in scores.items():
            print(f"{route_type}: score={score.score:.4f}, success={score.success_rate:.2%}")

        # Prendre une décision
        decision = router.make_decision(test_id, min_transactions=10)
        if decision:
            print(f"Decision: {decision['winning_route']} wins!")
            print(f"Reason: {decision['decision_reason']}")

    router.close()
