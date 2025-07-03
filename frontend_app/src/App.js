import React, { useState, useEffect } from "react";
import "./App.css";

/*
  Frontend for Detective Game:
  - Suspects panel (randomuser.me avatars, names, seats, habits)
  - Interactive clue search area
  - Clue board for found clues
  - Search counter
  - Final guess and result feedback
  - Timeline replay on loss
  - Responsive, modern minimal styling
  - API: /start-game, /search-area, /submit-guess
  - Theme toggle adhering to provided color palette
*/

// === Utility: randomuser fallback — (should match backend, but just in case) ===
function placeholderAvatar(seed) {
  // Generate a consistent cartoon avatar using Adorable Avatars API
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=fbfaff,de7c7c,7d545a`;
}

// === Color variables from requirements ===
const COLOR_PRIMARY = "#de7c7c";
const COLOR_SECONDARY = "#7d545a";
const COLOR_ACCENT = "#fbfaff";

// === UI Panel Layout Map ===
const CLUE_AREAS = [
  { key: "luggage", label: "Luggage" },
  { key: "cctv", label: "CCTV" },
  { key: "restroom", label: "Restroom" },
  { key: "seat_logs", label: "Seat Logs" },
  { key: "audio", label: "Audio" },
];

/*
  === Fetch helpers & Backend URL resolver ===
  Uses:
    1. REACT_APP_BACKEND_URL (from .env, best for deployment/dev)
    2. If not set: window.location.origin (assumes backend proxied at same domain/port)
    3. If window not available, or origin is localhost, default to localhost:3001
*/
function getApiBase() {
  // 1. If env set at build, use that
  if (process.env.REACT_APP_BACKEND_URL)
    return process.env.REACT_APP_BACKEND_URL.replace(/\/+$/, "");
  // 2. If running in browser, use same origin
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    // If hosted locally on port 3000, fallback to 3001 for dev
    if (window.location.hostname === "localhost" && window.location.port === "3000") {
      return "http://localhost:3001";
    }
    return window.location.origin;
  }
  // 3. Fallback: dev
  return "http://localhost:3001";
}
const API_BASE = getApiBase();

async function fetchStartGame() {
  const resp = await fetch(`${API_BASE}/start-game`, { method: "GET" });
  if (!resp.ok) throw new Error("Failed to start new game.");
  return resp.json();
}

async function fetchSearchArea(gameId, areaKey) {
  const resp = await fetch(`${API_BASE}/search-area`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, area: areaKey }),
  });
  if (!resp.ok) throw new Error("Failed to search area.");
  return resp.json();
}

async function fetchSubmitGuess(gameId, suspectId) {
  const resp = await fetch(`${API_BASE}/submit-guess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, suspect_id: suspectId }),
  });
  if (!resp.ok) throw new Error("Failed to submit guess.");
  return resp.json();
}

