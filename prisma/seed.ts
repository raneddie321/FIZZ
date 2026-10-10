/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Provisional plan limits — admin-configurable in /admin/plans. Prices are intentionally
// left unset (null) until RANEDDIE decides on official pricing.
const PLANS = [
  {
    key: "free",
    name: "Free",
    description: "Try FIZZ and FIZZ DEV.",
    sortOrder: 0,
    features: ["FIZZ chat", "FIZZ DEV projects with live preview", "FIZZ Wallet (demo mode)"],
    limits: {
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
    },
  },
  {
    key: "plus",
    name: "Plus",
    description: "More usage for everyday work.",
    sortOrder: 1,
    features: ["Everything in Free", "Sandboxed terminal", "Browser automation (early access)"],
    limits: {
      messagesPerDay: 200,
      agentRunsPerDay: 20,
      maxUploadMb: 25,
      maxProjects: 20,
      terminalMinutesPerMonth: 300,
      imageGenerationsPerDay: 20,
      webSearchesPerDay: 50,
      browserActionsPerDay: 50,
      teamSeats: 1,
      walletAccess: true,
      agentPurchasing: true,
    },
  },
  {
    key: "pro",
    name: "Pro",
    description: "For builders who ship with FIZZ DEV every day.",
    sortOrder: 2,
    features: ["Everything in Plus", "Most capable models", "Priority access to new features"],
    limits: {
      messagesPerDay: 1000,
      agentRunsPerDay: 100,
      maxUploadMb: 50,
      maxProjects: 100,
      terminalMinutesPerMonth: 1500,
      imageGenerationsPerDay: 100,
      webSearchesPerDay: 300,
      browserActionsPerDay: 300,
      teamSeats: 1,
      walletAccess: true,
      agentPurchasing: true,
    },
  },
  {
    key: "team",
    name: "Team",
    description: "Shared workspace and administration for teams.",
    sortOrder: 3,
    features: ["Everything in Pro", "Team seats", "Centralized billing"],
    limits: {
      messagesPerDay: 1000,
      agentRunsPerDay: 100,
      maxUploadMb: 50,
      maxProjects: null,
      terminalMinutesPerMonth: 3000,
      imageGenerationsPerDay: 100,
      webSearchesPerDay: 300,
      browserActionsPerDay: 300,
      teamSeats: 10,
      walletAccess: true,
      agentPurchasing: true,
    },
  },
];

const MODELS = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    displayName: "Claude Opus 5.5",
    description: "Anthropic's default model: strong reasoning, coding and agentic work.",
    isDefault: true,
    supportsVision: true,
    supportsDocuments: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    sortOrder: 0,
    allowedPlans: [] as string[],
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    displayName: "Claude Sonnet 5.5",
    description: "Fast and capable for everyday chat and coding.",
    supportsVision: true,
    supportsDocuments: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    sortOrder: 1,
    allowedPlans: [] as string[],
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    displayName: "Claude Haiku 5.5",
    description: "Lightweight and quick for simple tasks.",
    supportsVision: true,
    supportsDocuments: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    sortOrder: 2,
    allowedPlans: [] as string[],
  },
  {
    id: "claude-fable-5-1",
    provider: "anthropic",
    displayName: "Claude Fable 5.1",
    description: "Anthropic's most capable model for the hardest problems. Higher cost.",
    supportsVision: true,
    supportsDocuments: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    sortOrder: 3,
    allowedPlans: ["pro", "team"],
  },
];

const FLAGS = [
  { key: "signups.enabled", description: "Allow new RANEDDIE ID registrations (local auth mode).", enabled: true },
  { key: "chat.web_search", description: "Allow web search in FIZZ chat (requires provider support).", enabled: true },
  { key: "chat.image_generation", description: "Allow image generation in FIZZ chat (requires an image provider).", enabled: true },
  { key: "dev.git_integration", description: "GitHub import/push in FIZZ DEV.", enabled: true },
  { key: "dev.browser_automation", description: "Isolated browser automation for agents (requires a browser provider).", enabled: false },
  { key: "dev.purchasing", description: "AI-assisted purchasing workflows in FIZZ DEV.", enabled: true },
  { key: "wallet.enabled", description: "Show FIZZ Wallet to users.", enabled: true },
];

async function main() {
  for (const plan of PLANS) {
    await db.plan.upsert({
      where: { key: plan.key },
      create: { ...plan, priceMonthlyCents: null, priceYearlyCents: null },
      // Never overwrite admin edits on re-seed; only fill in missing plans.
      update: {},
    });
  }
  for (const model of MODELS) {
    await db.aiModel.upsert({ where: { id: model.id }, create: model, update: {} });
  }
  for (const flag of FLAGS) {
    await db.featureFlag.upsert({ where: { key: flag.key }, create: flag, update: {} });
  }
  // Backfill Free subscriptions for any users missing one.
  const free = await db.plan.findUniqueOrThrow({ where: { key: "free" } });
  const users = await db.user.findMany({ where: { subscription: null }, select: { id: true } });
  for (const u of users) {
    await db.subscription.create({ data: { userId: u.id, planId: free.id } });
  }
  console.log(`Seeded ${PLANS.length} plans, ${MODELS.length} models, ${FLAGS.length} feature flags; backfilled ${users.length} subscriptions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
