import { STATE_LABEL, STATE_TONE, type ClientState } from "@/lib/adminApi";

export function StateBadge({ state }: { state: ClientState }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${STATE_TONE[state]}`}
      data-testid="admin-state"
    >
      {STATE_LABEL[state]}
    </span>
  );
}
