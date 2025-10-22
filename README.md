# ⚡ PoE Flip Tool

A modern, real-time market analysis tool for **Path of Exile** currency trading. Track profitable flip opportunities with live market data, beautiful UI, and intelligent caching.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-18+-61DAFB.svg)

[![Backend CI](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/backend-ci.yml)
[![Deploy to Fly.io](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/deploy-fly.yml/badge.svg)](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/deploy-fly.yml)
[![Frontend Pages](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/frontend-pages.yml/badge.svg)](https://github.com/Pepijnvdliefvoort/poe-flip-tool/actions/workflows/frontend-pages.yml)

---

## 🚀 Features

- **Real-time Market Data**: Stream trade data asynchronously with Server-Sent Events (SSE)
- **Smart Caching**: Intelligent TTL-based caching to avoid rate limits and reduce API load
- **SQLite Persistence**: Cache and price history survive application restarts with automatic database management
- **Price Trend Indicators**: Inline micro sparkline + % change (direction colored) showing recent momentum
- **Historical Price Tracking**: 7-day (configurable) price history with automatic snapshot recording
- **Hot/Cold Trade Marking**: Mark specific trade pairs as "hot" for closer monitoring with visual indicators
- **Whisper Messages**: Click-to-copy whisper messages for quick seller contact with fade animations
- **Account Information**: View account names for each listing
- **Personal Trade Highlighting**: Configure your account name to automatically highlight your own listings with a blue glow
- **Modern UI**: Clean, compact sidebar with currency icons, custom form controls, and responsive layout
- **Configurable**: Easy-to-manage trade pairs and league settings via REST API
- **Async Loading**: Trades load one-by-one with visual feedback (spinners & placeholder rows)
- **Professional Design**: Dark theme, smooth transitions, custom scrollbars with SVG styling
- **Rate Limit Protection**: Soft throttling and hard blocking to prevent API lockouts
- **System Dashboard**: In-app view to inspect cache entries, expirations, historical snapshot counts, and database stats

---

## 📦 Tech Stack

### Backend
- **FastAPI**: High-performance async Python web framework
- **Uvicorn**: ASGI server for FastAPI
- **Pydantic**: Data validation and settings management
- **Requests**: HTTP library for PoE Trade API calls
- **Python-dotenv**: Environment variable management
- **SQLite3**: Built-in Python database for persistent storage (cache and price history)

### Frontend
- **React 18**: Modern UI library with hooks
- **TypeScript**: Type-safe JavaScript
- **Vite**: Lightning-fast build tool and dev server
- **CSS3**: Custom styling with modern animations

---

## 🛠️ Setup & Installation

### Prerequisites
- **Python 3.8+**
- **Node.js 16+** & npm
- **PoE Account Credentials** (POESESSID and CF_CLEARANCE cookies)

### 1. Clone the Repository
```bash
git clone https://github.com/Pepijnvdliefvoort/poe-flip-tool.git
cd poe-flip-tool
```

### 2. Backend Setup
```bash
cd backend

# Install dependencies
py -m pip install -r requirements.txt

# Create .env file with your PoE credentials
# Copy the example file and edit it
copy .env.example .env
# Then edit .env with your actual POESESSID and CF_CLEARANCE

# Run the backend
python -m uvicorn main:app --reload
```

**Configuration Options** (Optional - edit `.env` file):
- `CACHE_TTL_SECONDS` - Cache expiration time (default: 900 = 15 min)
- `HISTORY_RETENTION_HOURS` - How long to keep price history (default: 168 = 7 days)
- `HISTORY_MAX_POINTS` - Max snapshots per pair retained in memory (default: 100)
- `SPARKLINE_POINTS` - Down-sampled points used for inline sparkline (default: 30)
- `LOG_LEVEL` - Logging verbosity: DEBUG, INFO, WARNING (default: INFO)
- `POE_SOFT_RATIO` - Rate limit soft throttle threshold (default: 0.8)
- `POE_SOFT_SLEEP_FACTOR` - Throttle sleep factor (default: 0.05)

See `.env.example` for detailed descriptions of all options.

The backend API will be available at `http://localhost:8000`

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Create .env file (optional - for highlighting your own trades)
# Copy the example file and edit it
copy .env.example .env
# Then edit .env with your actual account name (e.g., YourName#1234)

# Run the dev server
npm run dev
```

**Configuration Options** (Optional - edit `frontend/.env` file):
- `VITE_API_BASE` - Backend API URL (default: http://localhost:8000)
- `account_name` (stored in `backend/config.json` and editable in the UI) - Your PoE account name (e.g., iNeoxiz#3422). Trades matching this value are highlighted. Supports comma-separated list for multiple names.

See `frontend/.env.example` for the template.

The frontend will be available at `http://localhost:5173`

---

## 🎮 Usage

### Basic Workflow
1. **Configure Trade Pairs**: Use the config panel sidebar to add/remove currency pairs and adjust "Top Results" slider
2. **Select League**: Choose your league from the dropdown
3. **Load Market Data**: Click "Refresh Trades" to fetch live market data (bypasses cache)
4. **View Trends**: Check the trend indicators (📈📉➡️) to see if prices are rising, falling, or stable
5. **Analyze Results**: View best rates, profit calculations, stock levels, and account names
6. **Copy Whisper**: Click any whisper message to copy it to clipboard - shows "✓ Copied!" confirmation
7. **View History**: Open `http://localhost:8000/api/history/<have>/<want>` to see detailed price snapshots

### API Endpoints

#### Config Management
- `GET /api/config` - Get current configuration
- `PATCH /api/config/league` - Change league (body: `{"value": "Standard"}`)
- `PATCH /api/config/pairs` - Update trade pairs (body: `{"value": [["chaos", "divine"], ...]}`)
- `PATCH /api/config/top_n` - Set number of results per pair (body: `{"value": 5}`)

#### Trade Data
- `GET /api/trades/stream?force=false` - SSE stream of trade summaries (used by frontend)
- `POST /api/trades/refresh_one` - Refresh a single trade pair (body: `{"have": "chaos", "want": "divine"}`)

#### Price History
- `GET /api/history/{have}/{want}?max_points=20` - Get historical price snapshots for a currency pair

#### System
- `GET /api/rate_limit` - Current rate limit state (blocked flag, remaining seconds, parsed rule states)
- `GET /api/cache/status` - Per-configured pair cache presence and seconds until expiry
- `GET /api/cache/summary` - Aggregate cache + historical statistics (entries, soonest expiry, snapshot counts)
- `GET /api/database/stats` - SQLite database statistics (size, entry counts, oldest/newest snapshots)

#### Stash
- `GET /api/stash/{tab_name}` - Fetch a specific stash tab by its name (uses configured `account_name` & league). Returns 404 if the tab is not found, 400 if no account name configured. Example: `/api/stash/currency`.
#### Valuations
- `GET /api/value/latest` - Latest divine-equivalent value for each unique configured currency (uses historical snapshots; returns null values if no data). Used by Profit Tracker.

### Profit Tracker
The Profit Tracker tab ("Profit" in the header) lets you take manual portfolio snapshots of your `currency` stash tab, persist them, and view a historical chart of total Divine value over time.

New Portfolio Endpoints:
- `POST /api/portfolio/snapshot` – Computes current stash quantities + valuations and stores a snapshot row (returns the snapshot payload).
- `GET /api/portfolio/history?limit=120` – Returns most recent N stored snapshots with breakdowns.
- `GET /api/portfolio/scheduler_status` – Returns runtime metadata for the background snapshot scheduler (enabled flag, last success, last error, last total, run count, interval).

Snapshot Workflow:
1. Click "Snapshot Now".
2. Backend fetches `/api/stash/currency` (server-side), loads latest valuations via `/api/value/latest`, computes per-currency totals, and stores the aggregate.
3. Response includes: `timestamp`, `total_divines`, detailed `breakdown`, and `saved` boolean.
4. Frontend appends to in-memory history for a smooth chart update.

Valuation Logic Recap:
- If tracked pair is `chaos -> divine` (pay chaos, get divine): best_rate = chaos per 1 divine, so 1 chaos = 1 / best_rate divine.
- If tracked pair is `divine -> chaos` (pay divine, get chaos): best_rate = divine per 1 chaos (already per-unit divine cost); invert only when pay != divine.
- Missing data produces `null` divine_per_unit and `null` total_divine for that currency.

Displayed Columns (each snapshot breakdown):
- Currency key
- Quantity (summed stack sizes in the tab)
- Divine / Unit (derived or null)
- Total (quantity * divine per unit or null)
- Source Pair (e.g. `chaos->divine` or `divine->exalted`)

Chart Rendering:
- Frontend renders a sparkline of `total_divines` across snapshots.
- Points are ordered chronologically; last point annotated with current total.

Data Retention:
- Snapshots persist in SQLite (`portfolio_snapshots` table).
- Retrieval limit defaults to backend parameter (up to 1000). Client currently requests last 120.

Failure Modes & Notes:
- If no `account_name` configured, snapshot endpoint returns 400.
- If stash tab named `currency` not found, snapshot fails (ensure tab name matches exactly, case-insensitive match performed server-side).
- Valuations may be partially null if insufficient historical trade data yet.

#### Automatic Background Snapshots (Headless Tracking)
As of the latest update, the backend now maintains portfolio snapshots automatically even when the Profit Tracker tab (or the entire frontend) is closed.

Scheduler Behavior:
- Starts on backend startup (can be disabled via env var below)
- Runs every 15 minutes by default (interval configurable)
- Skips if `account_name` is not set in `backend/config.json`
- Persists a snapshot exactly like the manual endpoint
- Logs success or errors; most recent metadata available via `/api/portfolio/scheduler_status`

Environment Variables:
| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_PORTFOLIO_SCHEDULER` | `1` | Set to `0` to disable background snapshots |
| `PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS` | `900` | Interval between automatic snapshots (seconds) |

Example override (Windows Powershell):
```powershell
$env:ENABLE_PORTFOLIO_SCHEDULER="1"; $env:PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS="600"; uvicorn main:app --reload
```

The frontend will still take an immediate snapshot on page load (and every 15 minutes while open) — the background scheduler simply ensures continuity if the UI is not active.

### Data Persistence

The application automatically persists cache entries and price history to a SQLite database (`backend/poe_cache.db`). This provides several benefits:

- **Restart Resilience**: Cache entries and historical snapshots survive application restarts
- **Faster Startup**: Previously cached data is immediately available without API calls
- **Historical Analysis**: All price snapshots are retained up to the configured retention period (7 days default)
- **Automatic Cleanup**: Expired cache entries and old snapshots are automatically pruned

The database is created automatically on first run. No manual setup is required. The file location is:
- `backend/poe_cache.db` (relative to the backend directory)

**Database Schema**:
- `cache_entries`: Stores cached API responses with TTL expiration
- `price_snapshots`: Stores historical price observations with timestamps

View database statistics via the System Dashboard or the `/api/database/stats` endpoint.

### In-App System Dashboard
Switch to the "System" tab in the header to view:
- **Database Persistence**: File location, size, and entry/snapshot counts
- Live cache summary (auto refresh every 15s)
- Cache entry table with remaining TTL per pair
- Historical snapshot counts and retention parameters
- Interactive history viewer (select pair → mini chart + table)

---

## ⏱️ Rate Limiting (PoE Trade API)

The Path of Exile trade API enforces IP and Account based rate limits. When you approach or exceed limits, headers are returned that look like:

```
X-Rate-Limit-Rules: Account,Ip
X-Rate-Limit-Ip: 7:15:60,15:90:120,45:300:1800
X-Rate-Limit-Ip-State: 1:15:0,0:90:14,40:300:1555
X-Rate-Limit-Account: 3:5:60
X-Rate-Limit-Account-State: 1:5:0
Retry-After: 1555   <-- only present when hard limited
```

Each triple in a `*-State` header is interpreted as:

```
current_requests : limit : seconds_until_reset
```

If `current_requests >= limit` and `seconds_until_reset > 0`, further requests for that rule must pause until the window resets. A `Retry-After` header indicates a global lockout duration.

### Internal Handling

This project includes a conservative rate limiter (`backend/rate_limiter.py`) which:

1. Blocks all outgoing requests while any hard block is active (rule exceeded or `Retry-After`).
2. Applies a soft throttle when utilization > 80% of a rule: sleeps briefly to smooth bursts.
3. Parses both `Ip` and `Account` rule states; falls back gracefully if some headers are missing.

### How It Works in Code

The request flow (`trade_logic._post_exchange`):

1. `rate_limiter.wait_before_request()` ensures we don't fire while blocked.
2. The request is sent.
3. Response headers are passed to `rate_limiter.on_response(resp.headers)` to update state.

### Viewing Current State

You can introspect parsed rule state using:

```python
from rate_limiter import rate_limiter
print(rate_limiter.debug_state())  # {'Ip': [(current, limit, reset_s), ...], 'Account': [...]} 
```

### Tips to Avoid Lockouts

- Keep `top_n` modest (e.g. 5–10) to reduce per-request payload.
- Increase caching TTL rather than spamming refresh.
- Use the SSE endpoint (`/api/trades/stream`) with a delay (`delay_s`) to naturally spread requests.
- Avoid triggering manual refresh in rapid succession.
- Tune soft throttling via environment variables:
	- `POE_SOFT_RATIO` (default 0.8) – utilization threshold to start soft sleeps
	- `POE_SOFT_SLEEP_FACTOR` (default 0.05) – fraction of remaining window to sleep when above threshold
	- See `backend/.env.example` for guidance.

### If You Are Locked Out

The backend will automatically pause until the block expires. You may see log lines like:

```
[WARNING] PoE global Retry-After received (1555s). Blocking until <timestamp>.
```

During this time requests queue and will resume after expiry. Consider lengthening cache TTL or lowering polling frequency.

### Future Enhancements

Potential improvements:
- Adaptive backoff scaling based on moving average of utilization.
- Async version of rate limiter for fully non-blocking SSE streaming.
- Distributed coordination if multiple backend instances share one IP.

---

---

## 📁 Project Structure

```
poe-flip-tool/
├── backend/
│   ├── main.py              # FastAPI app & routes
│   ├── models.py            # Pydantic models (ListingSummary, PairSummary, etc.)
│   ├── trade_logic.py       # PoE API logic, caching, historical tracking
│   ├── rate_limiter.py      # Rate limiting with soft throttling
│   ├── persistence.py       # SQLite database persistence layer
│   ├── poe_cache.db         # SQLite database (auto-created)
│   ├── config.json          # Trade pair configuration
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Environment variables (POESESSID, CF_CLEARANCE)
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main React component with SSE streaming
│   │   ├── api.ts           # API client
│   │   ├── types.ts         # TypeScript types
│   │   ├── spinner.css      # Loading animations
│   │   └── components/
│   │       ├── TradesTable.tsx      # Market listings with whisper copy & trends
│   │       ├── ConfigPanel.tsx      # Sidebar config with league/pairs/top_n
│   │       ├── SystemDashboard.tsx  # System monitoring & database stats
│   │       └── CurrencyIcon.tsx     # Currency icons
│   ├── public/
│   │   └── currency/        # Currency icon images
│   ├── index.html           # HTML entry & global CSS
│   ├── package.json         # Node dependencies
│   └── vite.config.ts       # Vite configuration with proxy
└── README.md                # You are here!
```

---

## 🎨 Contributing

We follow [gitmoji](https://gitmoji.dev/) for commit messages! Use emojis to make your commits more expressive:

```bash
✨ feat: Add new feature
🐛 fix: Fix a bug
📝 docs: Update documentation
♻️ refactor: Code refactoring
🎨 style: Improve UI/styling
⚡️ perf: Performance improvements
```

---

## 📝 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Path of Exile Trade API](https://www.pathofexile.com/trade) for market data
- [FastAPI](https://fastapi.tiangolo.com/) for the awesome Python framework
- [Vite](https://vitejs.dev/) for blazing-fast dev experience
- [gitmoji](https://gitmoji.dev/) for making commits fun!

---

## 📞 Support

If you encounter any issues or have questions:
- Open an [issue](https://github.com/Pepijnvdliefvoort/poe-flip-tool/issues)
- Check the [PoE Trade API documentation](https://www.pathofexile.com/trade)

---

**Happy flipping!** 💰⚡

---

## 🌐 Deployment & CI/CD

This repo now includes containerization & GitHub Actions workflows so you can host without running locally every time.

### Frontend Hosting (GitHub Pages)
The workflow `.github/workflows/frontend-pages.yml` builds the React app with Vite and deploys the static bundle to GitHub Pages on pushes to `main` or `develop` (adjust branches as needed). Enable Pages in your repository settings ("Deploy from GitHub Actions").

If your backend is hosted somewhere else, set `VITE_API_BASE` at build time (either via a secret or by hardcoding in `frontend/.env`). Currently the workflow builds with defaults; you can modify the build step:

```yaml
			- name: Build frontend
				working-directory: frontend
				env:
					VITE_API_BASE: https://your-backend.example.com
				run: npm run build
```

### Backend Hosting (Container Image)
The workflow `.github/workflows/backend-ci.yml` runs tests and then builds a Docker image and pushes it to GitHub Container Registry (GHCR) as:

```
ghcr.io/<OWNER>/poe-flip-backend:latest
```

You can deploy this image on any container host (Render, Fly.io, Railway, Azure Container Apps, AWS ECS, etc.). Provide required environment variables there—DO NOT bake your PoE session cookies into the image.

### Required Backend Environment Variables

| Variable | Purpose | Sensitive |
|----------|---------|-----------|
| `POESESSID` | PoE auth cookie for trade API requests | Yes |
| `CF_CLEARANCE` | Cloudflare clearance cookie | Yes |
| `CACHE_TTL_SECONDS` | Cache entry TTL (seconds) | No |
| `HISTORY_RETENTION_HOURS` | Snapshot retention | No |
| `HISTORY_MAX_POINTS` | Max snapshots kept per pair | No |
| `SPARKLINE_POINTS` | Down-sample points for trend sparkline | No |
| `LOG_LEVEL` | Logging verbosity | No |

Set the sensitive ones (`POESESSID`, `CF_CLEARANCE`) as platform secrets or GitHub Actions secrets. Example (Render/Fly): add them in the dashboard UI. For GitHub Actions self-deploy, add secrets in repo settings, then reference in a deploy job.

### Local Docker Run

```bash
# Build images
docker build -f backend/Dockerfile -t poe-flip-backend:latest .
docker build -f frontend/Dockerfile -t poe-flip-frontend:latest .

# Run backend with env file
docker run --env-file backend/.env -p 8000:8000 poe-flip-backend:latest

# Run frontend (served via nginx container)
docker run -p 5173:80 poe-flip-frontend:latest
```

Or create a `docker-compose.yml` (optional) to run both containers together and set `VITE_API_BASE` to the backend service name.

### Example docker-compose.yml (Optional)

```yaml
services:
	backend:
		build:
			context: .
			dockerfile: backend/Dockerfile
		env_file: backend/.env
		ports:
			- "8000:8000"
	frontend:
		build:
			context: .
			dockerfile: frontend/Dockerfile
		environment:
			VITE_API_BASE: http://backend:8000
		ports:
			- "5173:80"
```

### Adding a Backend Deploy Step

Extend `backend-ci.yml` with a deploy job after the image push. Example (Render deploy using Render API token):

```yaml
	deploy:
		runs-on: ubuntu-latest
		needs: build-image
		steps:
			- name: Trigger Render Deploy
				run: |
					curl -X POST \ 
						-H "Authorization: Bearer ${{ secrets.RENDER_API_KEY }}" \ 
						-H "Content-Type: application/json" \ 
						-d '{"serviceId":"<your-service-id>"}' \ 
						https://api.render.com/v1/services/<your-service-id>/deploys
```

### Secret Management Tips
- Never commit `.env` files.
- Use placeholder `.env.example` to document required keys.
- Rotate `POESESSID` if you change passwords/log out; builds using old values will fail authentication silently.
- Limit log level in production to avoid leaking header data: set `LOG_LEVEL=INFO`.

### Production Hardening Ideas
- Add a simple API key layer (e.g., header check middleware) if exposing publicly.
- Enable CORS only for your frontend origin.
- Add request tracing & structured logging (JSON) if scaling.
- Consider rate limiting at reverse proxy (nginx or Fly proxy) to further protect PoE API usage.

### Frontend Base URL Configuration
Set `VITE_API_BASE` to your deployed backend URL. If omitted, the frontend may default to localhost, which won’t work for remote hosting.

### Verification Checklist Before First Deploy
1. Secrets added to hosting platform (POESESSID, CF_CLEARANCE).
2. Backend reachable at `/` returning status ok.
3. Frontend built with correct `VITE_API_BASE`.
4. SSE endpoint `/api/trades/stream` reachable from the hosted frontend (watch network console for CORS issues).
5. Cache & history endpoints return JSON (spot-check /api/cache/summary).

---

## 🤖 CI/CD Summary

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `backend-ci.yml` | Test + build + push backend container image | Push/PR to backend paths |
| `frontend-pages.yml` | Build & deploy static frontend to Pages | Push to main/develop |

Add more jobs (lint, security scan, mypy) as the project grows.

### 🚀 Fly.io Quick Deploy

Included files: `fly.toml`, `deploy-fly.yml` workflow.

Initial setup (one time):
```bash
fly auth signup   # or: fly auth login
fly volumes create db_data --region ams --size 3
fly secrets set POESESSID=your_sess CF_CLEARANCE=your_clearance
```

Deploy manually (local):
```bash
fly deploy
```

Or trigger GitHub Action (ensure `FLY_API_TOKEN` secret configured):
```bash
fly tokens create deploy   # copy value -> GitHub repo settings -> Secrets -> Actions -> FLY_API_TOKEN
```

Environment variable `DB_PATH` points SQLite to the mounted volume at `/data/poe_cache.db`.

After deploy, update frontend build env `VITE_API_BASE=https://poe-flip-backend.fly.dev` and redeploy Pages.

---

## 🔐 Updating Secrets
When your PoE cookies expire: update repository or platform secrets. No image rebuild needed if host passes them at runtime. If using Render/Fly env vars, just edit in dashboard and restart.

---

## ❓ Need Help Deploying?
Open an issue describing your target platform, and we can add a tailored deploy workflow.

---