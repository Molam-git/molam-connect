# Brique 112: SIRA Training - Feature Engineering
# Extract and transform features from SIRA dataset

import pandas as pd
import numpy as np
from typing import Tuple, List
import psycopg2
from psycopg2 import pool
from datetime import datetime, timedelta

def get_pg_connection_pool(db_url: str, min_conn: int = 2, max_conn: int = 10):
    """Create PostgreSQL connection pool"""
    return psycopg2.pool.SimpleConnectionPool(
        min_conn,
        max_conn,
        db_url
    )

def load_events(pg_pool, start_ts: datetime, end_ts: datetime) -> pd.DataFrame:
    """
    Load events from siradata_events table

    Args:
        pg_pool: PostgreSQL connection pool
        start_ts: Start timestamp for data window
        end_ts: End timestamp for data window

    Returns:
        DataFrame with events and features
    """
    conn = pg_pool.getconn()

    try:
        query = """
        SELECT
            event_id,
            source_module,
            country,
            currency,
            features,
            created_at
        FROM siradata_events
        WHERE created_at BETWEEN %s AND %s
        ORDER BY created_at
        """

        df = pd.read_sql(query, conn, params=(start_ts, end_ts))

        # Normalize JSON features into columns
        features_df = pd.json_normalize(df['features'])

        # Combine with metadata
        df = pd.concat([
            df[['event_id', 'source_module', 'country', 'currency', 'created_at']],
            features_df
        ], axis=1)

        return df
    finally:
        pg_pool.putconn(conn)

def join_labels(df: pd.DataFrame, pg_pool, start_ts: datetime, end_ts: datetime) -> pd.DataFrame:
    """
    Join labels with events

    Args:
        df: Events DataFrame
        pg_pool: PostgreSQL connection pool
        start_ts: Start timestamp
        end_ts: End timestamp

    Returns:
        DataFrame with labels joined
    """
    conn = pg_pool.getconn()

    try:
        query = """
        SELECT
            event_id,
            label,
            labelled_by,
            confidence
        FROM siradata_labels
        WHERE created_at BETWEEN %s AND %s
        """

        labels = pd.read_sql(query, conn, params=(start_ts, end_ts))

        # Join with events
        df = df.merge(labels, on='event_id', how='left')

        return df
    finally:
        pg_pool.putconn(conn)

def feature_transform(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw features into model-ready features

    Args:
        df: Raw features DataFrame

    Returns:
        Transformed DataFrame
    """
    df = df.copy()

    # Amount bucketing
    if 'amount' in df.columns:
        df['amount_bucket'] = pd.cut(
            df['amount'],
            bins=[0, 10, 50, 200, 1000, 10000, np.inf],
            labels=['0-10', '10-50', '50-200', '200-1k', '1k-10k', '10k+']
        )

        # Log transform
        df['amount_log'] = np.log1p(df['amount'])

    # Categorical encoding
    categorical_cols = ['payment_method', 'country', 'currency', 'device_type', 'source_module']
    for col in categorical_cols:
        if col in df.columns:
            df = pd.get_dummies(df, columns=[col], prefix=col, dummy_na=True)

    # Time features
    if 'created_at' in df.columns:
        df['created_at'] = pd.to_datetime(df['created_at'])
        df['hour_of_day'] = df['created_at'].dt.hour
        df['day_of_week'] = df['created_at'].dt.dayofweek
        df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)

    # Fill missing values
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].fillna(0)

    return df

def prepare_training_data(
    pg_pool,
    as_of: datetime,
    train_window_days: int = 90,
    val_window_days: int = 14
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Prepare training and validation datasets

    Args:
        pg_pool: PostgreSQL connection pool
        as_of: Reference date for data split
        train_window_days: Days of training data
        val_window_days: Days of validation data

    Returns:
        Tuple of (train_df, val_df)
    """
    # Define windows
    train_start = as_of - timedelta(days=train_window_days)
    train_end = as_of - timedelta(days=val_window_days)
    val_start = train_end
    val_end = as_of

    # Load training data
    print(f"Loading training data: {train_start} to {train_end}")
    train_df = load_events(pg_pool, train_start, train_end)
    train_df = join_labels(train_df, pg_pool, train_start, train_end)
    train_df = feature_transform(train_df)

    # Load validation data
    print(f"Loading validation data: {val_start} to {val_end}")
    val_df = load_events(pg_pool, val_start, val_end)
    val_df = join_labels(val_df, pg_pool, val_start, val_end)
    val_df = feature_transform(val_df)

    # Filter to labeled data only
    train_df = train_df[train_df['label'].notnull()]
    val_df = val_df[val_df['label'].notnull()]

    print(f"Training samples: {len(train_df)}, Validation samples: {len(val_df)}")

    return train_df, val_df

def get_feature_columns(df: pd.DataFrame) -> List[str]:
    """
    Get list of feature columns (excluding metadata and label)

    Args:
        df: DataFrame

    Returns:
        List of feature column names
    """
    exclude_cols = [
        'event_id', 'label', 'labelled_by', 'confidence',
        'created_at', 'source_module'
    ]

    feature_cols = [col for col in df.columns if col not in exclude_cols]

    return feature_cols
