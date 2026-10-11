import "server-only";
import type { ProjectType } from "@prisma/client";
import { db } from "../db";
import { badRequest, limitReached } from "../http";
import { getEffectivePlan } from "../billing/subscriptions";
import { audit } from "../audit";
import { getTemplate, renderTemplate } from "./templates";
import { writeFile } from "./files";

export const PROJECT_TYPES: ProjectType[] = ["WEBSITE", "WEB_APP", "MOBILE_APP", "DESKTOP_APP", "GAME", "DASHBOARD", "SAAS", "API", "AUTOMATION", "ECOMMERCE", "PORTFOLIO", "BUSINESS", "OTHER"];

export type ProjectSettings = {
  model?: string | null;
  /** "always": every command needs approval. "installs": only installs / network-affecting commands. */
  commandApproval?: "always" | "installs";
  reviewPlan?: boolean;
  previewEntry?: string;
  devServerPort?: number;
};

export function projectSettings(raw: unknown): Required<Pick<ProjectSettings, "commandApproval" | "reviewPlan">> & ProjectSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as ProjectSettings;
  return { commandApproval: s.commandApproval ?? "always", reviewPlan: s.reviewPlan ?? false, ...s };
}

export async function createProject(userId: string, input: { name: string; description: string; type: ProjectType; template: string; stack?: string }) {
  const template = getTemplate(input.template);
  if (!template) throw badRequest("Unknown template.");
  const { limits } = await getEffectivePlan(userId);
  if (limits.maxProjects !== null) {
    const count = await db.project.count({ where: { ownerId: userId, archivedAt: null } });
    if (count >= limits.maxProjects) throw limitReached(`Your plan allows ${limits.maxProjects} active projects. Archive a project or upgrade your plan.`);
  }
  const project = await db.project.create({
    data: {
      ownerId: userId,
      name: input.name,
      description: input.description,
      type: input.type,
      template: template.id,
      stack: input.stack?.trim() || template.stack,
      settings: { previewEntry: template.previewEntry ?? "index.html", commandApproval: "always", reviewPlan: false },
    },
  });
  for (const f of renderTemplate(template, input)) {
    await writeFile(project.id, f.path, f.content, { author: "SYSTEM", userId, message: `Created from template "${template.name}"` });
  }
  await audit({ userId, action: "project.created", targetType: "Project", targetId: project.id, metadata: { template: template.id } });
  return project;
}
