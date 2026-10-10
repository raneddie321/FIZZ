/** Shape of Plan.limits. `null` means unlimited. All values are admin-configurable. */
export type PlanLimits = {
  messagesPerDay: number | null;
  agentRunsPerDay: number | null;
  maxUploadMb: number;
  maxProjects: number | null;
  terminalMinutesPerMonth: number | null;
  imageGenerationsPerDay: number | null;
  webSearchesPerDay: number | null;
  browserActionsPerDay: number | null;
  teamSeats: number;
  walletAccess: boolean;
  agentPurchasing: boolean;
};

export const DEFAULT_LIMITS: PlanLimits = {
  messagesPerDay: 30,
  agentRunsPerDay: 3,
  maxUploadMb: 10,
  maxProjects: 3,
  terminalMinutesPerMonth: 0,
  imageGenerationsPerDay: 3,
  webSearchesPerDay: 5,
  browserActionsPerDay: 0,
  teamSeats: 1,
  walletAccess: true,
  agentPurchasing: false,
};

export function normalizeLimits(raw: unknown): PlanLimits {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<PlanLimits>;
  return { ...DEFAULT_LIMITS, ...value };
}

export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  messagesPerDay: "Chat messages per day",
  agentRunsPerDay: "FIZZ DEV agent runs per day",
  maxUploadMb: "Max upload size (MB)",
  maxProjects: "Active projects",
  terminalMinutesPerMonth: "Sandbox terminal minutes per month",
  imageGenerationsPerDay: "Image generations per day",
  webSearchesPerDay: "Web searches per day",
  browserActionsPerDay: "Browser automation actions per day",
  teamSeats: "Team seats",
  walletAccess: "FIZZ Wallet access",
  agentPurchasing: "Agent-assisted purchasing",
};

export function formatPrice(cents: number | null | undefined, currency = "USD") {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
