"""
Fraud Scorer API - Lightweight version
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import json
import os
from datetime import datetime
import logging

logger = logging.getLogger("fraud_scorer")

app = FastAPI(title="Fraud Detection API", version="1.0")

class ScoreRequest(BaseModel):
    entity_type: str
    entity_id: str
    features: dict

class ScoreResponse(BaseModel):
    score: float
    model_version: str
    explain: list
    decision: dict

@app.get("/")
async def root():
    return {"message": "Fraud Detection API", "status": "healthy"}

@app.post("/score", response_model=ScoreResponse)
async def score_transaction(request: ScoreRequest):
    """Score a transaction for fraud - simulation mode"""
    try:
        logger.info(f"Scoring transaction for {request.entity_type}: {request.entity_id}")
        
        # Simulation simple du scoring
        base_score = 0.1
        if request.features.get("tx_count_7d", 0) > 20:
            base_score += 0.3
        if request.features.get("cashout_count_7d", 0) > 5:
            base_score += 0.2
        if request.features.get("sira_score", 0) > 0.7:
            base_score += 0.4
        
        # S'assurer que le score est entre 0 et 1
        final_score = min(0.99, max(0.01, base_score))
        
        # Explanation simulée
        explain = [
            {"feature": "tx_count_7d", "importance": 0.3},
            {"feature": "cashout_count_7d", "importance": 0.25},
            {"feature": "sira_score", "importance": 0.2},
            {"feature": "p2p_count_7d", "importance": 0.15},
            {"feature": "tx_vol_7d", "importance": 0.1}
        ]
        
        # Décision basée sur le score
        decision = {"action": "allow", "reason": "low_risk"}
        if final_score >= 0.8:
            decision = {"action": "hold", "reason": "high_risk"}
        elif final_score >= 0.6:
            decision = {"action": "review", "reason": "medium_risk"}
        
        return ScoreResponse(
            score=final_score,
            model_version="simulated_v1",
            explain=explain,
            decision=decision
        )
        
    except Exception as e:
        logger.error(f"Scoring error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "fraud_detector",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)