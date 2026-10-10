import { Kbd,KbdGroup } from "./ui/kbd";
import SignInButton from "./SignInButton";
import "./LoginPage.css";

// ─── Knowledge graph data for the hero visualization ─────────────────────────

const NODES=[
  { id: "n0",x: 8,y: 22,r: 4.5 },
  { id: "n1",x: 36,y: 10,r: 5.5 },
  { id: "n2",x: 66,y: 15,r: 4.5 },
  { id: "n3",x: 88,y: 36,r: 4 },
  { id: "n4",x: 80,y: 62,r: 6.5 },
  { id: "n5",x: 50,y: 68,r: 5.5 },
  { id: "n6",x: 18,y: 57,r: 4.5 },
  { id: "n7",x: 32,y: 38,r: 4.5 },
  { id: "n8",x: 56,y: 34,r: 9 }, // central hub
  { id: "n9",x: 20,y: 82,r: 3.5 },
  { id: "n10",x: 56,y: 85,r: 4.5 },
  { id: "n11",x: 84,y: 78,r: 3.5 },
  { id: "n12",x: 94,y: 16,r: 3 },
  { id: "n13",x: 43,y: 50,r: 3.5 },
];

const EDGES=[
  ["n0","n7"],["n1","n7"],["n1","n8"],["n2","n8"],["n2","n3"],
  ["n3","n4"],["n4","n8"],["n4","n5"],["n5","n8"],["n5","n6"],
  ["n6","n7"],["n7","n8"],["n8","n10"],["n5","n10"],["n4","n11"],
  ["n3","n11"],["n9","n6"],["n9","n5"],["n10","n11"],["n1","n2"],
  ["n0","n6"],["n2","n12"],["n7","n13"],["n5","n13"],["n8","n13"],
  ["n0","n9"],["n12","n3"],
];

function getNode(id: string) {
  return NODES.find((n) => n.id===id)!;
}

// ─── Source cards that float over the graph ───────────────────────────────────

const CARDS=[
  {
    source: "YouTube",
    color: "#ff0000",
    title: "The Illustrated Transformer",
    tags: ["ml","attention"],
    cls: "lp-fc-1",
  },
  {
    source: "GitHub",
    color: "#8b5cf6",
    title: "karpathy/nanoGPT",
    tags: ["gpt","code"],
    cls: "lp-fc-2",
  },
  {
    source: "Substack",
    color: "#ff6719",
    title: "Building a Second Brain",
    tags: ["pkm","notes"],
    cls: "lp-fc-3",
  },
];

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES=[
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
        <path d="M11 8v3M11 14h.01" strokeWidth="2.2" />
      </svg>
    ),
    title: "Semantic Search",
    desc: "Don't remember exact words? Search by meaning. \u201carticles about memory and learning\u201d finds what keyword search would miss.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    ),
    title: "Chat With Your Reading",
    desc: "Ask \u201cwhat did I save about Rust ownership?\u201d and get answers sourced directly from your own reading history.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2" />
        <circle cx="4" cy="6" r="2" />
        <circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="20" cy="18" r="2" />
        <path d="M10.4 10.4L5.6 7.2M13.6 10.4l4.8-3.2M10.4 13.6l-4.8 3.2M13.6 13.6l4.8 3.2" />
      </svg>
    ),
    title: "Knowledge Graph",
    desc: "See how everything connects. Explore your reading as a live, zoomable graph and discover unexpected links between ideas.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Reading List",
    desc: "Save first, read later. Every URL you capture becomes a permanent, searchable record — never lose a tab worth keeping.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="lp">
      <LoginNav />
      <LoginHero />
      <LoginSources />
      <LoginHowItWorks />
      <LoginFeatures />
      <LoginFinalCTA />
      <LoginFooter />
    </div>
  );
}