// === Main Detective Game Component ===
function App() {
  const [theme, setTheme] = useState("light");
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [game, setGame] = useState(null); // {id, suspects, clues, etc}
  const [suspects, setSuspects] = useState([]);
  const [cluesDiscovered, setCluesDiscovered] = useState([]);
  const [searchCounter, setSearchCounter] = useState(0);
  const [searchLimit, setSearchLimit] = useState(3); // default, override with backend value
  const [searchFeedback, setSearchFeedback] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [guessResult, setGuessResult] = useState(null);
  const [replayTimeline, setReplayTimeline] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [searchingAreaKey, setSearchingAreaKey] = useState(null);

  // Theme application effect
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // On mount: start new game
  useEffect(() => {
    async function init() {
      setLoading(true);
      setSearchFeedback("");
      setGuessResult(null);
      setReplayTimeline(null);
      setGameOver(false);
      try {
        const data = await fetchStartGame();
        setGame(data);
        setSuspects(data.suspects || []);
        setCluesDiscovered([]);
        setSearchCounter(0);
        setSearchLimit(data.searches_remaining || 3);
        setGuessInput("");
        setSelectedArea(null);
      } catch (e) {
        setSearchFeedback("Failed to initialize game! Check backend connection.");
      }
      setLoading(false);
      setInitializing(false);
    }
    init();
  }, []); // on mount

  // Handle theme toggle
  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // --- Search Area Handler
  async function handleAreaSearch(areaKey) {
    if (!game || gameOver || searchingAreaKey) return;
    setSearchingAreaKey(areaKey);
    setSearchFeedback("");
    try {
      const resp = await fetchSearchArea(game.id, areaKey);
      // resp: {success: bool, clue: obj|null, searches_remaining, already_searched, feedback, clues_found[optional]}
      if (resp.already_searched) {
        setSearchFeedback("You've already searched that area.");
      } else if (resp.success && resp.clue) {
        setCluesDiscovered((prev) => {
          if (prev.find((c) => c.id === resp.clue.id)) return prev;
          return [...prev, resp.clue];
        });
        setSearchFeedback(
          <span>
            <b>Clue found!</b> {resp.clue.text}
          </span>
        );
      } else if (resp.success && !resp.clue) {
        setSearchFeedback("No useful clue found here.");
      } else {
        setSearchFeedback(resp.feedback || "Invalid action or area.");
      }
      setSearchCounter((prev) => prev + 1);
      setSearchLimit(resp.searches_remaining ?? searchLimit - 1);
      if (resp.searches_remaining === 0) setGameOver(true);
    } catch {
      setSearchFeedback("Error while searching area.");
    }
    setSearchingAreaKey(null);
  }

  // --- Final Guess Handler
  async function handleGuessSubmit(e) {
    e.preventDefault();
    if (!guessInput) return;
    setGuessResult("pending");
    setSearchFeedback("");
    try {
      const resp = await fetchSubmitGuess(game.id, guessInput);
      if (resp.result === "win") {
        setGuessResult("win");
        setGameOver(true);
        setSearchFeedback("🎉 Correct! You solved the case.");
      } else if (resp.result === "lose") {
        setGuessResult("lose");
        setGameOver(true);
        setSearchFeedback("Incorrect guess. The killer got away!");
        if (resp.timeline) {
          setReplayTimeline(resp.timeline);
        }
      } else {
        setSearchFeedback(resp.feedback || "Guess failed.");
      }
    } catch {
      setGuessResult("error");
      setSearchFeedback("Error submitting guess.");
    }
  }

  // --- Replay Handler (on lose) ---
  function TimelineReplay({ timeline }) {
    if (!timeline || timeline.length === 0) return null;
    return (
      <div className="timeline-replay">
        <h3 style={{ color: COLOR_SECONDARY }}>Timeline Replay</h3>
        <ul>
          {timeline.map((step, idx) => (
            <li key={idx}>
              <span style={{ fontWeight: "bold" }}>{step.time || `Step ${idx + 1}`}:</span>{" "}
              {step.event || JSON.stringify(step)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // --- Suspect Card ---
  function SuspectCard({ suspect, highlightKiller }) {
    const isKiller =
      gameOver &&
      guessResult &&
      ((guessResult === "win" && guessInput === suspect.id) ||
        (guessResult === "lose" && game?.killer_id && game.killer_id === suspect.id));
    return (
      <div
        className={`suspect-card${isKiller ? " killer" : ""}`}
        style={{
          border: isKiller
            ? `2px solid ${COLOR_PRIMARY}`
            : `1.5px solid ${COLOR_SECONDARY}`,
          background: isKiller
            ? "rgba(222,124,124,0.08)"
            : "var(--bg-secondary)",
          transition: "all 0.3s"
        }}
      >
        <img
          className="suspect-avatar"
          src={suspect.avatar || placeholderAvatar(suspect.name || suspect.id)}
          alt={`avatar of ${suspect.name || suspect.id}`}
        />
        <div className="suspect-info">
          <div className="suspect-name">{suspect.name}</div>
          <div className="suspect-seat">Seat {suspect.seat}</div>
          <div className="suspect-habits">
            <span>
              {suspect.habits && suspect.habits.length > 0 ? (
                suspect.habits.join(", ")
              ) : (
                <span style={{ color: "#BBB" }}>No habits listed</span>
              )}
            </span>
          </div>
        </div>
        {isKiller && (
          <div className="killer-label" style={{ color: COLOR_PRIMARY }}>
            &#128299; KILLER
          </div>
        )}
        <div style={{ fontSize: "0.7em", color: "#888" }}>{suspect.gender && suspect.age ? (suspect.gender + ", " + suspect.age) : null}</div>
      </div>
    );
  }

  // --- Clue Board (discovered) ---
  function ClueBoard({ clues }) {
    if (clues.length === 0)
      return (
        <div className="clue-board-empty">
          No clues found yet. Start searching the area!
        </div>
      );
    return (
      <div className="clue-board-list">
        {clues.map((clue, idx) => (
          <div key={clue.id || idx} className="clue-item">
            {clue.text || JSON.stringify(clue)}
          </div>
        ))}
      </div>
    );
  }

  // --- Main Render ---
  if (initializing || loading) {
    return (
      <div className="App">
        <header className="App-header">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
          <h1 style={{ color: COLOR_PRIMARY, margin: "2em 0" }}>
            Detective's Dilemma
          </h1>
          <div className="loading-spinner" />
          <p>Setting up the mystery...</p>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === "light" ? "🌙 Dark" : "☀️ Light"}
      </button>
      <div className="game-container">
        {/* === Left: Suspect List Panel === */}
        <aside className="suspect-panel">
          <div className="panel-title">Suspects</div>
          <div className="suspects-list">
            {suspects.map((suspect) => (
              <SuspectCard suspect={suspect} key={suspect.id} highlightKiller={gameOver} />
            ))}
          </div>
        </aside>

        {/* === Right: Interactive Area Panel === */}
        <aside className="area-panel">
          <div className="panel-title">Search for Clues</div>
          <div className="areas-list">
            {CLUE_AREAS.map((area) => (
              <button
                key={area.key}
                className={`area-btn${gameOver ? " disabled" : ""}`}
                disabled={gameOver || searchingAreaKey !== null || searchLimit <= 0}
                style={{
                  background: selectedArea === area.key ? COLOR_PRIMARY : COLOR_SECONDARY,
                  opacity: searchingAreaKey === area.key ? 0.7 : 1,
                  color: COLOR_ACCENT,
                  marginBottom: 12,
                }}
                onClick={() => handleAreaSearch(area.key)}
              >
                {searchingAreaKey === area.key ? "Searching..." : area.label}
              </button>
            ))}
          </div>
          <div className="search-meta">
            <span>
              Searches left:{" "}
              <strong>
                {searchLimit - searchCounter >= 0 ? searchLimit - searchCounter : 0}
              </strong>
            </span>
          </div>
          <div className="search-feedback">{searchFeedback}</div>
        </aside>

        {/* === Center: Clue Board & Guess Area === */}
        <main className="main-board">
          <div className="panel-title">Clue Board</div>
          <div className="clue-board">
            <ClueBoard clues={cluesDiscovered} />
          </div>
          <div className="guess-panel">
            {gameOver && guessResult === "win" && (
              <div className="result-message" style={{ color: COLOR_PRIMARY }}>
                🎉 You solved the case!
              </div>
            )}
            {gameOver && guessResult === "lose" && (
              <>
                <div className="result-message" style={{ color: COLOR_PRIMARY }}>
                  ❌ The killer escaped! Try again.
                </div>
                {replayTimeline && <TimelineReplay timeline={replayTimeline} />}
              </>
            )}
            {!gameOver && (
              <form className="final-guess-form" onSubmit={handleGuessSubmit}>
                <div className="guess-bar">
                  <select
                    autoFocus
                    required
                    className="guess-select"
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                  >
                    <option value="">-- Select Final Suspect --</option>
                    {suspects.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name} (Seat {s.seat})
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-guess" disabled={gameOver || !guessInput}>
                    Make Final Guess
                  </button>
                </div>
              </form>
            )}
            <div style={{ marginTop: 10 }}>
              {gameOver && (
                <button
                  onClick={() => window.location.reload()}
                  className="btn-restart"
                >
                  🔄 New Game
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
      <footer className="game-footer">
        <span>
          <b>Detective's Dilemma</b> &copy; {new Date().getFullYear()} | Generated suspects by randomuser.me
        </span>
      </footer>
      {/* --- Minimal injected styles for additional game-specific layout --- */}
      <style>{`
        .game-container {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: stretch;
          min-height: 95vh;
        }
        .panel-title {
          font-weight: bold;
          font-size: 1.2em;
          color: ${COLOR_SECONDARY};
          margin: 12px 0 8px 0;
          letter-spacing: 0.03em;
        }
        .suspect-panel {
          flex: 1 1 22%;
          padding: 14px 8px 8px 18px;
          background: var(--bg-secondary);
          border-right: 2px solid ${COLOR_ACCENT};
          overflow-y: auto;
          min-width: 200px;
        }
        .suspects-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .suspect-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 10px 8px;
          margin-bottom: 4px;
        }
        .suspect-card.killer {
          box-shadow: 0 0 8px 2px ${COLOR_PRIMARY}55;
        }
        .suspect-avatar {
          width: 46px; height: 46px; border-radius: 50%;
          background: #eee; margin-bottom: 6px;
          border: 2px solid ${COLOR_ACCENT};
        }
        .suspect-name {
          font-weight: bold; font-size: 1em; margin-bottom: 2px; color: ${COLOR_SECONDARY};
        }
        .suspect-seat {
          font-size: 0.9em; color: #9a4a4a; margin-bottom: 2px;
        }
        .suspect-habits {
          font-size: 0.84em; margin-bottom: 4px;
        }
        .killer-label {
          margin-top: 3px;
          font-weight: bold;
          text-shadow: 1px 1px 4px #fff2;
        }
        .area-panel {
          flex: 1 1 20%;
          padding: 14px 18px 8px 10px;
          background: var(--bg-secondary);
          border-left: 2px solid ${COLOR_ACCENT};
          min-width: 180px;
        }
        .areas-list {
          display: flex;
          flex-direction: column;
          gap: 0.5em;
          margin-bottom: 2em;
        }
        .area-btn {
          padding: 10px 0;
          border-radius: 7px;
          font-size: 1em;
          font-weight: bold;
          border: 1.5px solid ${COLOR_ACCENT};
          cursor: pointer;
          outline: none;
        }
        .area-btn.disabled, .area-btn:disabled {
          background: #bbb !important;
          color: #eee !important;
          cursor: not-allowed;
        }
        .search-meta {
          padding: 4px 0;
          font-size: 0.96em;
        }
        .search-feedback {
          min-height: 28px;
          padding: 6px 0;
          font-size: 0.98em;
        }
        .main-board {
          flex: 2.3 1 57%;
          background: var(--bg-primary);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          padding: 18px 24px 0 24px;
        }
        .clue-board {
          background: ${COLOR_ACCENT}35;
          min-height: 80px;
          border: 1.3px solid ${COLOR_ACCENT};
          border-radius: 10px;
          padding: 8px 0 8px 0;
          margin-bottom: 18px;
          font-size: 1.05em;
        }
        .clue-board-empty {
          color: #aaa; font-style: italic; padding: 12px 0;
        }
        .clue-board-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .clue-item {
          background: #fff7;
          border-radius: 5px;
          margin: 2px 26px 2px 18px;
          padding: 7px 8px;
          font-size: 1em;
          color: ${COLOR_SECONDARY};
        }
        .guess-panel {
          margin: 17px auto 0 auto;
          display: flex; flex-direction: column; align-items: center;
        }
        .guess-bar {
          display: flex;
          align-items: center;
        }
        .guess-select {
          padding: 7px 14px;
          border-radius: 8px 0 0 8px;
          border: 1.5px solid ${COLOR_PRIMARY};
          outline: none;
          background: #fff;
          font-size: 0.99em;
          color: ${COLOR_SECONDARY};
        }
        .btn-guess {
          padding: 8px 18px;
          background: ${COLOR_PRIMARY};
          color: ${COLOR_ACCENT};
          border: none;
          border-radius: 0 8px 8px 0;
          font-size: 1em;
          font-weight: 500;
          cursor: pointer;
          margin-left: 0;
        }
        .btn-guess:disabled {
          background: #ddd;
          color: #aaa;
          cursor: not-allowed;
        }
        .btn-restart {
          margin-top: 6px;
          padding: 0.5em 2em;
          background: ${COLOR_SECONDARY};
          color: ${COLOR_ACCENT};
          border-radius: 8px;
          cursor: pointer;
          border: none;
        }
        .timeline-replay {
          margin: 13px 0 0 0;
          background: ${COLOR_ACCENT}cc;
          border-radius: 8px;
          padding: 16px;
          color: #222;
        }
        .timeline-replay ul {
          margin: 0 0 0 13px;
          padding: 0;
          list-style: disc inside;
        }
        .timeline-replay li { margin-bottom: 7px; }

        .result-message {
          font-size: 1.1em;
          margin-bottom: 8px;
        }

        .game-footer {
          background: var(--bg-secondary);
          padding: 15px 0 10px 0;
          font-size: 0.95em;
          color: ${COLOR_SECONDARY};
          text-align: center;
          border-top: 1.5px solid ${COLOR_ACCENT};
          margin-top: 10px;
        }
        /* Responsive stacking for small screens */
        @media (max-width: 950px) {
          .game-container { flex-direction: column; }
          .suspect-panel, .area-panel {
            flex-direction: row;
            min-width: unset;
            border-right: none; border-left: none;
            padding: 8px 0 8px 0;
            display: flex; flex-wrap: wrap; justify-content: center;
          }
          .main-board { padding: 10px 2vw 0 2vw; }
        }
        @media (max-width: 700px) {
          .game-container { flex-direction: column; }
          .panel-title { font-size: 1em; }
          .suspect-card { min-width: 110px; padding: 7px 5px; }
          .area-panel, .suspect-panel { padding: 8px 1vw; }
        }
        @media (max-width: 520px) {
          .game-container, .main-board { padding: 0 1vw !important; }
          .game-footer { font-size: 0.82em;}
        }
        .loading-spinner {
          margin: 30px auto;
          border: 7px solid #eee;
          border-top: 7px solid ${COLOR_PRIMARY};
          border-radius: 50%;
          width: 38px;
          height: 38px;
          animation: spin 1.1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
