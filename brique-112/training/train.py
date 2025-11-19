# Brique 112: SIRA Training Script
# Train fraud detection model using LightGBM

import os
import sys
import json
import boto3
import lightgbm as lgb
import pandas as pd
import numpy as np
import psycopg2
import shap
from datetime import datetime
from sklearn.metrics import (
    roc_auc_score,
    precision_recall_curve,
    average_precision_score,
    confusion_matrix,
    classification_report
)
from features import (
    get_pg_connection_pool,
    prepare_training_data,
    get_feature_columns
)

# Configuration
MODEL_NAME = os.getenv('MODEL_NAME', 'sira-fraud-detector')
PRODUCT = os.getenv('PRODUCT', 'wallet')
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/molam')
S3_BUCKET = os.getenv('S3_BUCKET', 'molam-models')
S3_PREFIX = os.getenv('S3_PREFIX', 'sira-models')

# Training parameters
PARAMS = {
    'objective': 'binary',
    'metric': 'auc',
    'boosting_type': 'gbdt',
    'num_leaves': 31,
    'learning_rate': 0.05,
    'feature_fraction': 0.9,
    'bagging_fraction': 0.8,
    'bagging_freq': 5,
    'verbose': 0,
    'max_depth': 6,
    'min_data_in_leaf': 20
}

NUM_BOOST_ROUND = 500
EARLY_STOPPING_ROUNDS = 50

def load_training_data(pg_pool, as_of_date: str):
    """
    Load training and validation datasets

    Args:
        pg_pool: PostgreSQL connection pool
        as_of_date: Reference date for data split (YYYY-MM-DD)

    Returns:
        Tuple of (train_df, val_df)
    """
    print(f"Loading training data as of {as_of_date}...")
    as_of = datetime.strptime(as_of_date, '%Y-%m-%d')

    train_df, val_df = prepare_training_data(
        pg_pool,
        as_of=as_of,
        train_window_days=90,
        val_window_days=14
    )

    return train_df, val_df

def prepare_datasets(train_df: pd.DataFrame, val_df: pd.DataFrame):
    """
    Prepare LightGBM datasets

    Args:
        train_df: Training DataFrame
        val_df: Validation DataFrame

    Returns:
        Tuple of (lgb_train, lgb_val, feature_cols)
    """
    # Get feature columns
    feature_cols = get_feature_columns(train_df)

    print(f"Feature count: {len(feature_cols)}")
    print(f"Sample features: {feature_cols[:10]}")

    # Prepare label (binary: fraudulent=1, legit=0)
    train_df['label_binary'] = train_df['label'].apply(
        lambda x: 1 if x in ['fraudulent', 'chargeback', 'dispute_lost'] else 0
    )
    val_df['label_binary'] = val_df['label'].apply(
        lambda x: 1 if x in ['fraudulent', 'chargeback', 'dispute_lost'] else 0
    )

    # Create LightGBM datasets
    lgb_train = lgb.Dataset(
        train_df[feature_cols],
        label=train_df['label_binary'],
        free_raw_data=False
    )

    lgb_val = lgb.Dataset(
        val_df[feature_cols],
        label=val_df['label_binary'],
        reference=lgb_train,
        free_raw_data=False
    )

    return lgb_train, lgb_val, feature_cols

def train_model(lgb_train, lgb_val):
    """
    Train LightGBM model

    Args:
        lgb_train: Training dataset
        lgb_val: Validation dataset

    Returns:
        Trained booster
    """
    print("Training model...")

    evals_result = {}

    booster = lgb.train(
        PARAMS,
        lgb_train,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[lgb_train, lgb_val],
        valid_names=['train', 'val'],
        callbacks=[
            lgb.early_stopping(stopping_rounds=EARLY_STOPPING_ROUNDS),
            lgb.log_evaluation(period=50)
        ],
        evals_result=evals_result
    )

    print(f"Best iteration: {booster.best_iteration}")
    print(f"Best score: {booster.best_score}")

    return booster

