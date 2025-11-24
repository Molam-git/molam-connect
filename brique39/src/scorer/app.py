from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
import numpy as np
import shap

MODEL_PATH = os.environ.get("MODEL_PATH", "/models/lightgbm_v1.pkl")
MODEL_FEATURE_ORDER = [
    "tx_count_7d", "tx_vol_7d", "p2p_count_7d", 
    "cashout_count_7d", "sira_score"
]

try:
    model = joblib.load(MODEL_PATH)
    explainer = shap.TreeExplainer(model)
except Exception as e:
    print(f"Model loading error: {e}")
    model = None
    explainer = None

app = FastAPI()

class ScoreRequest(BaseModel):
    entity_type: str
    entity_id: str
    features: dict

@app.post("/score")
async def score(req: ScoreRequest):
    if model is None or explainer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        vector = [req.features.get(k, 0) for k in MODEL_FEATURE_ORDER]
        proba = float(model.predict_proba([vector])[0][1])
        
        shap_vals = explainer.shap_values(np.array([vector]))[1]
        top_indices = (-np.abs(shap_vals)).argsort()[:8]
        
        explain = [{
            "feature": MODEL_FEATURE_ORDER[i], 
            "shap": float(shap_vals[i])
        } for i in top_indices]
        
        decision = {"action": None}
        if proba >= 0.95:
            decision["action"] = "hold"
        elif proba >= 0.75:
            decision["action"] = "review"
            
        return {
            "score": proba,
            "model_version": "v1.0",
            "explain": explain,
            "decision": decision
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": model is not None}