# URL_Check (URL Check)

Standalone microservice for service-level monitoring (not tied to AroundMe domains).

## Own GitHub repository

To publish this folder as a **new** remote repo (copy or subtree split, `git init`, push): **[docs/GITHUB_NEW_REPO.md](docs/GITHUB_NEW_REPO.md)**.

## Scope in this phase

- Real-time service health checks for 500+ services
- Config-driven monitoring via split config files with hot reload
- Environments: `prod`, `UAT`, `UAT2`, `UAT3`
- Regions: `EAST`, `WEST`
- Platforms: `vm`, `k8`
- Categories: `application`, `tool` (tools are first-class monitored entities)
- SLA tracking and error-budget reporting
- Basic anomaly detection (latency spikes + intermittent failures)
- Dashboard with filters, live mode, summary, virtualized service table, and drill-down
- Prometheus metrics for the monitoring platform itself

## Project structure

```
URL_Check/
  backend/
    app/
      api/routes.py
      core/{settings.py,config_loader.py}
      models/schemas.py
      monitoring/{checkers.py,anomaly.py,sla.py,engine.py}
      main.py
    config/
      services_vm.json
      services_k8.json
      services_tools.json
      smoke_tests.json
      patching_tests.json
    requirements.txt
    Dockerfile
  frontend/
    src/
      components/        # includes saas/ (Sidebar, Header, patching cards, LogsDrawer)
      views/             # Dashboard, Services, Smoke, Patching, Alerts, Settings
      context/ThemeContext.jsx
      hooks/useLiveData.js
      lib/api.js
      App.jsx
    Dockerfile
  k8s/
    backend-deployment.yaml
    frontend-deployment.yaml
    checker-cronjob.yaml
  docker-compose.yml
```

## Backend APIs

- `GET /status` - live status of all monitored services
  - query params: `env`, `region`, `platform`, `category`, `app_name`
- `GET /summary` - totals, health split, availability percentage, average latency
- `GET /alerts` - tool-down and multi-tool infra alerts
- `GET /services` - current loaded config
- `GET /anomalies` - currently anomalous services
- `GET /sla` - per-service SLA target, current availability, error budget remaining
- `GET /drilldown/{service_name}` - status history and environment comparison
- `GET /metrics` - Prometheus metrics (checks executed, failed checks, check duration)
- `POST /services/recheck` - on-demand service recheck for selected rows
- `POST /smoke/run`, `GET /smoke/status`, `GET /smoke/history/{brand}`, `GET /smoke/configs`
- `POST /patching/run`, `GET /patching/status`, `GET /patching/history/{group}`, `GET /patching/groups`
- `GET /k8/clusters`, `GET /k8/overview` - external Kubernetes cluster probes (no node login)
- `GET /ssl/certificates`, `GET /ssl/summary` - SSL certificate expiry/issuer/TLS monitoring

### API security

- Mutating endpoints require `X-API-Key` header (`local-dev-key` by default in dev settings).
- Configure keys in backend settings before production rollout.
- Built-in in-memory rate limiting protects protected POST endpoints.
- Audit logs are emitted for protected operations (`services.recheck`, `smoke.run`, `patching.run`).
- Runtime settings and audit APIs:
  - `GET /admin/runtime-settings`
  - `PUT /admin/runtime-settings`
  - `GET /admin/audit/recent`
  - `POST /admin/login`

### Default admin credentials

- Username: `admin`
- Password: `admin`

Update these in runtime settings immediately for production.

### Background cache

- `/k8/*` and `/ssl/*` read from background refreshed cache for low-latency dashboards at scale.
- Default refresh intervals:
  - Kubernetes cache: every 20s
  - SSL cache: every 60s
### Smoke execution modes

- `mode: "api"` (default) — lightweight HTTP step checks; good for internal/mock endpoints.
- `mode: "browser"` — Playwright-based browser checks for real sites protected by bot/JS challenges.

Request example:

```json
{
  "target_url": "https://www.potterybarn.com",
  "mode": "browser"
}
```

## Monitoring logic

- Check types:
  - `https`: healthy when HTTP status is 2xx
  - `tomcat`: healthy when 2xx and body contains keyword (default `running`)
  - `heartbeat`: healthy when 2xx and body contains expected response (default `UP`)
- Status rules:
  - `UP`: healthy and latency within threshold
  - `DOWN`: unreachable or failed validation
  - `DEGRADED`: healthy response but latency above threshold
- Anomaly rules:
  - latency > 2x moving average
  - repeated intermittent failures in sliding window

## Run locally

### 1) Backend

```bash
cd URL_Check/backend
python3 -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or on macOS/Linux: `chmod +x run-dev.sh && ./run-dev.sh`

### 2) Frontend

```bash
cd URL_Check/frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and calls backend `http://localhost:8000`.

### UI

- **Dark-first** premium dashboard (sidebar + header + views). Light mode is available from the header toggle or **Settings**; preference is stored in `localStorage` (`url-checker-theme`).

### Working dashboard logic (frontend)

- **Dashboard provider** (`frontend/src/context/ObservabilityContext.jsx`): polls the real backend every **12s** (interval configurable via `monitoring_settings.json`) (`/status`, `/summary`, `/alerts`, etc.), computes **dynamic metrics**, **failure records** (with error-type classification), **service breakdown**, **AIOps-lite insights**, and merges **API alerts + insights**.
- **Persistence**: time-series samples in `localStorage` (`url-check-metrics-history-v1`), service down-streaks in `url-check-service-streaks-v1`.
- **Patching**: **Run Patching Test** calls `POST /patching/run`, refreshes history, enriches runs with **structured logs** for the drawer.
- **Charts**: [Recharts](https://recharts.org/) — run `npm install` in `frontend/` after pull.

```bash
cd URL_Check/frontend
npm install
npm run dev
```

## Run with Docker

```bash
cd URL_Check
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Prometheus metrics: `http://localhost:8000/metrics`

## Configuration source of truth

Edit these files under `backend/config`; changes are auto-detected and reloaded by the backend loop without restart:

- `services_vm.json`
- `services_k8.json`
- `services_tools.json`
- `smoke_tests.json`
- `patching_tests.json`
- `kubernetes_monitoring.json`

Example service entry:

```json
{
  "name": "user-service",
  "env": "prod",
  "region": "EAST",
  "platform": "k8",
  "category": "application",
  "type": "https",
  "url": "https://api.prod.com/health",
  "team": "accounts",
  "critical": true,
  "sla": 99.9,
  "expected_response": "UP"
}
```

Example patching group entry:

```json
{
  "name": "day2-east-vm",
  "description": "Day-2 EAST VM servers patching validation",
  "targets": {
    "category": "application",
    "platform": "vm",
    "region": "EAST"
  },
  "checks": ["httpd", "tomcat", "url"]
}
```

## Seed 500+ sample services for validation

This project includes a generator plus mock endpoints so you can validate all functions quickly (filters, summary, anomalies, drill-down, SLA, DEGRADED/DOWN states):

```bash
cd URL_Check
python backend/scripts/generate_sample_services.py
```

Then restart backend container/app once:

```bash
docker compose restart url-check-backend
```

Validation behavior in sample set (520 services):

- healthy services (`UP`)
- slow services (`DEGRADED`)
- hard-failing services (`DOWN`)
- intermittent services (`ANOMALOUS` after a few cycles)

## Not included in Phase 1

- Business flow monitoring (login, cart, checkout, payment)
- Deep ML anomaly models
- Full Elasticsearch dashboards
