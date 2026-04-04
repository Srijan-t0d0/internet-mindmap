"use client";

import { authClient } from "../lib/auth-client";

// ─── Knowledge graph data for the hero visualization ─────────────────────────

const NODES = [
  { id: "n0",  x: 8,   y: 22,  r: 4.5 },
  { id: "n1",  x: 36,  y: 10,  r: 5.5 },
  { id: "n2",  x: 66,  y: 15,  r: 4.5 },
  { id: "n3",  x: 88,  y: 36,  r: 4   },
  { id: "n4",  x: 80,  y: 62,  r: 6.5 },
  { id: "n5",  x: 50,  y: 68,  r: 5.5 },
  { id: "n6",  x: 18,  y: 57,  r: 4.5 },
  { id: "n7",  x: 32,  y: 38,  r: 4.5 },
  { id: "n8",  x: 56,  y: 34,  r: 9   }, // central hub
  { id: "n9",  x: 20,  y: 82,  r: 3.5 },
  { id: "n10", x: 56,  y: 85,  r: 4.5 },
  { id: "n11", x: 84,  y: 78,  r: 3.5 },
  { id: "n12", x: 94,  y: 16,  r: 3   },
  { id: "n13", x: 43,  y: 50,  r: 3.5 },
];

const EDGES = [
  ["n0","n7"], ["n1","n7"], ["n1","n8"], ["n2","n8"], ["n2","n3"],
  ["n3","n4"], ["n4","n8"], ["n4","n5"], ["n5","n8"], ["n5","n6"],
  ["n6","n7"], ["n7","n8"], ["n8","n10"],["n5","n10"],["n4","n11"],
  ["n3","n11"],["n9","n6"], ["n9","n5"], ["n10","n11"],["n1","n2"],
  ["n0","n6"], ["n2","n12"],["n7","n13"],["n5","n13"], ["n8","n13"],
  ["n0","n9"], ["n12","n3"],
];

function getNode(id: string) {
  return NODES.find((n) => n.id === id)!;
}

// ─── Source cards that float over the graph ───────────────────────────────────

