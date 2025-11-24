"""
Vrai pipeline ML pour production - avec gestion d'erreurs complète
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score, precision_score, recall_score
import joblib
import logging
from datetime import datetime
import psycopg2
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class FraudModelTrainer:
    """Entraînement de modèle fraud en production"""
    
    def __init__(self, db_connection_string: str):
        self.db_conn = db_connection_string
        self.model = None
        self.feature_columns = [
            'tx_count_7d', 'tx_vol_7d', 'p2p_count_7d', 
            'cashout_count_7d', 'dispute_count_30d', 'sira_score'
        ]
    
    def fetch_training_data(self, days: int = 90) -> pd.DataFrame:
        """Charger les données d'entraînement depuis PostgreSQL"""
        try:
            conn = psycopg2.connect(self.db_conn)
            query = """
            SELECT 
                f.tx_count_7d, f.tx_vol_7d, f.p2p_count_7d, 
                f.cashout_count_7d, f.dispute_count_30d, f.sira_score,
                CASE WHEN fe.score > 0.8 THEN 1 ELSE 0 END as is_fraud
            FROM features_user_daily f
            LEFT JOIN fraud_events fe ON f.user_id = fe.entity_id
            WHERE f.day >= CURRENT_DATE - INTERVAL '%s days'
            AND fe.event_type = 'score'
            """
            df = pd.read_sql_query(query, conn, params=(days,))
            conn.close()
            logger.info(f"Loaded {len(df)} records for training")
            return df
        except Exception as e:
            logger.error(f"Error fetching training data: {e}")
            raise
    
    def build_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Feature engineering pour la détection de fraud"""
        # Features de ratio
        df['cashout_ratio'] = df['cashout_count_7d'] / (df['tx_count_7d'] + 1)
        df['dispute_ratio'] = df['dispute_count_30d'] / (df['tx_count_7d'] + 1)
        
        # Features d'alerte
        df['high_volume_alert'] = (df['tx_vol_7d'] > df['tx_vol_7d'].quantile(0.95)).astype(int)
        df['frequent_cashout_alert'] = (df['cashout_count_7d'] > 10).astype(int)
        
        return df
    
    def train_model(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Entraîner le modèle de fraud detection"""
        try:
            # Préparer les features
            feature_cols = self.feature_columns + ['cashout_ratio', 'dispute_ratio', 
                                                 'high_volume_alert', 'frequent_cashout_alert']
            X = df[feature_cols].fillna(0)
            y = df['is_fraud'].fillna(0)
            
            # Validation temporelle
            tscv = TimeSeriesSplit(n_splits=5)
            scores = []
            
            for train_idx, test_idx in tscv.split(X):
                X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
                y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
                
                model = RandomForestClassifier(
                    n_estimators=100,
                    max_depth=10,
                    random_state=42,
                    class_weight='balanced'
                )
                model.fit(X_train, y_train)
                
                y_pred = model.predict_proba(X_test)[:, 1]
                auc = roc_auc_score(y_test, y_pred)
                scores.append(auc)
            
            # Entraînement final sur toutes les données
            self.model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )
            self.model.fit(X, y)
            
            # Sauvegarder le modèle
            model_path = f"/models/fraud_model_{datetime.now().strftime('%Y%m%d_%H%M')}.joblib"
            joblib.dump(self.model, model_path)
            
            return {
                "status": "success",
                "model_path": model_path,
                "mean_auc": np.mean(scores),
                "feature_importance": dict(zip(feature_cols, self.model.feature_importances_))
            }
            
        except Exception as e:
            logger.error(f"Error training model: {e}")
            return {"status": "error", "error": str(e)}
    
    def evaluate_model(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Évaluation complète du modèle"""
        try:
            feature_cols = self.feature_columns + ['cashout_ratio', 'dispute_ratio', 
                                                 'high_volume_alert', 'frequent_cashout_alert']
            X = df[feature_cols].fillna(0)
            y = df['is_fraud'].fillna(0)
            
            y_pred_proba = self.model.predict_proba(X)[:, 1]
            y_pred = (y_pred_proba > 0.5).astype(int)
            
            metrics = {
                "auc": roc_auc_score(y, y_pred_proba),
                "precision": precision_score(y, y_pred, zero_division=0),
                "recall": recall_score(y, y_pred, zero_division=0),
                "n_samples": len(df),
                "fraud_rate": y.mean()
            }
            
            logger.info(f"Model evaluation: {metrics}")
            return {"status": "success", "metrics": metrics}
            
        except Exception as e:
            logger.error(f"Error evaluating model: {e}")
            return {"status": "error", "error": str(e)}

def build_features():
    """Wrapper pour l'orchestration"""
    trainer = FraudModelTrainer(os.getenv('DATABASE_URL'))
    df = trainer.fetch_training_data(90)
    df_processed = trainer.build_features(df)
    df_processed.to_parquet("/tmp/features_processed.parquet")
    return {"status": "success", "n_samples": len(df_processed)}

def train_model():
    """Wrapper pour l'entraînement"""
    trainer = FraudModelTrainer(os.getenv('DATABASE_URL'))
    df = pd.read_parquet("/tmp/features_processed.parquet")
    result = trainer.train_model(df)
    return result

def evaluate_model():
    """Wrapper pour l'évaluation"""
    trainer = FraudModelTrainer(os.getenv('DATABASE_URL'))
    df = pd.read_parquet("/tmp/features_processed.parquet")
    result = trainer.evaluate_model(df)
    return result