function LoginNav() {
  return (
    <nav className="lp-nav">
      <div className="lp-logo">
        <div className="lp-logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" />
            <circle cx="5" cy="6" r="1.5" />
            <circle cx="19" cy="6" r="1.5" />
            <circle cx="5" cy="18" r="1.5" />
            <circle cx="19" cy="18" r="1.5" />
            <line x1="10.5" y1="10.5" x2="6.2" y2="7.2" />
            <line x1="13.5" y1="10.5" x2="17.8" y2="7.2" />
            <line x1="10.5" y1="13.5" x2="6.2" y2="16.8" />
            <line x1="13.5" y1="13.5" x2="17.8" y2="16.8" />
          </svg>
        </div>
        <span className="lp-logo-name">Internet Mindmap</span>
      </div>
      <SignInButton className="lp-nav-btn">Sign in</SignInButton>
    </nav>
  );
}

function LoginHero() {
  return (
    <section>
      <div className="lp-hero">

        {/* Left — copy */}
        <div className="lp-hero-left">
          <p className="lp-badge">
            <span className="lp-badge-line" />
            Personal knowledge graph
          </p>

          <h1 className="lp-h1">
            Everything<br />
            you read,<br />
            <em>remembered.</em>
          </h1>

          <p className="lp-sub">
            Most saved links disappear into a graveyard of bookmarks. Press{" "}<KbdGroup><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>S</Kbd></KbdGroup>{" "}on anything worth keeping — it's automatically extracted, tagged, and searchable long after the tab is gone.
          </p>

          <div className="lp-cta-row">
            <SignInButton className="lp-btn-dark">
              {/* Google G */}
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google — it&apos;s free
            </SignInButton>

            <span className="lp-kbd-hint">
              then
              <KbdGroup><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>S</Kbd></KbdGroup>
              any page to save your first
            </span>
          </div>

          {/* Micro-stats */}
          <div className="lp-stats">
            <div>
              <div className="lp-stat-num"><KbdGroup><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>S</Kbd></KbdGroup></div>
              <div className="lp-stat-label">One keystroke to save</div>
            </div>
            <div>
              <div className="lp-stat-num">Auto</div>
              <div className="lp-stat-label">Tagged &amp; indexed instantly</div>
            </div>
            <div>
              <div className="lp-stat-num">Yours</div>
              <div className="lp-stat-label">Self-hosted, always</div>
            </div>
          </div>
        </div>

        {/* Right — animated graph */}
        <div className="lp-hero-right">
          <div className="lp-svg-wrap">

            {/* Knowledge graph SVG */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ width: "100%",height: "100%",overflow: "visible" }}
            >
              <defs>
                <radialGradient id="lp-glow" cx="56%" cy="34%" r="45%">
                  <stop offset="0%" stopColor="#c4956a" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#faf9f6" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Ambient glow behind central hub */}
              <ellipse cx="56" cy="34" rx="52" ry="52" fill="url(#lp-glow)" />

              {/* Edges */}
              {EDGES.map(([a,b],i) => {
                const na=getNode(a),nb=getNode(b);
                if(!na||!nb) return null;
                return (
                  <line
                    key={`${a}-${b}`}
                    x1={na.x} y1={na.y}
                    x2={nb.x} y2={nb.y}
                    stroke="#c4956a"
                    strokeWidth="0.28"
                    style={{
                      opacity: 0,
                      animation: `svg-edge-in 0.5s ease ${700+i*45}ms forwards`,
                    }}
                  />
                );
              })}

              {/* Nodes */}
              {NODES.map((node,i) => (
                <g
                  key={node.id}
                  style={{
                    opacity: 0,
                    transformOrigin: `${node.x}px ${node.y}px`,
                    animation: `svg-node-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) ${350+i*70}ms forwards`,
                  }}
                >
                  {/* Pulse halo (only on larger nodes) */}
                  {node.r>=5&&(
                    <circle
                      cx={node.x} cy={node.y}
                      r={node.r+5}
                      fill="#c4956a"
                      style={{
                        opacity: 0,
                        transformOrigin: `${node.x}px ${node.y}px`,
                        animation: `svg-pulse ${4+(i%3)}s ease-in-out ${i*350}ms infinite`,
                      }}
                    />
                  )}
                  {/* Node body */}
                  <circle
                    cx={node.x} cy={node.y}
                    r={node.r}
                    fill="#faf9f6"
                    stroke="#c4956a"
                    strokeWidth={node.id==="n8"? 0.8:0.55}
                    strokeOpacity={node.id==="n8"? 0.9:0.65}
                  />
                  {/* Inner fill for hub node */}
                  {node.id==="n8"&&(
                    <circle
                      cx={node.x} cy={node.y}
                      r={node.r-3}
                      fill="#c4956a"
                      fillOpacity="0.12"
                    />
                  )}
                  {/* Center dot */}
                  <circle
                    cx={node.x} cy={node.y}
                    r={Math.min(node.r*0.32,2)}
                    fill="#c4956a"
                    fillOpacity="0.7"
                  />
                </g>
              ))}
            </svg>

            {/* Floating source cards */}
            {CARDS.map((card) => (
              <div key={card.source} className={`lp-fc ${card.cls}`}>
                <div className="lp-fc-src">
                  <span className="lp-fc-dot" style={{ backgroundColor: card.color }} />
                  <span className="lp-fc-srcname">{card.source}</span>
                </div>
                <div className="lp-fc-title">{card.title}</div>
                <div className="lp-fc-tags">
                  {card.tags.map((t) => (
                    <span key={t} className="lp-fc-tag">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

function LoginSources() {
  return (
    <div className="lp-sources-wrap">
      <p className="lp-sources-label">Save from anywhere on the web</p>
      <div className="lp-sources-row">
        {[
          { label: "YouTube",color: "#ff0000" },
          { label: "GitHub",color: "#8b5cf6" },
          { label: "Substack",color: "#ff6719" },
          { label: "Hacker News",color: "#ff6600" },
          { label: "Reddit",color: "#ff4500" },
          { label: "Twitter / X",color: "#1d1d1f" },
          { label: "Any webpage",color: "#4a9eff" },
        ].map((s) => (
          <span key={s.label} className="lp-source-pill">
            <span className="lp-source-pill-dot" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoginHowItWorks() {
  return (
    <section className="lp-steps-wrap">
      <div className="lp-steps-inner">
        <p className="lp-section-eyebrow">How it works</p>
        <h2 className="lp-section-h2">Save once. Find anything.</h2>
        <div className="lp-steps-grid">

          <div className="lp-step">
            <div className="lp-step-num">01</div>
            <h3 className="lp-step-h3">
              Press{" "}
              <KbdGroup><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>S</Kbd></KbdGroup>
            </h3>
            <p className="lp-step-p">
              On any web page — an article, a GitHub repo, a YouTube video, a Reddit thread. One keystroke. The extension captures the full content before the tab closes.
            </p>
          </div>

          <div className="lp-step">
            <div className="lp-step-num">02</div>
            <h3 className="lp-step-h3">It does the rest</h3>
            <p className="lp-step-p">
              The page is extracted, summarised, and tagged automatically. No decisions to make, no folders to file things in. It&apos;s just there — ready to find — in seconds.
            </p>
          </div>

          <div className="lp-step">
            <div className="lp-step-num">03</div>
            <h3 className="lp-step-h3">Ask anything. Find everything.</h3>
            <p className="lp-step-p">
              Ask questions in natural language and get answers grounded in your own reading. Browse the knowledge graph to see how everything connects. Your second brain, built automatically.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}

function LoginFeatures() {
  return (
    <section>
      <div className="lp-feat-wrap">
        <p className="lp-section-eyebrow">What you get</p>
        <h2 className="lp-section-h2">Built for how ideas work</h2>
        <div className="lp-feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feat-cell">
              <div className="lp-feat-icon">{f.icon}</div>
              <h3 className="lp-feat-h3">{f.title}</h3>
              <p className="lp-feat-p">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LoginFinalCTA() {
  return (
    <section className="lp-final-cta">
      <h2 className="lp-final-h2">
        Start building your<br />
        <em>second memory.</em>
      </h2>
      <p className="lp-final-sub">
        Every page you save is a thought you'll never lose.
      </p>
      <SignInButton className="lp-btn-google">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google — it&apos;s free
      </SignInButton>
      <p className="lp-final-note">Self-hosted · Private · Always yours</p>
    </section>
  );
}

function LoginFooter() {
  return (
    <footer className="lp-footer">
      <span className="lp-footer-brand">Internet Mindmap</span>
      <span className="lp-footer-copy">Your personal knowledge graph for the web.</span>
    </footer>
  );
}
