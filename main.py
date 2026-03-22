# ============================================
# main.py — FastAPI Traffic Prediction Server
# ============================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import json
import os

# Load model and metadata 
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'tunisia_model.pkl')
META_PATH  = os.path.join(BASE_DIR, 'model_metadata.json')

model    = joblib.load(MODEL_PATH)
metadata = json.load(open(META_PATH))

print(f"Model loaded")
print(f"Accuracy : {metadata['accuracy']}%")

#FastAPI app 
app = FastAPI(
    title="Tunisia Traffic Prediction API",
    version="1.0"
)

#Allow requests from your website 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tunisia bounding box 
TUNISIA_BOUNDS = {
    'min_lat': 30.23, 'max_lat': 37.54,
    'min_lng': 7.52,  'max_lng': 11.59
}

def is_in_tunisia(lat, lng):
    return (TUNISIA_BOUNDS['min_lat'] <= lat <= TUNISIA_BOUNDS['max_lat'] and
            TUNISIA_BOUNDS['min_lng'] <= lng <= TUNISIA_BOUNDS['max_lng'])

# Input model 
class Route(BaseModel):
    highway_encoded:  float
    avg_cpi:          float
    avg_rcs:          float
    avg_speed:        float
    min_lanes:        float
    min_width:        float
    total_length_km:  float
    high_risk_ratio:  float
    hour_sin:         float
    hour_cos:         float
    day_sin:          float
    day_cos:          float
    is_rush_hour:     float
    is_weekend:       float
    is_friday_prayer: float
    is_night:         float
    start_lat:        float
    start_lng:        float
    end_lat:          float
    end_lng:          float

class PredictRequest(BaseModel):
    routes: list[Route]

# Health check 
@app.get("/")
def root():
    return {
        "status":   "running",
        "model":    metadata['model_name'],
        "accuracy": metadata['accuracy']
    }

#Predict endpoint 
@app.post("/predict")
def predict(request: PredictRequest):
    # Check if routes are inside Tunisia
    for route in request.routes:
        if not is_in_tunisia(route.start_lat, route.start_lng) or \
           not is_in_tunisia(route.end_lat,   route.end_lng):
            return {
                "status":            "outside_tunisia",
                "message":           "AI prediction is only available for routes inside Tunisia",
                "recommended_index": 0
            }

    # Build feature matrix
    FEATURES = metadata['features']
    X = np.array([[
        getattr(route, f) for f in FEATURES
    ] for route in request.routes])

    # Predict congestion label + probability for each route
    predictions   = model.predict(X).tolist()
    probabilities = model.predict_proba(X).tolist()

    # Build results per route
    results = []
    label_names  = metadata['labels']
    label_colors = metadata['label_colors']

    for i, (pred, proba) in enumerate(zip(predictions, probabilities)):
        confidence = round(max(proba) * 100, 1)
        results.append({
            "route_index":  i,
            "label":        pred,
            "label_name":   label_names[str(pred)],
            "color":        label_colors[str(pred)],
            "confidence":   confidence,
            "probabilities": {
                "low":    round(proba[0] * 100, 1),
                "medium": round(proba[1] * 100, 1),
                "high":   round(proba[2] * 100, 1),
            }
        })

    # Find recommended route — lowest congestion label
    recommended_index = min(
        range(len(results)),
        key=lambda i: (results[i]['label'], -results[i]['probabilities']['low'])
    )

    return {
        "status":            "success",
        "routes":            results,
        "recommended_index": recommended_index,
        "recommended_label": label_names[str(results[recommended_index]['label'])],
        "recommended_color": label_colors[str(results[recommended_index]['label'])],
    }
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")