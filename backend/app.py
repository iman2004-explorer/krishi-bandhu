"""FastAPI service for the farm decision model and static frontend."""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .ml_model import FarmConditions, FarmDecisionModel


LOGGER = logging.getLogger("krishi-bandhu")
ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "farm_model.pkl"
MODEL_PATH = Path(os.environ.get("FARM_MODEL_PATH", DEFAULT_MODEL_PATH)).expanduser().resolve()

app = FastAPI(title="Krishi Bandhu API", version="1.0.0")
decision_model: FarmDecisionModel | None = None
model_load_error: str | None = None


class RecommendationRequest(BaseModel):
    season: str = Field(min_length=1, max_length=40)
    soil_type: str = Field(min_length=1, max_length=80)
    temperature_c: float | None = Field(default=None, ge=-20, le=60)
    rainfall_mm: float | None = Field(default=None, ge=0, le=2000)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)
    soil_ph: float | None = Field(default=None, ge=0, le=14)
    nitrogen_kg_ha: float | None = Field(default=None, ge=0, le=2000)
    phosphorus_kg_ha: float | None = Field(default=None, ge=0, le=2000)
    potassium_kg_ha: float | None = Field(default=None, ge=0, le=3000)
    irrigation_available: str | None = Field(default=None, max_length=20)


def _load_saved_model() -> None:
    global decision_model, model_load_error
    if not MODEL_PATH.is_file():
        LOGGER.info("No trained model found at %s; recommendation API will request training data.", MODEL_PATH)
        return
    try:
        decision_model = FarmDecisionModel.load(MODEL_PATH)
        model_load_error = None
        LOGGER.info("Loaded farm model from %s", MODEL_PATH)
    except (OSError, ValueError, EOFError, ModuleNotFoundError) as error:
        model_load_error = str(error)
        LOGGER.exception("Unable to load farm model artifact")


_load_saved_model()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ready" if decision_model is not None else "training_data_required",
        "model_loaded": decision_model is not None,
        "model_path": str(MODEL_PATH.name),
        "detail": model_load_error or None,
    }


@app.post("/api/recommend")
def recommend(payload: RecommendationRequest) -> dict[str, Any]:
    if decision_model is None:
        raise HTTPException(
            status_code=503,
            detail="No trained model is loaded. Train one from observed farm records; see README.md.",
        )
    try:
        conditions = FarmConditions.from_mapping(payload.model_dump())
        recommendations = decision_model.recommend(conditions, top_k=3)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "recommendations": [asdict(item) for item in recommendations],
        "training_summary": decision_model.training_summary(),
    }


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")