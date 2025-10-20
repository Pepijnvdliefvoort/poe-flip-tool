# ⚡ PoE Flip Tool

A modern, real-time market analysis tool for **Path of Exile** currency trading. Track profitable flip opportunities with live market data, beautiful UI, and intelligent caching.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-18+-61DAFB.svg)

---

## 🚀 Features

- **Real-time Market Data**: Stream trade data asynchronously with Server-Sent Events (SSE)
- **Smart Caching**: Intelligent TTL-based caching to avoid rate limits and reduce API load
- **Modern UI**: Clean, compact interface with currency icons, collapsible pairs, and loading animations
- **Configurable**: Easy-to-manage trade pairs and league settings via REST API
- **Async Loading**: Trades load one-by-one with visual feedback (spinners & placeholder rows)
- **Professional Design**: Dark theme, modern animations, and responsive layout

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

# Create and activate virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

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
1. **Configure Trade Pairs**: Use the config panel on the right to add/remove currency pairs (e.g., Divine → Chaos)
2. **Load Market Data**: Click "Load Cached" to fetch current market listings
3. **Analyze Results**: View best rates, average prices, stock levels, and seller information
4. **Collapse/Expand**: Use the expand/collapse buttons to manage visibility

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

---

## 📁 Project Structure

```
poe-flip-tool/
├── backend/
│   ├── main.py              # FastAPI app & routes
│   ├── models.py            # Pydantic models
│   ├── trade_logic.py       # PoE Trade API logic & caching
│   ├── config.json          # Trade pair configuration
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main React component
│   │   ├── api.ts           # API client
│   │   ├── types.ts         # TypeScript types
│   │   ├── spinner.css      # Loading animations
│   │   └── components/
│   │       ├── TradesTable.tsx    # Market listings display
│   │       ├── ConfigPanel.tsx    # Configuration UI
│   │       └── CurrencyIcon.tsx   # Currency icons
│   ├── index.html           # HTML entry & global CSS
│   ├── package.json         # Node dependencies
│   └── vite.config.ts       # Vite configuration
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