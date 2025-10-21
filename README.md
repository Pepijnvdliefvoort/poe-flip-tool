# ⚡ PoE Flip Tool

A modern, real-time market analysis tool for **Path of Exile** currency trading. Track profitable flip opportunities with live market data, beautiful UI, and intelligent caching.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-18+-61DAFB.svg)

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
- `VITE_ACCOUNT_NAME` - Your PoE account name (e.g., iNeoxiz#3422) to highlight your own trades with a subtle blue background

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