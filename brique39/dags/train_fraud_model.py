"""
DAG Airflow professionnel pour entraînement modèles fraud
"""

from airflow import DAG # type: ignore
from airflow.operators.python import PythonOperator # pyright: ignore[reportMissingImports]
from airflow.providers.postgres.operators.postgres import PostgresOperator # type: ignore
from airflow.operators.email import EmailOperator # type: ignore
from datetime import datetime, timedelta
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from training.train_real import build_features, train_model, evaluate_model # type: ignore

default_args = {
    'owner': 'fraud_team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email': ['fraud-alerts@molam.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'molam_fraud_training',
    default_args=default_args,
    description='Entraînement modèles de détection fraud',
    schedule_interval='@weekly',
    catchup=False,
    tags=['fraud', 'ml', 'production'],
) as dag:

    # Task 1: Vérification données
    check_data_quality = PostgresOperator(
        task_id='check_data_quality',
        sql="""
        SELECT 
            COUNT(*) as total_samples,
            SUM(CASE WHEN score > 0.8 THEN 1 ELSE 0 END) as fraud_samples
        FROM fraud_events 
        WHERE created_at >= NOW() - INTERVAL '90 days'
        """,
    )

    # Task 2: Construction features
    build_features_task = PythonOperator(
        task_id='build_features',
        python_callable=build_features,
    )

    # Task 3: Entraînement modèle
    train_model_task = PythonOperator(
        task_id='train_model',
        python_callable=train_model,
    )

    # Task 4: Évaluation modèle
    evaluate_model_task = PythonOperator(
        task_id='evaluate_model',
        python_callable=evaluate_model,
    )

    # Task 5: Notification
    notify_team = EmailOperator(
        task_id='notify_team',
        to='fraud-team@molam.com',
        subject='Fraud Model Training Completed',
        html_content="""<h3>Fraud Model Training Report</h3>
        <p>Le modèle de détection de fraud a été entraîné avec succès.</p>
        <p>Vérifiez MLflow pour les métriques détaillées.</p>
        """,
    )

    # Orchestration
    check_data_quality >> build_features_task >> train_model_task >> evaluate_model_task >> notify_team