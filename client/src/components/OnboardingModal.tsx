import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, TrendingUp, Eye, ChevronRight } from "lucide-react";

const STEPS = [
  {
    icon: TrendingUp,
    iconColour: "text-emerald-400",
    title: "Welcome to Sick Punt",
    body: (
      <>
        <p>
          Sick Punt is a <strong>sports betting intelligence tool</strong> built for Australian punters.
        </p>
        <p className="mt-3">
          It scans live odds from dozens of bookmakers, finds mismatches where you can lock in a
          guaranteed profit regardless of the result, and surfaces the best promotions — all in one
          place.
        </p>
        <p className="mt-3 text-zinc-400 text-sm">
          Think of it as a research assistant. You always make the final call.
        </p>
      </>
    ),
  },
  {
    icon: ShieldCheck,
    iconColour: "text-blue-400",
    title: "Your money stays with you",
    body: (
      <>
        <p>
          Sick Punt <strong>never touches your money</strong>. We don't have access to your bookmaker
          accounts and we never place bets on your behalf.
        </p>
        <p className="mt-3">
          When you tap <strong>"Place Bets"</strong> on an opportunity, it:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-300 list-none">
          <li>✓ Logs the bet in your personal history</li>
          <li>✓ Opens the bookmaker's site in a new tab</li>
          <li>✓ You place the bet yourself, directly with the bookmaker</li>
        </ul>
        <p className="mt-3 text-zinc-400 text-sm">
          Every transaction goes through the licensed, regulated bookmaker — not through us.
        </p>
      </>
    ),
  },
  {
    icon: Eye,
    iconColour: "text-[#C9A227]",
    title: "Try it risk-free with Paper Mode",
    body: (
      <>
        <p>
          Not ready to bet real money yet? Use <strong>Paper Mode</strong>.
        </p>
        <p className="mt-3">
          In Paper Mode you follow the same recommendations — but instead of placing real bets,
          you track them virtually. After a few weeks you can see exactly what you{" "}
          <em>would have</em> won or lost.
        </p>
        <p className="mt-3">
          It's the best way to get comfortable with the strategy before committing real money.
        </p>
        <p className="mt-3 text-zinc-400 text-sm">
          You can switch between Paper Mode and Live Mode at any time from the dashboard.
        </p>
      </>
    ),
  },
];

const STORAGE_KEY = "sp_onboarded";

export function useOnboarding() {
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };
  return { open, dismiss };
}

export function OnboardingModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="bg-zinc-900 border-zinc-800 text-white max-w-md p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Progress bar */}
        <div className="flex gap-1 p-4 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "bg-emerald-500" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <div className="p-6 pt-5">
          {/* Icon */}
          <div className={`inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-zinc-800 mb-4 ${current.iconColour}`}>
            <Icon className="h-6 w-6" />
          </div>

          {/* Content */}
          <h2 className="text-xl font-black text-white mb-3">{current.title}</h2>
          <div className="text-sm text-zinc-300 leading-relaxed">{current.body}</div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <Button
              onClick={() => (isLast ? onDone() : setStep(step + 1))}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6"
            >
              {isLast ? "Let's go" : (
                <span className="flex items-center gap-1.5">
                  Next <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </div>

          {/* Step indicator */}
          <p className="text-center text-xs text-zinc-600 mt-3">
            {step + 1} of {STEPS.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