const CARDS = [
  {
    source: "YouTube",
    color: "#ff0000",
    title: "The Illustrated Transformer",
    tags: ["ml", "attention"],
    cls: "lp-fc-1",
  },
  {
    source: "GitHub",
    color: "#8b5cf6",
    title: "karpathy/nanoGPT",
    tags: ["gpt", "code"],
    cls: "lp-fc-2",
  },
  {
    source: "Substack",
    color: "#ff6719",
    title: "Building a Second Brain",
    tags: ["pkm", "notes"],
    cls: "lp-fc-3",
  },
];

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
        <path d="M11 8v3M11 14h.01" strokeWidth="2.2"/>
      </svg>
    ),
    title: "Semantic Search",
    desc: "Don't remember exact words? Search by meaning. \u201carticles about memory and learning\u201d finds what keyword search would miss.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <path d="M8 10h8M8 14h5"/>
      </svg>
    ),
    title: "Chat With Your Reading",
    desc: "Ask \u201cwhat did I save about Rust ownership?\u201d and get answers sourced directly from your own reading history.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2"/>
        <circle cx="4"  cy="6"  r="2"/>
        <circle cx="20" cy="6"  r="2"/>
        <circle cx="4"  cy="18" r="2"/>
        <circle cx="20" cy="18" r="2"/>
        <path d="M10.4 10.4L5.6 7.2M13.6 10.4l4.8-3.2M10.4 13.6l-4.8 3.2M13.6 13.6l4.8 3.2"/>
      </svg>
    ),
    title: "Knowledge Graph",
    desc: "See how everything connects. Explore your reading as a live, zoomable graph and discover unexpected links between ideas.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    title: "Reading List",
    desc: "Save first, read later. Every URL you capture becomes a permanent, searchable record — never lose a tab worth keeping.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const handleGoogleSignIn = () => {
    authClient.signIn.social({ provider: "google", callbackURL: "/" });
  };

  return (
    <>
      {/* ── Styles ─────────────────────────────────────────────────────────── */}
      <style>{`
        /* Reset & root */
        .lp {
          min-height: 100vh;
          background-color: #faf9f6;
          font-family: var(--font-body, system-ui, sans-serif);
          color: #2d2d2d;
          overflow-x: hidden;
        }

        /* Grain texture */
        .lp::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 999;
        }

        /* ── Nav ─────────────────────────────────────────────────────────── */
        .lp-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 56px;
          background-color: rgba(250, 249, 246, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(232, 228, 222, 0.7);
        }
        .lp-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          cursor: default;
        }
        .lp-logo-icon {
          width: 34px;
          height: 34px;
          background-color: #c4956a;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .lp-logo-name {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: #2d2d2d;
        }
        .lp-nav-btn {
          font-size: 13px;
          font-weight: 500;
          color: #2d2d2d;
          background-color: white;
          border: 1px solid #e8e4de;
          padding: 8px 20px;
          border-radius: 6px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
          letter-spacing: -0.005em;
        }
        .lp-nav-btn:hover {
          border-color: #c4956a;
          color: #c4956a;
          box-shadow: 0 0 0 3px rgba(196,149,106,0.1);
        }

        /* ── Hero ────────────────────────────────────────────────────────── */
        .lp-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          min-height: calc(100vh - 73px);
          max-width: 1240px;
          margin: 0 auto;
          padding: 80px 56px 60px;
          gap: 48px;
        }
        .lp-hero-left { max-width: 540px; }

        /* Animated badge */
        .lp-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #c4956a;
          margin-bottom: 28px;
          opacity: 0;
          transform: translateY(6px);
          animation: lp-rise 0.55s cubic-bezier(0.16,1,0.3,1) 80ms forwards;
        }
        .lp-badge-line {
          width: 28px;
          height: 1px;
          background-color: #c4956a;
          flex-shrink: 0;
        }

        /* Headline */
        .lp-h1 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: clamp(46px, 5vw, 70px);
          line-height: 1.08;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #2d2d2d;
          margin-bottom: 26px;
          opacity: 0;
          transform: translateY(10px);
          animation: lp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 180ms forwards;
        }
        .lp-h1 em {
          font-style: italic;
          color: #c4956a;
          font-weight: 400;
        }

        /* Subhead */
        .lp-sub {
          font-size: 16.5px;
          line-height: 1.7;
          color: #6b6b6b;
          max-width: 430px;
          margin-bottom: 44px;
          opacity: 0;
          transform: translateY(10px);
          animation: lp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 300ms forwards;
        }

        /* CTA row */
        .lp-cta-row {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          opacity: 0;
          transform: translateY(10px);
          animation: lp-rise 0.65s cubic-bezier(0.16,1,0.3,1) 440ms forwards;
        }
        .lp-btn-dark {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          padding: 14px 28px;
          background-color: #2d2d2d;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: background-color 0.15s, transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .lp-btn-dark:hover {
          background-color: #1a1a1a;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .lp-btn-dark:active { transform: translateY(0); }
        .lp-kbd-hint {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          color: #a0a0a0;
        }
        .lp-kbd {
          display: inline-flex;
          align-items: center;
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          background-color: white;
          border: 1px solid #e8e4de;
          border-bottom: 2px solid #cdc9c3;
          border-radius: 4px;
          padding: 1px 6px;
          color: #5a5a5a;
          line-height: 1.6;
          box-shadow: 0 1px 0 rgba(0,0,0,0.04);
        }

        /* Stat strip */
        .lp-stats {
          display: flex;
          gap: 40px;
          margin-top: 56px;
          padding-top: 32px;
          border-top: 1px solid #e8e4de;
          opacity: 0;
          animation: lp-rise 0.55s ease 700ms forwards;
        }
        .lp-stat-num {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 22px;
          font-weight: 700;
          color: #2d2d2d;
          letter-spacing: -0.02em;
        }
        .lp-stat-label {
          font-size: 12px;
          color: #a0a0a0;
          margin-top: 2px;
        }

        /* ── Graph right panel ───────────────────────────────────────────── */
        .lp-hero-right {
          position: relative;
          height: 540px;
          opacity: 0;
          animation: lp-rise 1.1s ease 350ms forwards;
          overflow: visible;
        }
        .lp-svg-wrap {
          width: 100%;
          height: 100%;
          position: relative;
        }

        /* Floating source cards */
        .lp-fc {
          position: absolute;
          background: white;
          border-radius: 10px;
          padding: 11px 14px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04);
          min-width: 160px;
          max-width: 210px;
          pointer-events: none;
        }
        .lp-fc-1 {
          top: 4%;
          left: -4%;
          animation: fc-float-a 6.5s ease-in-out 1.2s infinite;
        }
        .lp-fc-2 {
          top: 16%;
          right: -1%;
          animation: fc-float-b 7s ease-in-out 1.8s infinite;
        }
        .lp-fc-3 {
          bottom: 14%;
          left: -2%;
          animation: fc-float-c 6.8s ease-in-out 2.4s infinite;
        }
        .lp-fc-src {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 6px;
        }
        .lp-fc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .lp-fc-srcname {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a0a0a0;
        }
        .lp-fc-title {
          font-size: 12.5px;
          font-weight: 500;
          color: #2d2d2d;
          line-height: 1.45;
        }
        .lp-fc-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .lp-fc-tag {
          font-size: 9.5px;
          padding: 2px 7px;
          border-radius: 99px;
          border: 1px solid #e8e4de;
          color: #a0a0a0;
        }

        /* ── SVG node / edge animations ──────────────────────────────────── */
        @keyframes svg-node-pop {
          0%   { opacity: 0; transform: scale(0.2); }
          70%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes svg-edge-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes svg-pulse {
          0%,100% { opacity: 0.05; transform: scale(1); }
          50%     { opacity: 0.14; transform: scale(1.45); }
        }

        /* ── Steps section ───────────────────────────────────────────────── */
        .lp-steps-wrap {
          background-color: #f3f0eb;
          padding: 88px 56px;
        }
        .lp-steps-inner {
          max-width: 1000px;
          margin: 0 auto;
        }
        .lp-section-eyebrow {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #c4956a;
          margin-bottom: 14px;
        }
        .lp-section-h2 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: clamp(26px, 3vw, 36px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #2d2d2d;
          margin-bottom: 56px;
          line-height: 1.2;
        }
        .lp-steps-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0;
        }
        .lp-step {
          padding: 32px 40px 32px 0;
          border-top: 2px solid #c4956a;
        }
        .lp-step:not(:last-child) {
          margin-right: 40px;
          padding-right: 40px;
          border-right: 1px solid #e8e4de;
        }
        .lp-step-num {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 12px;
          font-weight: 700;
          color: #c4956a;
          letter-spacing: 0.04em;
          margin-bottom: 18px;
        }
        .lp-step-h3 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 19px;
          font-weight: 700;
          color: #2d2d2d;
          margin-bottom: 10px;
          line-height: 1.25;
          letter-spacing: -0.01em;
        }
        .lp-step-p {
          font-size: 14px;
          line-height: 1.7;
          color: #6b6b6b;
        }

        /* ── Features grid ───────────────────────────────────────────────── */
        .lp-feat-wrap {
          max-width: 1240px;
          margin: 0 auto;
          padding: 88px 56px;
        }
        .lp-feat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px;
          background-color: #e8e4de;
          border-radius: 14px;
          overflow: hidden;
          margin-top: 52px;
        }
        .lp-feat-cell {
          background-color: #faf9f6;
          padding: 44px 48px;
          transition: background-color 0.2s ease;
          cursor: default;
        }
        .lp-feat-cell:hover { background-color: #f3f0eb; }
        .lp-feat-icon {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          background-color: rgba(196,149,106,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c4956a;
          margin-bottom: 22px;
        }
        .lp-feat-h3 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 19px;
          font-weight: 700;
          color: #2d2d2d;
          margin-bottom: 10px;
          letter-spacing: -0.015em;
        }
        .lp-feat-p {
          font-size: 14px;
          line-height: 1.7;
          color: #6b6b6b;
          max-width: 340px;
        }

        /* ── Sources strip ───────────────────────────────────────────────── */
        .lp-sources-wrap {
          padding: 56px 56px;
          border-top: 1px solid #e8e4de;
          border-bottom: 1px solid #e8e4de;
          text-align: center;
        }
        .lp-sources-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #a0a0a0;
          margin-bottom: 24px;
        }
        .lp-sources-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .lp-source-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 99px;
          border: 1px solid #e8e4de;
          background-color: white;
          font-size: 12.5px;
          font-weight: 500;
          color: #5a5a5a;
        }
        .lp-source-pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        /* ── Final CTA ───────────────────────────────────────────────────── */
        .lp-final-cta {
          background-color: #2d2d2d;
          padding: 112px 56px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .lp-final-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(196,149,106,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-final-h2 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: clamp(34px, 4vw, 52px);
          font-weight: 700;
          color: #faf9f6;
          letter-spacing: -0.025em;
          line-height: 1.1;
          margin-bottom: 20px;
          position: relative;
        }
        .lp-final-h2 em {
          font-style: italic;
          color: #c4956a;
          font-weight: 400;
        }
        .lp-final-sub {
          font-size: 16px;
          color: rgba(250,249,246,0.45);
          margin-bottom: 44px;
          position: relative;
        }
        .lp-btn-google {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 13px;
          padding: 16px 36px;
          background-color: #faf9f6;
          border-radius: 9px;
          font-size: 15px;
          font-weight: 500;
          color: #2d2d2d;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          position: relative;
        }
        .lp-btn-google:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        }
        .lp-btn-google:active { transform: translateY(0); }
        .lp-final-note {
          font-size: 12.5px;
          color: rgba(250,249,246,0.25);
          margin-top: 20px;
          position: relative;
        }

        /* ── Footer ──────────────────────────────────────────────────────── */
        .lp-footer {
          background-color: #2d2d2d;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 28px 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .lp-footer-brand {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 13px;
          color: rgba(250,249,246,0.35);
          letter-spacing: -0.01em;
        }
        .lp-footer-copy {
          font-size: 12px;
          color: rgba(250,249,246,0.2);
        }

        /* ── Keyframes ───────────────────────────────────────────────────── */
        @keyframes lp-rise {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fc-float-a {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-11px) rotate(0.4deg); }
        }
        @keyframes fc-float-b {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-9px) rotate(-0.3deg); }
        }
        @keyframes fc-float-c {
          0%,100% { transform: translateY(0px); }
          40%      { transform: translateY(-13px); }
          80%      { transform: translateY(-5px); }
        }

        /* ── Responsive ──────────────────────────────────────────────────── */
        @media (max-width: 960px) {
          .lp-nav       { padding: 16px 28px; }
          .lp-hero      { grid-template-columns: 1fr; padding: 56px 28px 48px; min-height: auto; gap: 0; }
          .lp-hero-right { height: 320px; margin-top: 40px; }
          .lp-steps-wrap, .lp-feat-wrap, .lp-final-cta, .lp-sources-wrap { padding-left: 28px; padding-right: 28px; }
          .lp-steps-grid { grid-template-columns: 1fr; gap: 0; }
          .lp-step { padding: 28px 0; border-right: none !important; margin-right: 0 !important; }
          .lp-feat-grid  { grid-template-columns: 1fr; }
          .lp-footer     { padding: 24px 28px; }
          .lp-stats      { gap: 28px; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="lp">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="lp-nav">
          <div className="lp-logo">
            <div className="lp-logo-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"/>
                <circle cx="5"  cy="6"  r="1.5"/>
                <circle cx="19" cy="6"  r="1.5"/>
                <circle cx="5"  cy="18" r="1.5"/>
                <circle cx="19" cy="18" r="1.5"/>
                <line x1="10.5" y1="10.5" x2="6.2"  y2="7.2"/>
                <line x1="13.5" y1="10.5" x2="17.8" y2="7.2"/>
                <line x1="10.5" y1="13.5" x2="6.2"  y2="16.8"/>
                <line x1="13.5" y1="13.5" x2="17.8" y2="16.8"/>
              </svg>
            </div>
            <span className="lp-logo-name">Internet Mindmap</span>
          </div>
          <button className="lp-nav-btn" onClick={handleGoogleSignIn}>Sign in</button>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section>
          <div className="lp-hero">

            {/* Left — copy */}
            <div className="lp-hero-left">
              <p className="lp-badge">
                <span className="lp-badge-line" />
                Personal knowledge graph
              </p>

              <h1 className="lp-h1">
                Everything<br/>
                you read,<br/>
                <em>remembered.</em>
              </h1>

              <p className="lp-sub">
                Most saved links disappear into a graveyard of bookmarks. Press ⌘⇧S on anything worth keeping — it's automatically extracted, tagged, and searchable long after the tab is gone.
              </p>

              <div className="lp-cta-row">
                <button className="lp-btn-dark" onClick={handleGoogleSignIn}>
                  {/* Google G */}
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google — it&apos;s free
                </button>

                <span className="lp-kbd-hint">
                  then
                  <span className="lp-kbd">⌘⇧S</span>
                  any page to save your first
                </span>
              </div>

              {/* Micro-stats */}
              <div className="lp-stats">
                <div>
                  <div className="lp-stat-num">⌘⇧S</div>
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
                  style={{ width: "100%", height: "100%", overflow: "visible" }}
                >
                  <defs>
                    <radialGradient id="lp-glow" cx="56%" cy="34%" r="45%">
                      <stop offset="0%"   stopColor="#c4956a" stopOpacity="0.12"/>
                      <stop offset="100%" stopColor="#faf9f6" stopOpacity="0"/>
                    </radialGradient>
                  </defs>

                  {/* Ambient glow behind central hub */}
                  <ellipse cx="56" cy="34" rx="52" ry="52" fill="url(#lp-glow)"/>

                  {/* Edges */}
                  {EDGES.map(([a, b], i) => {
                    const na = getNode(a), nb = getNode(b);
                    if (!na || !nb) return null;
                    return (
                      <line
                        key={`${a}-${b}`}
                        x1={na.x} y1={na.y}
                        x2={nb.x} y2={nb.y}
                        stroke="#c4956a"
                        strokeWidth="0.28"
                        style={{
                          opacity: 0,
                          animation: `svg-edge-in 0.5s ease ${700 + i * 45}ms forwards`,
                        }}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {NODES.map((node, i) => (
                    <g
                      key={node.id}
                      style={{
                        opacity: 0,
                        transformOrigin: `${node.x}px ${node.y}px`,
                        animation: `svg-node-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) ${350 + i * 70}ms forwards`,
                      }}
                    >
                      {/* Pulse halo (only on larger nodes) */}
                      {node.r >= 5 && (
                        <circle
                          cx={node.x} cy={node.y}
                          r={node.r + 5}
                          fill="#c4956a"
                          style={{
                            opacity: 0,
                            transformOrigin: `${node.x}px ${node.y}px`,
                            animation: `svg-pulse ${4 + (i % 3)}s ease-in-out ${i * 350}ms infinite`,
                          }}
                        />
                      )}
                      {/* Node body */}
                      <circle
                        cx={node.x} cy={node.y}
                        r={node.r}
                        fill="#faf9f6"
                        stroke="#c4956a"
                        strokeWidth={node.id === "n8" ? 0.8 : 0.55}
                        strokeOpacity={node.id === "n8" ? 0.9 : 0.65}
                      />
                      {/* Inner fill for hub node */}
                      {node.id === "n8" && (
                        <circle
                          cx={node.x} cy={node.y}
                          r={node.r - 3}
                          fill="#c4956a"
                          fillOpacity="0.12"
                        />
                      )}
                      {/* Center dot */}
                      <circle
                        cx={node.x} cy={node.y}
                        r={Math.min(node.r * 0.32, 2)}
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
                      <span className="lp-fc-dot" style={{ backgroundColor: card.color }}/>
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

        {/* ── Sources strip ─────────────────────────────────────────────────── */}
        <div className="lp-sources-wrap">
          <p className="lp-sources-label">Save from anywhere on the web</p>
          <div className="lp-sources-row">
            {[
              { label: "YouTube",     color: "#ff0000" },
              { label: "GitHub",      color: "#8b5cf6" },
              { label: "Substack",    color: "#ff6719" },
              { label: "Hacker News", color: "#ff6600" },
              { label: "Reddit",      color: "#ff4500" },
              { label: "Twitter / X", color: "#1d1d1f" },
              { label: "Any webpage", color: "#4a9eff" },
            ].map((s) => (
              <span key={s.label} className="lp-source-pill">
                <span className="lp-source-pill-dot" style={{ backgroundColor: s.color }}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="lp-steps-wrap">
          <div className="lp-steps-inner">
            <p className="lp-section-eyebrow">How it works</p>
            <h2 className="lp-section-h2">Save once. Find anything.</h2>
            <div className="lp-steps-grid">

              <div className="lp-step">
                <div className="lp-step-num">01</div>
                <h3 className="lp-step-h3">
                  Press{" "}
                  <span className="lp-kbd" style={{ fontSize: "13px", padding: "2px 8px" }}>⌘⇧S</span>
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

        {/* ── Features ──────────────────────────────────────────────────────── */}
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

        {/* ── Final CTA ─────────────────────────────────────────────────────── */}
        <section className="lp-final-cta">
          <h2 className="lp-final-h2">
            Start building your<br/>
            <em>second memory.</em>
          </h2>
          <p className="lp-final-sub">
            Every page you save is a thought you'll never lose.
          </p>
          <button className="lp-btn-google" onClick={handleGoogleSignIn}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google — it&apos;s free
          </button>
          <p className="lp-final-note">Self-hosted · Private · Always yours</p>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="lp-footer">
          <span className="lp-footer-brand">Internet Mindmap</span>
          <span className="lp-footer-copy">Your personal knowledge graph for the web.</span>
        </footer>

      </div>
    </>
  );
}
