import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useRef, useState } from "react";
import {
  TrendingUp,
  Zap,
  Bot,
  Shield,
  House,
  Trophy,
  Tv,
  BarChart3,
  UserRound,
} from "lucide-react";

const SICKPUNT_LOGO_URL = "https://i.imgur.com/4k1Ov7i.png";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoFading, setVideoFading] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [heroVisible, setHeroVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (loading) return null;

  // Already authenticated — skip straight to dashboard, no video replay
  if (isAuthenticated) {
    sessionStorage.setItem("sp_intro", "1");
    window.location.replace("/dashboard");
    return null;
  }

  const completeIntro = (captureFrame = true) => {
    if (captureFrame) {
      const video = videoRef.current;
      if (video && video.videoWidth && video.videoHeight) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setFrozenFrame(canvas.toDataURL("image/jpeg", 0.92));
        }
      }
    }
    sessionStorage.setItem("sp_intro", "1");
    // Fade the video overlay out, then remove it — smooth cinematic transition
    setVideoFading(true);
    setTimeout(() => {
      setVideoEnded(true);
      setTimeout(() => setHeroVisible(true), 180);
    }, 500);
  };

  const handleVideoEnd = () => completeIntro(true);
  const handleVideoError = () => completeIntro(false);

  return (
    <div className="min-h-screen bg-[#090909] text-white relative overflow-x-hidden">

      {/* ── Shimmer keyframe ── */}
      <style>{`
        @keyframes sp-shimmer {
          0%   { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(350%)  skewX(-20deg); }
        }
        .sp-shimmer-btn { position: relative; overflow: hidden; }
        .sp-shimmer-btn::after {
          content: '';
          position: absolute;
          inset-y: 0;
          left: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          animation: sp-shimmer 2.5s ease-in-out infinite;
          transform: skewX(-20deg);
          pointer-events: none;
        }
      `}</style>

      {/* ── Intro video overlay — fades out on end ── */}
      {!videoEnded && (
        <div
          className={`fixed inset-0 z-50 bg-black transition-opacity duration-500 ${
            videoFading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <video
            ref={videoRef}
            src="/media/sickpunt-intro.mp4"
            className="h-full w-full object-cover object-top"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            onError={handleVideoError}
          />
        </div>
      )}

      {/* ── Frozen last frame — stays fixed as background ── */}
      {frozenFrame && (
        <img
          src={frozenFrame}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top select-none pointer-events-none"
          aria-hidden
        />
      )}

      {/* ── Colour overlays ── */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_90%_at_50%_55%,rgba(38,166,91,0.35),rgba(9,9,9,0.96)_58%)]" />
      <div className="absolute inset-x-0 top-0 h-[48vh] pointer-events-none bg-gradient-to-b from-[#0d0d0d] via-[#111111]/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[38vh] pointer-events-none bg-gradient-to-t from-[#090909] to-transparent" />

      {/* ── Page content ── */}
      <main className="relative mx-auto flex min-h-screen w-full flex-col px-5 pb-8 pt-8 max-w-md lg:max-w-none lg:px-0">

        {/* ── Header ── */}
        <header className="flex items-center justify-between lg:px-16 xl:px-24">
          <div className="flex items-center gap-3">
            <img
              src={SICKPUNT_LOGO_URL}
              alt="Sick Punt"
              className="h-16 w-16 rounded-xl object-cover shadow-lg"
            />
          </div>
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-white/70">
            <span className="text-white/40 text-xs tracking-widest uppercase">
              Australia's Smartest Betting Tool
            </span>
          </nav>
        </header>

        {/* ── Two-column layout on desktop ── */}
        <div className="mt-10 flex flex-1 flex-col lg:flex-row lg:items-center lg:gap-16 lg:px-16 xl:px-24">

          {/* LEFT — hero copy + CTA */}
          <div
            className={`flex-1 transition-all duration-700 ${
              heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 font-semibold">
              Sick Punt Sports Intelligence
            </p>
            <h1 className="mt-4 text-[52px] font-black leading-[0.9] uppercase tracking-tight sm:text-[64px] lg:text-[80px] xl:text-[96px]">
              THE EDGE
              <br />
              <span className="text-emerald-400">YOU NEED</span>
              <br />
              TO WIN
            </h1>
            <p className="mt-5 max-w-sm text-sm text-white/60 leading-relaxed lg:text-base">
              Live arb opportunities, matched betting, bookmaker intelligence
              and an AI assistant — all in one feed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={getLoginUrl()}
                className="sp-shimmer-btn inline-block rounded-xl bg-[#C9A227] px-8 py-4 text-xl font-black text-black shadow-[0_14px_45px_rgba(201,162,39,0.4)] transition-transform hover:scale-[1.02] active:scale-[0.98] text-center"
              >
                Join Now
              </a>
              <p className="text-xs text-white/50 sm:ml-2">
                Sign in with Google · No credit card required
              </p>
            </div>
          </div>

          {/* RIGHT — feature cards */}
          <div
            className={`mt-10 flex-1 space-y-3 transition-all duration-700 delay-200 lg:mt-0 lg:max-w-md ${
              heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Scout core card */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
              <p className="text-[10px] uppercase tracking-widest text-emerald-300/85 font-semibold">Scout Core</p>
              <p className="mt-2 text-sm text-white/80 leading-relaxed">
                Sports Maximiser, Odds Comparison, Promotion Finder and Bookmaker Intel — scraped live and surfaced in one feed.
              </p>
            </div>

            {/* Three-column mini cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Zap,    label: "Live Odds"   },
                { icon: Bot,    label: "AI Guidance" },
                { icon: Shield, label: "Risk Guard"  },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/40 p-3 text-center backdrop-blur">
                  <Icon className="mx-auto h-4 w-4 text-emerald-300" />
                  <p className="mt-2 text-xs text-white/80">{label}</p>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "103k+", label: "Odds rows" },
                { value: "33",    label: "Sports"    },
                { value: "<5m",   label: "Data lag"  },
              ].map(({ value, label }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-center backdrop-blur">
                  <p className="text-lg font-black text-emerald-400">{value}</p>
                  <p className="mt-1 text-[10px] text-white/55">{label}</p>
                </div>
              ))}
            </div>

            <p className="flex items-center gap-2 text-[11px] text-white/40">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              Sub-5 minute opportunity cache · Australian sports focus
            </p>
          </div>
        </div>

        {/* ── Bottom nav — mobile only ── */}
        <nav
          className={`mt-6 grid grid-cols-5 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur lg:hidden transition-all duration-700 delay-300 ${
            heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {[
            { icon: House,    label: "Home",    active: true  },
            { icon: Trophy,   label: "Sports",  active: false },
            { icon: Tv,       label: "Live",    active: false },
            { icon: BarChart3,label: "Stats",   active: false },
            { icon: UserRound,label: "Account", active: false },
          ].map(({ icon: Icon, label, active }) => (
            <button key={label} className="flex flex-col items-center gap-1 py-1">
              <Icon className={`h-4 w-4 ${active ? "text-[#C9A227]" : "text-white/55"}`} />
              <span className={`text-[11px] ${active ? "text-[#C9A227]" : "text-white/60"}`}>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
