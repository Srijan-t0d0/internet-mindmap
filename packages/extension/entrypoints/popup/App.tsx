import { useState, useEffect } from "react";
import { getApiToken, setApiToken } from "../../lib/storage";

function App() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    getApiToken().then((stored) => {
      if (stored) {
        setToken(stored);
        setHasToken(true);
      }
    });
  }, []);

  const handleSave = async () => {
    await setApiToken(token.trim());
    setHasToken(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 font-sans">
      <h1 className="text-lg font-semibold mb-3">Internet Mindmap</h1>

      <div className="mb-3">
        <label className="block text-sm text-gray-600 mb-1">API Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter your API token"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={!token.trim()}
        className="w-full py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saved ? "Saved!" : "Save Token"}
      </button>

      <div className="mt-3 text-xs text-gray-500">
        {hasToken ? (
          <p className="text-green-600">Connected. Press {navigator.platform.includes("Mac") ? "\u2318\u21e7S" : "Ctrl+Shift+S"} to save a page.</p>
        ) : (
          <p>Enter your API token to start saving pages.</p>
        )}
      </div>
    </div>
  );
}

export default App;
