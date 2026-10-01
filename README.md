# Krishi Bandhu

An AI model for farmers.

Krishi Bandhu is a local-first farming assistant with a static browser frontend and a Python API backend. The frontend serves weather and chat features; crop recommendations use the Python model when a trained model artifact is available.

## Project Layout

```text
frontend/
  index.html
  ai-chat.js
  farm-decision-model.js
  script.js
  style.css
backend/
  app.py
  ml_model.py
  requirements.txt
.github/workflows/
  python-checks.yml
render.yaml
.python-version
```

The page currently keeps its primary markup, styles, and UI logic in `frontend/index.html`. `script.js` and `style.css` are preserved from the original prototype and are not loaded by that page.

## Run In VS Code

Open the workspace root in VS Code, then run these commands in the integrated PowerShell terminal:

```powershell
& ".\.venv\Scripts\python.exe" -m pip install -r ".\backend\requirements.txt"
& ".\.venv\Scripts\python.exe" backend\ml_model.py --self-test
& ".\.venv\Scripts\python.exe" -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000>. The API health endpoint is <http://127.0.0.1:8000/api/health>; interactive API docs are at <http://127.0.0.1:8000/docs>. Stop the server with `Ctrl+C` in the terminal.

The self-test uses generated records only to check that the code runs. It is not a real-world accuracy test. Without a trained model, the backend reports `training_data_required`; the crop form then uses the clearly labeled local demo ranker.

The repository includes a public ICRISAT historical climate/yield workbook in `backend/data/`. Its source, CC BY 4.0 attribution, schema, and limitations are documented in [`backend/data/README.md`](backend/data/README.md). This raw workbook is not automatically loaded or treated as a complete training dataset.

## Train With Farm Records

The full crop and profitability model needs observed, labeled farm outcomes. Do not use the browser's illustrative crop benchmarks as training labels. The included ICRISAT data contains historical district-level climate and yields but has no measured soil nutrients, current prices, or cultivation costs. It cannot be fed directly to the full model or validate profit predictions. Prepare a CSV with at least 30 rows, at least 3 crop types, and at least 5 observations per crop. Each row should represent a real farm outcome with units recorded consistently.

Required CSV headers:

```text
season,soil_type,irrigation_available,temperature_c,rainfall_mm,humidity_pct,soil_ph,nitrogen_kg_ha,phosphorus_kg_ha,potassium_kg_ha,crop,yield_quintals_per_acre,price_rupees_per_quintal,cost_rupees_per_acre
```

The weather, soil nutrient, price, and cost values may be blank when unavailable, but the headers must exist. `season`, `soil_type`, `crop`, and yield are required for every row. Use measured values and consistent units; missing field observations should not be filled with invented values.

For example, place your private file at `backend/farm_records.csv`, then train and save the model:

```powershell
& ".\.venv\Scripts\python.exe" backend\ml_model.py backend\farm_records.csv --evaluate --save-model backend\farm_model.pkl
```

Restart Uvicorn after training. The backend loads `backend/farm_model.pkl` when it starts. To load an artifact elsewhere, set `FARM_MODEL_PATH` before starting the server. Local CSV files and pickle artifacts are excluded from Git. Only load pickle files you created or otherwise trust.

Cross-validation scores apply only to the supplied dataset and do not guarantee performance in another district, season, or farm. The Bayesian posterior is not calibrated confidence, and model advice should be checked with local agricultural extension services.

## Publish With GitHub And Render

The GitHub repository is `iman2004-explorer/krishi-bandhu`; the app and deployment configuration are published on `main`. This workspace is initialized with that repository configured as `origin`. Do not upload private farm CSV files, `.pkl`/`.joblib` model artifacts, credentials, or the `.venv` folder; `.gitignore` excludes these local/private files. The attributed public workbook under `backend/data/` is intentionally included.

Before committing, configure a Git author for this repository. Use your preferred name and GitHub email (a GitHub noreply email is fine):

```powershell
git config user.name "Your Name"
git config user.email "your-github-email@example.com"
git status --short
git commit -m "Prepare Krishi Bandhu for deployment"
git fetch origin main
git merge origin/main --allow-unrelated-histories
git push -u origin main
```

The remote has an independent initial commit, so Git may ask you to resolve a README merge conflict. Keep the expanded local README; it includes the original project tagline. Review `git status --short` before committing to ensure only intended source/configuration files are staged. Complete GitHub authentication through Git Credential Manager; never paste an access token into source files or chat.

In Render, choose **New + → Blueprint**, connect `iman2004-explorer/krishi-bandhu`, and deploy. Render reads `render.yaml`; the included GitHub Actions workflow runs Python compile and model smoke checks on pushes and pull requests. After deployment, open the Render service URL and check `/api/health` and `/docs` if needed. The free Render plan may sleep while idle and is not a high-availability or autoscaling configuration; select a paid instance and configure monitoring/backups before production use.

### Model Artifact Requirement

The repository contains one public district-level climate/yield dataset, but it does not contain a complete farm-level training dataset or a trained model. A deployment without `backend/farm_model.pkl` serves the site and uses the labeled browser demo for crop comparisons/recommendations; the Python recommendation endpoint reports that training data is required. The `--self-test` model uses synthetic data and is not a real accuracy test.

For real model recommendations, train from verified farm observations, then provide the resulting trusted model artifact to the deployed service using a storage location that survives redeploys and set Render's `FARM_MODEL_PATH` environment variable to that file. Render's free filesystem is ephemeral, so a free instance cannot reliably keep a model artifact uploaded at runtime. Do not train on or publish fabricated benchmark records.
