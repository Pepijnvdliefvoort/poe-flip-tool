# ⚡ PoE Flip Tool

A modern, real-time market analysis tool for **Path of Exile** currency trading. Track profitable flip opportunities with live market data, beautiful UI, and intelligent caching.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-18+-61DAFB.svg)

---

## 🚀 Features

- **Real-time Market Data**: Stream trade data asynchronously with Server-Sent Events (SSE)
- **Smart Caching**: Intelligent TTL-based caching to avoid rate limits and reduce API load
- **Hot/Cold Trade Marking**: Mark specific trade pairs as "hot" for closer monitoring with visual indicators
- **Whisper Messages**: Click-to-copy whisper messages for quick seller contact
- **Account Information**: View both character and account names for each listing
- **Modern UI**: Clean, compact two-column config panel with currency icons and collapsible pairs
- **Configurable**: Easy-to-manage trade pairs and league settings via REST API
- **Async Loading**: Trades load one-by-one with visual feedback (spinners & placeholder rows)
- **Professional Design**: Dark theme, modern animations, custom scrollbars, and responsive layout
- **Rate Limit Protection**: Soft throttling and hard blocking to prevent API lockouts

---

## 📦 Tech Stack

### Backend
- **FastAPI**: High-performance async Python web framework
- **Uvicorn**: ASGI server for FastAPI
- **Pydantic**: Data validation and settings management
- **Requests**: HTTP library for PoE Trade API calls
- **Python-dotenv**: Environment variable management

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
echo POESESSID=your_session_id_here > .env
echo CF_CLEARANCE=your_cloudflare_clearance_here >> .env

# Run the backend
python -m uvicorn main:app --reload
```

The backend API will be available at `http://localhost:8000`

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Run the dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`

---

## 🎮 Usage

### Basic Workflow
1. **Configure Trade Pairs**: Use the compact config panel on the right to add/remove currency pairs (e.g., Divine → Chaos)
2. **Mark Hot Trades**: Toggle the 🔥/❄️ icon to mark trades you want to monitor closely - hot trades get visual highlighting
3. **Load Market Data**: Click "Load Cached" to fetch current market listings
4. **Analyze Results**: View best rates, average prices, stock levels, account names, and whisper messages
5. **Copy Whisper**: Click any whisper message to copy it to clipboard for quick seller contact
6. **Collapse/Expand**: Use the expand/collapse buttons to manage visibility of trade details

### API Endpoints

#### Config Management
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update full configuration
- `PATCH /api/config/league?league=<name>` - Change league
- `PATCH /api/config/trades` - Add/remove trade pairs

#### Trade Data
- `GET /api/trades/stream?top_n=5&delay_s=2.0` - SSE stream of trade summaries (used by frontend)
- `GET /api/trades?top_n=5` - Get cached trade summaries (JSON)
- `POST /api/trades/refresh?top_n=5` - Force refresh all trades
- `GET /api/rate_limit` - Current rate limit state (blocked flag, remaining seconds, parsed rule states)
- `POST /api/trades/refresh_one?index=<i>&top_n=5` - Refresh a single trade pair (bypasses cache for that pair only)

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
│   ├── models.py            # Pydantic models (TradePair, PairSummary, etc.)
│   ├── trade_logic.py       # PoE Trade API logic, caching & whisper extraction
│   ├── rate_limiter.py      # Rate limiting with soft throttling
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
│   │       ├── TradesTable.tsx    # Market listings with whisper copy
│   │       ├── ConfigPanel.tsx    # Two-column config with hot/cold toggles
│   │       └── CurrencyIcon.tsx   # Currency icons
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