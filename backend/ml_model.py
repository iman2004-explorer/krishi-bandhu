"""Trainable, evidence-aware crop recommendations from farm observations.

Training records must be observed farm outcomes, not the app's illustrative crop
benchmarks. See REQUIRED_COLUMNS and --help for the CSV and command-line usage.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import pickle
import statistics
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.metrics import balanced_accuracy_score, mean_absolute_error, mean_squared_error
from sklearn.model_selection import StratifiedKFold
from sklearn.naive_bayes import GaussianNB
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge


CATEGORICAL_FEATURES = ("season", "soil_type", "irrigation_available")
NUMERIC_FEATURES = (
	"temperature_c",
	"rainfall_mm",
	"humidity_pct",
	"soil_ph",
	"nitrogen_kg_ha",
	"phosphorus_kg_ha",
	"potassium_kg_ha",
)
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
REQUIRED_COLUMNS = FEATURES + (
	"crop",
	"yield_quintals_per_acre",
	"price_rupees_per_quintal",
	"cost_rupees_per_acre",
)
MIN_TRAINING_ROWS = 30
MIN_RECORDS_PER_CROP = 5

VALUE_RANGES = {
	"temperature_c": (-20, 60),
	"rainfall_mm": (0, 2000),
	"humidity_pct": (0, 100),
	"soil_ph": (0, 14),
	"nitrogen_kg_ha": (0, 2000),
	"phosphorus_kg_ha": (0, 2000),
	"potassium_kg_ha": (0, 3000),
}


@dataclass(frozen=True, slots=True)
class FarmConditions:
	season: str
	soil_type: str
	temperature_c: float | None = None
	rainfall_mm: float | None = None
	humidity_pct: float | None = None
	soil_ph: float | None = None
	nitrogen_kg_ha: float | None = None
	phosphorus_kg_ha: float | None = None
	potassium_kg_ha: float | None = None
	irrigation_available: str | None = None

	def __post_init__(self) -> None:
		if not self.season.strip() or not self.soil_type.strip():
			raise ValueError("season and soil_type are required.")
		for name, (minimum, maximum) in VALUE_RANGES.items():
			value = getattr(self, name)
			if value is not None and (not math.isfinite(value) or not minimum <= value <= maximum):
				raise ValueError(f"{name} must be between {minimum} and {maximum}.")

	@classmethod
	def from_mapping(cls, values: Mapping[str, Any]) -> FarmConditions:
		parsed = dict(values)
		for name in NUMERIC_FEATURES:
			parsed[name] = _optional_number(parsed.get(name), name)
		irrigation = parsed.get("irrigation_available")
		parsed["irrigation_available"] = None if _is_blank(irrigation) else str(irrigation).strip()
		return cls(
			season=str(parsed.get("season", "")).strip(),
			soil_type=str(parsed.get("soil_type", "")).strip(),
			**{name: parsed[name] for name in NUMERIC_FEATURES},
			irrigation_available=parsed["irrigation_available"],
		)

	def features(self) -> dict[str, Any]:
		return asdict(self)


@dataclass(frozen=True, slots=True)
class FarmObservation:
	conditions: FarmConditions
	crop: str
	yield_quintals_per_acre: float
	price_rupees_per_quintal: float | None = None
	cost_rupees_per_acre: float | None = None

	def __post_init__(self) -> None:
		if not self.crop.strip():
			raise ValueError("crop is required.")
		if not math.isfinite(self.yield_quintals_per_acre) or self.yield_quintals_per_acre <= 0:
			raise ValueError("yield_quintals_per_acre must be a positive finite number.")
		for name in ("price_rupees_per_quintal", "cost_rupees_per_acre"):
			value = getattr(self, name)
			if value is not None and (not math.isfinite(value) or value < 0):
				raise ValueError(f"{name} must be a non-negative finite number when provided.")

	@classmethod
	def from_mapping(cls, values: Mapping[str, Any]) -> FarmObservation:
		conditions = FarmConditions.from_mapping(values)
		crop = str(values.get("crop", "")).strip()
		yield_value = _optional_number(values.get("yield_quintals_per_acre"), "yield_quintals_per_acre")
		if yield_value is None:
			raise ValueError("yield_quintals_per_acre is required.")
		return cls(
			conditions=conditions,
			crop=crop,
			yield_quintals_per_acre=yield_value,
			price_rupees_per_quintal=_optional_number(values.get("price_rupees_per_quintal"), "price_rupees_per_quintal"),
			cost_rupees_per_acre=_optional_number(values.get("cost_rupees_per_acre"), "cost_rupees_per_acre"),
		)


@dataclass(frozen=True, slots=True)
class KnowledgeDocument:
	crop: str
	text: str
	source: str


@dataclass(frozen=True, slots=True)
class RetrievedEvidence:
	crop: str
	text: str
	source: str
	relevance: float


@dataclass(frozen=True, slots=True)
class CropRecommendation:
	crop: str
	ensemble_score: float
	bayes_posterior: float
	pca_similarity: float
	rag_relevance: float
	estimated_yield_quintals_per_acre: float
	observed_yield_range: tuple[float, float]
	median_price_rupees_per_quintal: float | None
	median_cost_rupees_per_acre: float | None
	estimated_gross_rupees_per_acre: float | None
	estimated_net_rupees_per_acre: float | None
	evidence: tuple[RetrievedEvidence, ...]


DEFAULT_KNOWLEDGE_BASE = (
	KnowledgeDocument("Paddy", "Paddy: app baseline lists Kharif planting, alluvial or clay soils, high water demand, and a 110 to 130 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("Wheat", "Wheat: app baseline lists the cooler Rabi season, well-drained loamy soil, medium water demand, and a 120 to 140 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("Maize", "Maize: app baseline describes adaptation across several soils, moderate warmth and water demand, and a 90 to 110 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("Mustard", "Mustard: app baseline lists a low-water Rabi oilseed option and a 100 to 120 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("Cotton", "Cotton: app baseline lists warm conditions, deep black or alluvial soils, medium-high water demand, and a 150 to 180 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("Watermelon", "Watermelon: app baseline lists sandy soil, warm Zaid conditions, medium water demand, and an 80 to 100 day growing period.", "App baseline notes; verify locally"),
	KnowledgeDocument("All crops", "Soil tests, local rainfall, irrigation, seed variety, and district-level extension guidance are important. Confirm fertilizer and pesticide choices with a qualified local agricultural adviser.", "General safety note; confirm with KVK"),
)


def _is_blank(value: Any) -> bool:
	return value is None or (isinstance(value, str) and not value.strip())


def _optional_number(value: Any, field_name: str) -> float | None:
	if _is_blank(value):
		return None
	try:
		number = float(value)
	except (TypeError, ValueError) as error:
		raise ValueError(f"{field_name} must be numeric.") from error
	if not math.isfinite(number):
		raise ValueError(f"{field_name} must be finite.")
	return number


def _feature_frame(conditions: Sequence[FarmConditions]) -> pd.DataFrame:
	return pd.DataFrame([condition.features() for condition in conditions], columns=FEATURES)


def _make_preprocessor(include_crop: bool = False) -> ColumnTransformer:
	numeric_pipeline = Pipeline(
		steps=[
			("impute", SimpleImputer(strategy="median", keep_empty_features=True)),
			("scale", StandardScaler()),
		]
	)
	categorical_features = list(CATEGORICAL_FEATURES)
	if include_crop:
		categorical_features.append("crop")
	categorical_pipeline = Pipeline(
		steps=[
			("impute", SimpleImputer(strategy="constant", fill_value="Unknown", keep_empty_features=True)),
			("one_hot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
		]
	)
	return ColumnTransformer(
		transformers=[
			("numeric", numeric_pipeline, list(NUMERIC_FEATURES)),
			("categorical", categorical_pipeline, categorical_features),
		],
		sparse_threshold=0,
	)


class FarmDecisionModel:
	"""Hybrid classifier, yield regressor, PCA ranker, and TF-IDF RAG retriever."""

	def __init__(
		self,
		knowledge_base: Iterable[KnowledgeDocument] = DEFAULT_KNOWLEDGE_BASE,
		pca_components: int = 6,
		minimum_rows: int = MIN_TRAINING_ROWS,
	) -> None:
		if pca_components < 1:
			raise ValueError("pca_components must be at least 1.")
		self.knowledge_base = tuple(knowledge_base)
		if not self.knowledge_base:
			raise ValueError("knowledge_base must contain at least one document.")
		self.pca_components = pca_components
		self.minimum_rows = minimum_rows
		self._fitted = False

	@classmethod
	def from_csv(cls, csv_path: str | Path, **kwargs: Any) -> FarmDecisionModel:
		observations = load_observations(csv_path)
		return cls(**kwargs).fit(observations)

	def fit(self, observations: Sequence[FarmObservation]) -> FarmDecisionModel:
		records = list(observations)
		if len(records) < self.minimum_rows:
			raise ValueError(
				f"Need at least {self.minimum_rows} observed farm records; received {len(records)}."
			)
		crop_counts = Counter(record.crop for record in records)
		if len(crop_counts) < 3:
			raise ValueError("Training data must contain at least three crop classes.")
		too_small = {crop: count for crop, count in crop_counts.items() if count < MIN_RECORDS_PER_CROP}
		if too_small:
			raise ValueError(
				f"Each crop needs at least {MIN_RECORDS_PER_CROP} observations; insufficient counts: {too_small}."
			)

		self.crop_counts_ = dict(crop_counts)
		self.crop_labels_ = np.asarray([record.crop for record in records], dtype=object)
		self.yield_targets_ = np.asarray(
			[record.yield_quintals_per_acre for record in records], dtype=float
		)
		self.feature_frame_ = _feature_frame([record.conditions for record in records])

		self.preprocessor_ = _make_preprocessor()
		transformed = self.preprocessor_.fit_transform(self.feature_frame_)
		component_count = min(self.pca_components, len(records) - 1, transformed.shape[1])
		if component_count < 1:
			raise ValueError("Not enough variation in training features to fit PCA.")
		self.pca_ = PCA(n_components=component_count, random_state=42)
		reduced = self.pca_.fit_transform(transformed)

		self.bayes_ = GaussianNB(var_smoothing=1e-8)
		self.bayes_.fit(transformed, self.crop_labels_)

		yield_frame = self.feature_frame_.copy()
		yield_frame["crop"] = self.crop_labels_
		self.yield_preprocessor_ = _make_preprocessor(include_crop=True)
		yield_features = self.yield_preprocessor_.fit_transform(yield_frame)
		self.yield_regressor_ = Ridge(alpha=2.0)
		self.yield_regressor_.fit(yield_features, self.yield_targets_)

		self.class_centroids_ = {}
		within_class_distances: list[float] = []
		for crop in self.bayes_.classes_:
			crop_rows = reduced[self.crop_labels_ == crop]
			centroid = crop_rows.mean(axis=0)
			self.class_centroids_[str(crop)] = centroid
			within_class_distances.extend(np.linalg.norm(crop_rows - centroid, axis=1).tolist())
		self.pca_distance_scale_ = max(float(np.median(within_class_distances)), 1e-6)

		self.yield_ranges_ = {}
		self.crop_prices_ = {}
		self.crop_costs_ = {}
		for crop in self.bayes_.classes_:
			crop_records = [record for record in records if record.crop == crop]
			yields = [record.yield_quintals_per_acre for record in crop_records]
			self.yield_ranges_[str(crop)] = (float(min(yields)), float(max(yields)))
			prices = [record.price_rupees_per_quintal for record in crop_records if record.price_rupees_per_quintal is not None]
			costs = [record.cost_rupees_per_acre for record in crop_records if record.cost_rupees_per_acre is not None]
			self.crop_prices_[str(crop)] = float(statistics.median(prices)) if prices else None
			self.crop_costs_[str(crop)] = float(statistics.median(costs)) if costs else None

		self.retriever_ = TfidfVectorizer(ngram_range=(1, 2), strip_accents="unicode", sublinear_tf=True)
		self.knowledge_matrix_ = self.retriever_.fit_transform([document.text for document in self.knowledge_base])
		self._fitted = True
		return self

	def retrieve(self, conditions: FarmConditions, top_k: int = 4) -> list[RetrievedEvidence]:
		self._require_fitted()
		if top_k < 1:
			raise ValueError("top_k must be at least 1.")
		query = self._query_text(conditions)
		query_vector = self.retriever_.transform([query])
		scores = (query_vector @ self.knowledge_matrix_.T).toarray()[0]
		indexes = np.argsort(scores)[::-1][:top_k]
		return [
			RetrievedEvidence(
				crop=self.knowledge_base[index].crop,
				text=self.knowledge_base[index].text,
				source=self.knowledge_base[index].source,
				relevance=float(scores[index]),
			)
			for index in indexes
			if scores[index] > 0
		]

	def recommend(self, conditions: FarmConditions, top_k: int = 3) -> list[CropRecommendation]:
		self._require_fitted()
		if top_k < 1:
			raise ValueError("top_k must be at least 1.")

		frame = _feature_frame([conditions])
		transformed = self.preprocessor_.transform(frame)
		reduced = self.pca_.transform(transformed)[0]
		probabilities = self.bayes_.predict_proba(transformed)[0]
		classes = [str(crop) for crop in self.bayes_.classes_]
		evidence = self.retrieve(conditions, top_k=max(4, top_k * 2))
		rag_by_crop: dict[str, float] = defaultdict(float)
		evidence_by_crop: dict[str, list[RetrievedEvidence]] = defaultdict(list)
		for item in evidence:
			key = item.crop.casefold()
			rag_by_crop[key] = max(rag_by_crop[key], item.relevance)
			evidence_by_crop[key].append(item)

		max_rag = max(rag_by_crop.values(), default=0.0)
		yield_frame = frame.copy()
		recommendations: list[CropRecommendation] = []
		for index, crop in enumerate(classes):
			crop_features = yield_frame.copy()
			crop_features["crop"] = crop
			yield_features = self.yield_preprocessor_.transform(crop_features)
			raw_yield = float(self.yield_regressor_.predict(yield_features)[0])
			minimum_yield, maximum_yield = self.yield_ranges_[crop]
			estimated_yield = float(np.clip(raw_yield, minimum_yield, maximum_yield))

			distance = float(np.linalg.norm(reduced - self.class_centroids_[crop]))
			pca_similarity = math.exp(-distance / self.pca_distance_scale_)
			rag_relevance = rag_by_crop[crop.casefold()] / max_rag if max_rag > 0 else 0.0
			posterior = float(probabilities[index])
			available_signals = [(0.60, posterior), (0.25, pca_similarity)]
			if max_rag > 0:
				available_signals.append((0.15, rag_relevance))
			weight_total = sum(weight for weight, _ in available_signals)
			ensemble_score = sum(weight * score for weight, score in available_signals) / weight_total

			price = self.crop_prices_[crop]
			cost = self.crop_costs_[crop]
			gross = estimated_yield * price if price is not None else None
			net = gross - cost if gross is not None and cost is not None else None
			recommendations.append(
				CropRecommendation(
					crop=crop,
					ensemble_score=ensemble_score,
					bayes_posterior=posterior,
					pca_similarity=pca_similarity,
					rag_relevance=rag_relevance,
					estimated_yield_quintals_per_acre=estimated_yield,
					observed_yield_range=(minimum_yield, maximum_yield),
					median_price_rupees_per_quintal=price,
					median_cost_rupees_per_acre=cost,
					estimated_gross_rupees_per_acre=gross,
					estimated_net_rupees_per_acre=net,
					evidence=tuple(evidence_by_crop[crop.casefold()][:2]),
				)
			)

		return sorted(recommendations, key=lambda item: item.ensemble_score, reverse=True)[:top_k]

	def evaluate(self, observations: Sequence[FarmObservation], folds: int = 3) -> dict[str, float | int]:
		"""Return stratified cross-validation metrics for crop and yield models."""
		records = list(observations)
		labels = np.asarray([record.crop for record in records], dtype=object)
		class_counts = Counter(labels)
		if folds < 2 or not class_counts or min(class_counts.values()) < folds:
			raise ValueError("Each crop must have at least `folds` records for stratified cross-validation.")

		frame = _feature_frame([record.conditions for record in records])
		yields = np.asarray([record.yield_quintals_per_acre for record in records], dtype=float)
		splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
		balanced_scores: list[float] = []
		absolute_errors: list[float] = []
		for train_indexes, test_indexes in splitter.split(frame, labels):
			train_frame = frame.iloc[train_indexes]
			test_frame = frame.iloc[test_indexes]
			train_labels = labels[train_indexes]
			test_labels = labels[test_indexes]

			classifier_preprocessor = _make_preprocessor()
			train_features = classifier_preprocessor.fit_transform(train_frame)
			test_features = classifier_preprocessor.transform(test_frame)
			classifier = GaussianNB(var_smoothing=1e-8).fit(train_features, train_labels)
			balanced_scores.append(float(balanced_accuracy_score(test_labels, classifier.predict(test_features))))

			yield_train_frame = train_frame.copy()
			yield_test_frame = test_frame.copy()
			yield_train_frame["crop"] = train_labels
			yield_test_frame["crop"] = test_labels
			yield_preprocessor = _make_preprocessor(include_crop=True)
			train_yield_features = yield_preprocessor.fit_transform(yield_train_frame)
			test_yield_features = yield_preprocessor.transform(yield_test_frame)
			regressor = Ridge(alpha=2.0).fit(train_yield_features, yields[train_indexes])
			predictions = regressor.predict(test_yield_features)
			absolute_errors.append(float(mean_absolute_error(yields[test_indexes], predictions)))

		return {
			"records": len(records),
			"folds": folds,
			"balanced_accuracy_mean": statistics.mean(balanced_scores),
			"balanced_accuracy_std": statistics.stdev(balanced_scores) if len(balanced_scores) > 1 else 0.0,
			"yield_mae_quintals_per_acre_mean": statistics.mean(absolute_errors),
			"yield_mae_quintals_per_acre_std": statistics.stdev(absolute_errors) if len(absolute_errors) > 1 else 0.0,
		}

	def training_summary(self) -> dict[str, Any]:
		self._require_fitted()
		return {
			"training_records": int(len(self.crop_labels_)),
			"crop_counts": self.crop_counts_,
			"pca_components": int(self.pca_.n_components_),
			"pca_explained_variance_ratio": self.pca_.explained_variance_ratio_.tolist(),
			"limitations": [
				"Bayesian posteriors are not calibrated probabilities until calibration is evaluated on held-out local data.",
				"Ridge estimates are bounded to the observed yield range for each crop; they do not extrapolate beyond it.",
				"Knowledge notes are app baseline text, not a substitute for verified district agronomy sources.",
				"Cross-validation scores measure this dataset only and do not guarantee performance on new districts or seasons.",
			],
		}

	def save(self, path: str | Path) -> None:
		self._require_fitted()
		with Path(path).open("wb") as model_file:
			pickle.dump(self, model_file)

	@classmethod
	def load(cls, path: str | Path) -> FarmDecisionModel:
		with Path(path).open("rb") as model_file:
			model = pickle.load(model_file)
		if not isinstance(model, cls) or not model._fitted:
			raise ValueError("The file does not contain a fitted FarmDecisionModel.")
		return model

	def _require_fitted(self) -> None:
		if not self._fitted:
			raise RuntimeError("Call fit() with validated observed farm records before prediction.")

	@staticmethod
	def _query_text(conditions: FarmConditions) -> str:
		values = conditions.features()
		return " ".join(f"{key.replace('_', ' ')} {value}" for key, value in values.items() if value is not None)


def load_observations(csv_path: str | Path) -> list[FarmObservation]:
	"""Load and validate the documented training CSV without guessing missing labels."""
	path = Path(csv_path)
	with path.open("r", newline="", encoding="utf-8-sig") as source:
		reader = csv.DictReader(source)
		if reader.fieldnames is None:
			raise ValueError("Training CSV must include a header row.")
		missing_columns = sorted(set(REQUIRED_COLUMNS) - set(reader.fieldnames))
		if missing_columns:
			raise ValueError(f"Training CSV is missing columns: {', '.join(missing_columns)}")
		observations = []
		for line_number, row in enumerate(reader, start=2):
			try:
				observations.append(FarmObservation.from_mapping(row))
			except ValueError as error:
				raise ValueError(f"Invalid training record on line {line_number}: {error}") from error
	if not observations:
		raise ValueError("Training CSV contains no farm observations.")
	return observations


def _print_json(value: Any) -> None:
	print(json.dumps(value, ensure_ascii=False, indent=2, default=lambda item: asdict(item)))


def _run_self_test() -> int:
	"""Exercise training and inference using generated, non-production records."""
	crop_profiles = (
		("Paddy", "Kharif", "Alluvial", 42, 2300, 40000, 29, 140),
		("Wheat", "Rabi", "Loamy", 36, 2275, 38000, 18, 20),
		("Watermelon", "Zaid", "Sandy", 75, 1800, 52000, 31, 20),
	)
	observations = [
		FarmObservation.from_mapping(
			{
				"season": season,
				"soil_type": soil,
				"temperature_c": temperature + (index % 3) - 1,
				"rainfall_mm": rainfall + index % 4,
				"humidity_pct": 55 + index % 20,
				"soil_ph": 6.2 + (index % 5) * 0.1,
				"nitrogen_kg_ha": 80 + (index * 3) % 30,
				"phosphorus_kg_ha": 35 + (index * 2) % 20,
				"potassium_kg_ha": 45 + (index * 4) % 25,
				"irrigation_available": "yes" if index % 2 else "no",
				"crop": crop,
				"yield_quintals_per_acre": yield_value + (index % 5 - 2) * 0.5,
				"price_rupees_per_quintal": price,
				"cost_rupees_per_acre": cost,
			}
		)
		for crop, season, soil, yield_value, price, cost, temperature, rainfall in crop_profiles
		for index in range(10)
	]
	model = FarmDecisionModel().fit(observations)
	conditions = FarmConditions(season="Kharif", soil_type="Alluvial", temperature_c=29)
	top_crop = model.recommend(conditions)[0].crop
	if top_crop != "Paddy":
		raise RuntimeError(f"Self-test expected Paddy for Kharif/alluvial input; model returned {top_crop}.")

	_print_json(
		{
			"self_test": "passed",
			"synthetic_records": len(observations),
			"known_case": {"season": conditions.season, "soil_type": conditions.soil_type, "top_crop": top_crop},
			"cross_validation": model.evaluate(observations, folds=3),
			"warning": "Synthetic data checks code paths only; these metrics do not measure real-world farming accuracy.",
		}
	)
	return 0


def main(argv: Sequence[str] | None = None) -> int:
	parser = argparse.ArgumentParser(
		description="Train and query the farm crop decision model from observed farm records.",
		epilog=(
			"CSV columns: " + ", ".join(REQUIRED_COLUMNS) + ". "
			"Example: python 'ml model.py' farm_records.csv --evaluate --farm-json '{\"season\":\"Kharif\",\"soil_type\":\"Alluvial\",\"temperature_c\":29}'"
		),
	)
	parser.add_argument("csv_path", type=Path, nargs="?", help="CSV of observed farm outcomes")
	parser.add_argument("--self-test", action="store_true", help="run a synthetic smoke test; not an accuracy test")
	parser.add_argument("--evaluate", action="store_true", help="run stratified cross-validation")
	parser.add_argument("--folds", type=int, default=3, help="cross-validation fold count (default: 3)")
	parser.add_argument("--farm-json", help="JSON object containing the farm feature columns")
	parser.add_argument("--save-model", type=Path, help="optional path for the fitted model pickle")
	arguments = parser.parse_args(argv)
	if arguments.self_test:
		if arguments.csv_path:
			parser.error("Do not provide csv_path with --self-test.")
		return _run_self_test()
	if arguments.csv_path is None:
		parser.error("Provide a farm-record CSV path, or use --self-test to check the code without one.")

	try:
		observations = load_observations(arguments.csv_path)
		model = FarmDecisionModel().fit(observations)
		output: dict[str, Any] = {"training_summary": model.training_summary()}
		if arguments.evaluate:
			output["cross_validation"] = model.evaluate(observations, folds=arguments.folds)
		if arguments.farm_json:
			conditions = FarmConditions.from_mapping(json.loads(arguments.farm_json))
			output["recommendations"] = [asdict(item) for item in model.recommend(conditions)]
		elif not arguments.evaluate:
			parser.error("Provide --farm-json for recommendations, --evaluate for metrics, or both.")
		if arguments.save_model:
			model.save(arguments.save_model)
			output["saved_model"] = str(arguments.save_model)
		_print_json(output)
	except (OSError, ValueError, json.JSONDecodeError) as error:
		parser.error(str(error))
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
