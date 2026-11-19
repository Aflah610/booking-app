import { setLeadsOnlineAction } from "./actions";

type Member = { id: string; name: string; online: boolean };

/**
 * Who gets the next new lead. Leads go round the team in turn; switching Offline (going home, on a break) sends them to
 * whoever is still Online. Each person switches themselves; whoever sees all leads can switch anyone.
 */
export function OnlinePanel({ team, meId, manager }: { team: Member[]; meId: string; manager: boolean }) {
  if (team.length === 0) return null;
  const me = team.find((p) => p.id === meId);
  const others = team.filter((p) => p.id !== meId);
  const onlineNames = team.filter((p) => p.online).map((p) => (p.id === meId ? "you" : p.name.split(" ")[0]));
  const nobody = onlineNames.length === 0;
  return (
    <section className="card mb-5 overflow-hidden" aria-label="Taking new leads">
      <div className="flex flex-wrap items-center gap-4 p-4">
        {me && (
          <form action={setLeadsOnlineAction.bind(null, me.id, !me.online)} className="flex items-center gap-3">
            <button
              type="submit"
              role="switch"
              aria-checked={me.online}
              aria-label={me.online ? "You are online. Switch offline" : "You are offline. Switch online"}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${me.online ? "bg-green-600" : "bg-zinc-300"}`}
            >
              <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 motion-reduce:transition-none ${me.online ? "translate-x-5" : ""}`} />
            </button>
            <span>
              <span className="block text-sm font-semibold">{me.online ? "You're online" : "You're offline"}</span>
              <span className="block text-xs text-zinc-600">{me.online ? "New leads come to you in turn." : "New leads go to the rest of the team."}</span>
            </span>
          </form>
        )}
        {others.length > 0 && (
          <div className={`flex flex-wrap items-center gap-2 ${me ? "border-l border-zinc-200 pl-4" : ""}`}>
            {others.map((p) => (
              <form key={p.id} action={setLeadsOnlineAction.bind(null, p.id, !p.online)} className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-1">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${p.online ? "bg-green-600" : "bg-zinc-400"}`} />
                <span className="text-sm">{p.name.split(" ")[0]} · {p.online ? "Online" : "Offline"}</span>
                {manager ? (
                  <button type="submit" className="btn-ghost px-2 py-0.5 text-xs">{p.online ? "Set offline" : "Set online"}</button>
                ) : <span className="pr-2" />}
              </form>
            ))}
          </div>
        )}
      </div>
      <p className={`border-t px-4 py-2 text-xs ${nobody ? "border-red-200 bg-red-50 text-red-800" : "border-zinc-100 bg-zinc-50 text-zinc-600"}`}>
        {nobody
          ? "Nobody is online, so new leads wait as Not assigned until someone comes online."
          : `New leads go in turn to ${onlineNames.join(" and ")}.`}
      </p>
    </section>
  );
}