def evaluate_model(booster, val_df: pd.DataFrame, feature_cols: list):
    """
    Evaluate model performance

    Args:
        booster: Trained booster
        val_df: Validation DataFrame
        feature_cols: Feature column names

    Returns:
        Dictionary of metrics
    """
    print("Evaluating model...")

    # Prepare labels
    y_true = val_df['label'].apply(
        lambda x: 1 if x in ['fraudulent', 'chargeback', 'dispute_lost'] else 0
    ).values

    # Predict
    y_pred_proba = booster.predict(val_df[feature_cols])
    y_pred = (y_pred_proba >= 0.5).astype(int)

    # Calculate metrics
    auc = roc_auc_score(y_true, y_pred_proba)
    avg_precision = average_precision_score(y_true, y_pred_proba)

    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    # Precision at different thresholds
    precision, recall, thresholds = precision_recall_curve(y_true, y_pred_proba)

    # Find precision at 90% recall
    idx_90_recall = np.argmax(recall >= 0.90)
    precision_at_90_recall = precision[idx_90_recall] if idx_90_recall < len(precision) else 0

    metrics = {
        'auc': float(auc),
        'avg_precision': float(avg_precision),
        'precision_at_90_recall': float(precision_at_90_recall),
        'true_positives': int(tp),
        'false_positives': int(fp),
        'true_negatives': int(tn),
        'false_negatives': int(fn),
        'precision': float(tp / (tp + fp)) if (tp + fp) > 0 else 0,
        'recall': float(tp / (tp + fn)) if (tp + fn) > 0 else 0,
        'f1_score': float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 0
    }

    print("\n=== Model Metrics ===")
    print(f"AUC: {metrics['auc']:.4f}")
    print(f"Avg Precision: {metrics['avg_precision']:.4f}")
    print(f"Precision@90%Recall: {metrics['precision_at_90_recall']:.4f}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall: {metrics['recall']:.4f}")
    print(f"F1 Score: {metrics['f1_score']:.4f}")
    print(f"\nConfusion Matrix:")
    print(f"  TN: {tn}, FP: {fp}")
    print(f"  FN: {fn}, TP: {tp}")

    return metrics

def compute_shap_values(booster, val_df: pd.DataFrame, feature_cols: list, max_samples: int = 100):
    """
    Compute SHAP values for model explainability

    Args:
        booster: Trained booster
        val_df: Validation DataFrame
        feature_cols: Feature column names
        max_samples: Maximum samples for SHAP calculation

    Returns:
        Dictionary with feature importance
    """
    print("Computing SHAP values for explainability...")

    # Sample data for SHAP (can be expensive on large datasets)
    sample_df = val_df.sample(min(max_samples, len(val_df)))[feature_cols]

    # Create SHAP explainer
    explainer = shap.TreeExplainer(booster)
    shap_values = explainer.shap_values(sample_df)

    # Get mean absolute SHAP values per feature
    mean_shap = np.abs(shap_values).mean(axis=0)

    # Create feature importance dict
    feature_importance = {
        feature_cols[i]: float(mean_shap[i])
        for i in range(len(feature_cols))
    }

    # Sort by importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)

    print("\nTop 10 Most Important Features (SHAP):")
    for feat, importance in sorted_features[:10]:
        print(f"  {feat}: {importance:.4f}")

    return {
        'feature_importance': feature_importance,
        'top_features': [f[0] for f in sorted_features[:20]]
    }

def save_model_local(booster, model_path: str):
    """Save model to local file"""
    print(f"Saving model to {model_path}...")
    booster.save_model(model_path)
    return model_path

def upload_to_s3(local_path: str, s3_key: str):
    """
    Upload model to S3

    Args:
        local_path: Local file path
        s3_key: S3 object key

    Returns:
        S3 URI
    """
    print(f"Uploading to s3://{S3_BUCKET}/{s3_key}...")

    s3_client = boto3.client('s3')

    try:
        s3_client.upload_file(local_path, S3_BUCKET, s3_key)
        s3_uri = f"s3://{S3_BUCKET}/{s3_key}"
        print(f"Upload successful: {s3_uri}")
        return s3_uri
    except Exception as e:
        print(f"S3 upload failed: {e}")
        # Return local path as fallback
        return local_path

