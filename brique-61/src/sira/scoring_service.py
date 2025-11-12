#!/usr/bin/env python3
"""
SIRA Scoring Service - FastAPI Microservice
Provides real-time churn predictions with SHAP explainability
"""

import os
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import shap
from dotenv import load_dotenv

load_dotenv()

# Configuration
MODEL_PATH = os.getenv("SIRA_MODEL_PATH", "/models/default.joblib")
PORT = int(os.getenv("SIRA_SCORER_PORT", "8062"))

# Initialize FastAPI
app = FastAPI(
    title="SIRA Scoring Service",
    description="Real-time churn prediction with ML explanations",
    version="1.0.0"
)

# Global model cache
model_cache = {}

def load_model():
    """Load model artifact from disk"""
    global model_cache

    if "model" in model_cache:
        return model_cache

    print(f"[Scorer] Loading model from: {MODEL_PATH}")

    try:
        artifact = joblib.load(MODEL_PATH)
        model_cache = {
            "model": artifact["model"],
            "feature_cols": artifact["feature_cols"],
            "version": artifact.get("version", "unknown"),
            "explainer": shap.TreeExplainer(artifact["model"])
        }
        print(f"[Scorer] Model loaded: {model_cache['version']}")
    except Exception as e:
        print(f"[Scorer] ERROR loading model: {e}")
        raise

    return model_cache

# Load model on startup
@app.on_event("startup")
def startup_event():
    try:
        load_model()
    except Exception as e:
        print(f"[Scorer] WARNING: Could not load model on startup: {e}")
        print(f"[Scorer] Service will attempt to load model on first request")

# Request/Response models
class ScoreRequest(BaseModel):
    user_id: str
    merchant_id: str
    features: Dict[str, float] = Field(..., description="Feature dictionary with numeric values")

class TopFeature(BaseModel):
    feature: str
    value: float
    contribution: float

class ScoreResponse(BaseModel):
    user_id: str
    merchant_id: str
    model_version: str
    risk_score: float = Field(..., description="Churn risk 0-100")
    predicted_reason: Optional[str]
    recommended_action: str
    top_features: List[TopFeature]

# Helper functions
def vectorize_features(features: Dict, feature_cols: List[str]) -> np.ndarray:
    """
    Convert feature dict to ordered numpy array
    """
    vector = []
    for col in feature_cols:
        vector.append(features.get(col, 0.0))
    return np.array([vector])

def explain_prediction(model, explainer, feature_vector: np.ndarray, feature_cols: List[str], top_k: int = 5):
    """
    Generate SHAP explanations for prediction
    """
    try:
        shap_values = explainer.shap_values(feature_vector)

        # Get top contributing features
        contributions = shap_values[0] if isinstance(shap_values, list) else shap_values[0]

        # Sort by absolute contribution
        indices = np.argsort(np.abs(contributions))[::-1][:top_k]

        top_features = []
        for idx in indices:
            top_features.append({
                "feature": feature_cols[idx],
                "value": float(feature_vector[0][idx]),
                "contribution": float(contributions[idx])
            })

        return top_features
    except Exception as e:
        print(f"[Scorer] WARNING: Could not generate SHAP explanations: {e}")
        return []

def map_reason_from_features(top_features: List[Dict]) -> str:
    """
    Map top contributing features to human-readable reason
    """
    if not top_features:
        return "unknown"

    top_feature = top_features[0]["feature"]

    # Simple heuristic mapping
    if "payment" in top_feature.lower() or "failed" in top_feature.lower():
        return "failed_payment"
    elif "usage" in top_feature.lower() or "login" in top_feature.lower():
        return "low_usage"
    elif "price" in top_feature.lower() or "plan" in top_feature.lower():
        return "pricing_concern"
    elif "support" in top_feature.lower():
        return "support_issue"
    else:
        return "voluntary"

def map_action_from_risk(risk_score: float, reason: str) -> str:
    """
    Map risk score and reason to recommended action
    """
    if risk_score >= 80:
        if reason == "failed_payment":
            return "retry_payment_with_discount"
        else:
            return "urgent_discount_offer"
    elif risk_score >= 60:
        if reason == "failed_payment":
            return "retry_payment"
        elif reason == "low_usage":
            return "onboarding_email"
        else:
            return "retention_offer"
    elif risk_score >= 40:
        return "engagement_email"
    else:
        return "monitor"

# API Endpoints
@app.get("/health")
def health_check():
    """Health check endpoint"""
    try:
        cache = load_model()
        return {
            "status": "healthy",
            "model_version": cache["version"],
            "features_count": len(cache["feature_cols"])
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/v1/score", response_model=ScoreResponse)
def score_prediction(request: ScoreRequest):
    """
    Generate churn prediction with explanations
    """
    try:
        # Load model
        cache = load_model()
        model = cache["model"]
        feature_cols = cache["feature_cols"]
        explainer = cache["explainer"]
        version = cache["version"]

        # Vectorize features
        feature_vector = vectorize_features(request.features, feature_cols)

        # Predict probability
        prob = model.predict_proba(feature_vector)[0, 1]
        risk_score = float(round(prob * 100, 2))

        # Generate explanations
        top_features = explain_prediction(model, explainer, feature_vector, feature_cols, top_k=5)

        # Map to reason and action
        reason = map_reason_from_features(top_features)
        action = map_action_from_risk(risk_score, reason)

        return ScoreResponse(
            user_id=request.user_id,
            merchant_id=request.merchant_id,
            model_version=version,
            risk_score=risk_score,
            predicted_reason=reason,
            recommended_action=action,
            top_features=[TopFeature(**f) for f in top_features]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")

@app.post("/v1/batch_score")
def batch_score(requests: List[ScoreRequest]):
    """
    Batch scoring endpoint for efficiency
    """
    results = []
    for req in requests:
        try:
            result = score_prediction(req)
            results.append(result.dict())
        except Exception as e:
            results.append({"error": str(e), "user_id": req.user_id})

    return {"results": results, "count": len(results)}

# Run server
if __name__ == "__main__":
    import uvicorn
    print(f"[Scorer] Starting SIRA Scoring Service on port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
