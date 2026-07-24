"use client";

type AuthStepIndicatorProps = {
  step: number;
  total: number;
};

export function AuthStepIndicator({ step, total }: AuthStepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </div>
            {n < total ? <div className="h-px w-8 bg-border" aria-hidden /> : null}
          </div>
        );
      })}
    </div>
  );
}
