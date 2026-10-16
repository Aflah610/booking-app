import type { CSSProperties } from "react";
import type { BusinessSettingsDTO } from "@/features/settings/settings.dto";
import { textOn } from "@/lib/public-slots";

/** Frame for the pages clients see: the firm's logo, name and colour, with no staff navigation. */
export function PublicShell({ firm, embed = false, children }: { firm: BusinessSettingsDTO; embed?: boolean; children: React.ReactNode }) {
  const style = { "--brand": firm.brandColor, "--on-brand": textOn(firm.brandColor) } as CSSProperties;
  return (
    <div style={style} className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        {!embed && (
          <header className="mb-8 flex items-center gap-3">
            {firm.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the logo can live on any site the admin chooses
              <img src={firm.logoUrl} alt="" className="h-10 w-auto max-w-40 object-contain" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--brand)] text-lg font-bold text-[var(--on-brand)]">{firm.name.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="text-lg font-semibold tracking-tight">{firm.name}</span>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
