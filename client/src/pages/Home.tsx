import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  Zap,
  Shield,
  Bot,
  RefreshCw,
  CircleHelp,
  House,
  Trophy,
  Tv,
  Spade,
  UserRound,
} from "lucide-react";

const INTRO_STORAGE_KEY = "sickpunt_intro_seen_v1";
const SICKPUNT_LOGO_URL = "https://i.imgur.com/4k1Ov7i.png";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [showIntro, setShowIntro] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      window.location.href = "/dashboard";
    }
  }, [isAuthenticated, loading]);

  useEffect(() => {
    if (loading || isAuthenticated) return;

    const hasSeenIntro = localStorage.getItem(INTRO_STORAGE_KEY) === "1";
    setShowIntro(!hasSeenIntro);

    // Always animate hero copy entrance, even if intro is skipped.
    const timer = setTimeout(() => setHeroVisible(true), hasSeenIntro ? 80 : 220);
    return () => clearTimeout(timer);
  }, [loading, isAuthenticated]);

  const freezeCurrentFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrozenFrame(canvas.toDataURL("image/jpeg", 0.92));
  };

  const closeIntro = () => {
    freezeCurrentFrame();
    localStorage.setItem(INTRO_STORAGE_KEY, "1");
    setShowIntro(false);
    setHeroVisible(true);
  };

  const replayIntro = () => {
    localStorage.removeItem(INTRO_STORAGE_KEY);
    setShowIntro(true);
    setHeroVisible(false);
    setTimeout(() => {
      videoRef.current?.play().catch(() => {});
    }, 40);
  };

  if (loading) return null;
  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#090909] text-white relative overflow-hidden">
      {showIntro && (
        <div className="fixed inset-0 z-50 bg-black">
          <video
            ref={videoRef}
            src="/media/sickpunt-intro.mp4"
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            onEnded={closeIntro}
          />
          <button
            onClick={closeIntro}
            className="absolute top-5 right-5 rounded-full border border-white/35 bg-black/45 px-4 py-2 text-sm backdrop-blur"
          >
            Skip Intro
          </button>
        </div>
      )}

      {frozenFrame && (
        <img
          src={frozenFrame}
          alt="Intro final frame"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_90%_at_50%_55%,rgba(38,166,91,0.35),rgba(9,9,9,0.96)_58%)]" />
      <div className="absolute inset-x-0 top-0 h-[48vh] pointer-events-none bg-gradient-to-b from-[#151515] via-[#111111] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[38vh] pointer-events-none bg-gradient-to-t from-[#090909] to-transparent" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-7 pt-8">
        <div className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SICKPUNT_LOGO_URL} alt="Sick Punt" className="h-10 w-10 rounded-md object-cover" />
            <p className="text-3xl font-black tracking-tight uppercase">Sick Punt</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-1 text-lg text-white/90">
              <CircleHelp className="h-5 w-5" />
              <span className="text-base">Help</span>
            </button>
            <button
              onClick={replayIntro}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1.5 text-xs text-white/85 hover:border-white/45"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Replay
            </button>
          </div>
        </div>

        <div
          className={`transition-all duration-700 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-lg tracking-wide text-white/60 font-semibold">SICK PUNT SPORTS BETTING</p>
          <h1 className="mt-3 text-[58px] font-black leading-[0.92] uppercase tracking-tight sm:text-7xl">
            THE LATEST ODDS
            <br />
            AND BETTING
          </h1>
          <a
            href={getLoginUrl()}
            className="mt-7 inline-block rounded-lg bg-[#ffe334] px-7 py-3 text-xl font-black text-black shadow-[0_14px_45px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.02]"
          >
            Join Now
          </a>
          <p className="mt-3 text-sm text-white/65">Sign in with Google. No credit card required.</p>
          <p className="mt-1 text-xs text-white/50">Create your account and keep full history of bets and opportunities.</p>
        </div>

        <div className="relative mt-auto h-[33vh] min-h-[220px]">
          <div className="absolute left-[10%] top-[30%] h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="absolute right-[14%] top-[38%] h-20 w-20 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="absolute inset-x-[6%] bottom-0 h-24 rounded-t-[45px] bg-gradient-to-t from-black/70 via-black/45 to-transparent" />
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/12 bg-black/35 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-emerald-300/85">Scout Core</p>
            <p className="mt-1 text-sm text-white/85">Sports Maximiser, Odds Comparison, Promotion Finder, and Bookmaker Intel in one feed.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Zap, label: "Live Odds" },
              { icon: Bot, label: "AI Guidance" },
              { icon: Shield, label: "Risk Guard" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-xl border border-white/12 bg-black/35 p-3 text-center backdrop-blur">
                <Icon className="mx-auto h-4 w-4 text-emerald-300" />
                <p className="mt-2 text-xs text-white/80">{label}</p>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[11px] text-white/45">
            <TrendingUp className="h-3.5 w-3.5" />
            Data freshness target from architecture: sub-5 minute opportunity cache.
          </p>
        </div>

        <nav className="mt-4 grid grid-cols-5 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur">
          {[
            { icon: House, label: "Home", active: true },
            { icon: Trophy, label: "Sports" },
            { icon: Tv, label: "Live" },
            { icon: Spade, label: "Casino" },
            { icon: UserRound, label: "Account" },
          ].map(({ icon: Icon, label, active }) => (
            <button key={label} className="flex flex-col items-center gap-1 py-1">
              <Icon className={`h-4 w-4 ${active ? "text-[#ffe334]" : "text-white/60"}`} />
              <span className={`text-[11px] ${active ? "text-[#ffe334]" : "text-white/65"}`}>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
