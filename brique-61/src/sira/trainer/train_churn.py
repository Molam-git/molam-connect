#!/usr/bin/env python3
"""
SIRA Churn Prediction Model Trainer
Industrial ML pipeline with XGBoost, feature engineering, model registry, and S3 storage
"""

import os
import json
import boto3
import pandas as pd
from sqlalchemy import create_engine
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score
import joblib
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
DB = os.getenv("DATABASE_URL")
S3_BUCKET = os.getenv("MODEL_S3_BUCKET", "molam-ml-models")
MODEL_NAME = "sira_churn_v1"
SIRA_ACTOR = os.getenv("SIRA_ACTOR", "system")

# Initialize connections
engine = create_engine(DB)
s3 = boto3.client('s3')

def load_features(since_days=180):
    """
    Load training dataset from feature store
    Returns DataFrame with features and labels
    """
    print(f"[Trainer] Loading features from last {since_days} days...")

    query = f"""
    SELECT user_id, merchant_id, snapshot_date, features, label
    FROM subscription_features
    WHERE snapshot_date >= now()::date - interval '{since_days} days'
      AND label IS NOT NULL
    ORDER BY snapshot_date DESC
    """

    df = pd.read_sql(query, engine)

    if df.empty:
        print("[Trainer] No labeled data found!")
        return df

    print(f"[Trainer] Loaded {len(df)} rows")

    # Flatten JSONB features into columns
    features_df = pd.json_normalize(df['features'])
    df_combined = pd.concat([
        df[['user_id', 'merchant_id', 'snapshot_date', 'label']].reset_index(drop=True),
        features_df.reset_index(drop=True)
    ], axis=1)

    print(f"[Trainer] Feature columns: {list(features_df.columns)}")

    return df_combined

def prepare_training_data(df):
    """
    Prepare X and y for training
    """
    # Exclude metadata columns
    feature_cols = [c for c in df.columns if c not in ('user_id', 'merchant_id', 'snapshot_date', 'label')]

    X = df[feature_cols]
    y = (df['label'] == 'churned').astype(int)

    print(f"[Trainer] Features: {len(feature_cols)}, Samples: {len(X)}")
    print(f"[Trainer] Churn rate: {y.mean():.2%}")

    return X, y, feature_cols

def train_model(X_train, y_train, X_test, y_test):
    """
    Train XGBoost model with early stopping
    """
    print("[Trainer] Training XGBoost model...")

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric='logloss',
        random_state=42
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        early_stopping_rounds=20,
        verbose=10
    )

    print("[Trainer] Training complete")
    return model

def evaluate_model(model, X_test, y_test):
    """
    Calculate evaluation metrics
    """
    print("[Trainer] Evaluating model...")

    # Predictions
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_pred_proba > 0.5).astype(int)

    # Metrics
    auc = roc_auc_score(y_test, y_pred_proba)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)

    metrics = {
        "auc": float(auc),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "test_samples": len(y_test),
        "churn_rate": float(y_test.mean())
    }

    print(f"[Trainer] Metrics: AUC={auc:.4f}, Precision={precision:.4f}, Recall={recall:.4f}, F1={f1:.4f}")

    return metrics

def save_model_to_s3(model, metrics, feature_cols):
    """
    Save model artifact to S3 and register in database
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    version = f"v{timestamp}"

    print(f"[Trainer] Saving model version: {version}")

    # Save model locally
    local_path = f"/tmp/{MODEL_NAME}_{version}.joblib"
    model_artifact = {
        "model": model,
        "feature_cols": feature_cols,
        "version": version,
        "trained_at": datetime.utcnow().isoformat()
    }
    joblib.dump(model_artifact, local_path)

    # Upload to S3 (with encryption via bucket policy/KMS)
    artifact_key = f"models/{MODEL_NAME}/{version}.joblib"

    try:
        s3.upload_file(local_path, S3_BUCKET, artifact_key)
        print(f"[Trainer] Uploaded to s3://{S3_BUCKET}/{artifact_key}")
    except Exception as e:
        print(f"[Trainer] WARNING: S3 upload failed: {e}")
        print(f"[Trainer] Model saved locally at: {local_path}")
        artifact_key = f"local:{local_path}"

    # Register in database
    with engine.begin() as conn:
        # Insert into model_registry
        conn.execute(
            """
            INSERT INTO model_registry(model_name, version, s3_key, metrics, status, created_by, description)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (model_name, version) DO NOTHING
            """,
            (
                MODEL_NAME,
                version,
                artifact_key,
                json.dumps(metrics),
                "staging",
                SIRA_ACTOR,
                f"Automated training on {datetime.utcnow().date()}"
            )
        )

        # Insert into training logs
        conn.execute(
            """
            INSERT INTO sira_training_logs(model_name, version, dataset_ref, params, metrics, artifact_s3_key, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                MODEL_NAME,
                version,
                f"features_up_to_{datetime.utcnow().date()}",
                json.dumps({"xgb": model.get_xgb_params()}),
                json.dumps(metrics),
                artifact_key,
                "auto_daily"
            )
        )

    print(f"[Trainer] Model registered in database: {version}")
    return version, artifact_key

def train_and_save():
    """
    Main training pipeline
    """
    print("=" * 60)
    print(f"[Trainer] Starting SIRA churn prediction training")
    print(f"[Trainer] Model: {MODEL_NAME}")
    print(f"[Trainer] Time: {datetime.utcnow().isoformat()}")
    print("=" * 60)

    # 1. Load data
    df = load_features(since_days=180)

    if df.empty or len(df) < 100:
        print("[Trainer] ERROR: Insufficient data for training (need at least 100 labeled samples)")
        return

    # 2. Prepare data
    X, y, feature_cols = prepare_training_data(df)

    # Check class balance
    if y.sum() < 10 or (1 - y).sum() < 10:
        print("[Trainer] ERROR: Insufficient samples in one class (need at least 10 of each)")
        return

    # 3. Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    print(f"[Trainer] Train: {len(X_train)} samples, Test: {len(X_test)} samples")

    # 4. Train model
    model = train_model(X_train, y_train, X_test, y_test)

    # 5. Evaluate
    metrics = evaluate_model(model, X_test, y_test)

    # 6. Save to S3 and register
    version, artifact_key = save_model_to_s3(model, metrics, feature_cols)

    print("=" * 60)
    print(f"[Trainer] ✓ Training complete!")
    print(f"[Trainer] Version: {version}")
    print(f"[Trainer] AUC: {metrics['auc']:.4f}")
    print(f"[Trainer] Status: staging (ready for canary promotion)")
    print("=" * 60)

if __name__ == "__main__":
    try:
        train_and_save()
    except Exception as e:
        print(f"[Trainer] FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