def register_model(pg_pool, model_metadata: dict):
    """
    Register model in database

    Args:
        pg_pool: PostgreSQL connection pool
        model_metadata: Model metadata dictionary

    Returns:
        Model ID
    """
    print("Registering model in database...")

    conn = pg_pool.getconn()

    try:
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO siramodel_registry(
                name,
                version,
                product,
                algorithm,
                storage_s3_key,
                feature_names,
                metrics,
                status,
                training_config,
                shap_summary
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING model_id
            """,
            [
                model_metadata['name'],
                model_metadata['version'],
                model_metadata['product'],
                model_metadata['algorithm'],
                model_metadata['storage_s3_key'],
                model_metadata['feature_names'],
                json.dumps(model_metadata['metrics']),
                'candidate',  # Initial status
                json.dumps(model_metadata['training_config']),
                json.dumps(model_metadata.get('shap_summary', {}))
            ]
        )

        model_id = cursor.fetchone()[0]
        conn.commit()

        print(f"Model registered with ID: {model_id}")

        return model_id
    finally:
        pg_pool.putconn(conn)

def main():
    """Main training pipeline"""

    # Parse arguments
    if len(sys.argv) < 2:
        print("Usage: python train.py <as_of_date>")
        print("Example: python train.py 2024-01-15")
        sys.exit(1)

    as_of_date = sys.argv[1]

    # Generate version
    version = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    print("=" * 60)
    print(f"SIRA Training Pipeline - {MODEL_NAME}")
    print(f"Version: {version}")
    print(f"Product: {PRODUCT}")
    print(f"As of date: {as_of_date}")
    print("=" * 60)

    # Create PostgreSQL connection pool
    print("\nConnecting to database...")
    pg_pool = get_pg_connection_pool(DB_URL)

    # Load data
    train_df, val_df = load_training_data(pg_pool, as_of_date)

    # Prepare datasets
    lgb_train, lgb_val, feature_cols = prepare_datasets(train_df, val_df)

    # Train model
    booster = train_model(lgb_train, lgb_val)

    # Evaluate
    metrics = evaluate_model(booster, val_df, feature_cols)

    # Compute SHAP
    shap_summary = compute_shap_values(booster, val_df, feature_cols)

    # Save model locally
    model_filename = f"{MODEL_NAME}_{version}.txt"
    model_path = save_model_local(booster, model_filename)

    # Upload to S3
    s3_key = f"{S3_PREFIX}/{PRODUCT}/{model_filename}"
    s3_uri = upload_to_s3(model_path, s3_key)

    # Register in database
    model_metadata = {
        'name': MODEL_NAME,
        'version': version,
        'product': PRODUCT,
        'algorithm': 'lightgbm',
        'storage_s3_key': s3_uri,
        'feature_names': feature_cols,
        'metrics': metrics,
        'training_config': {
            'as_of_date': as_of_date,
            'train_window_days': 90,
            'val_window_days': 14,
            'num_features': len(feature_cols),
            'train_samples': len(train_df),
            'val_samples': len(val_df),
            'params': PARAMS,
            'num_boost_round': NUM_BOOST_ROUND,
            'early_stopping_rounds': EARLY_STOPPING_ROUNDS
        },
        'shap_summary': shap_summary
    }

    model_id = register_model(pg_pool, model_metadata)

    print("\n" + "=" * 60)
    print("Training complete!")
    print(f"Model ID: {model_id}")
    print(f"Version: {version}")
    print(f"S3 URI: {s3_uri}")
    print(f"AUC: {metrics['auc']:.4f}")
    print("=" * 60)

    # Close pool
    pg_pool.closeall()

    return 0

if __name__ == '__main__':
    sys.exit(main())
