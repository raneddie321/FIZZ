import Link from "next/link";
import { Check } from "lucide-react";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SectionHeading } from "@/components/marketing/section";
import { formatPrice, normalizeLimits, LIMIT_LABELS, type PlanLimits } from "@/lib/plans";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

function limitText(key: keyof PlanLimits, value: PlanLimits[keyof PlanLimits]) {
  if (typeof value === "boolean") return value ? LIMIT_LABELS[key] : null;
  if (value === null) return `Unlimited ${LIMIT_LABELS[key].toLowerCase()}`;
  if (value === 0) return null;
  return `${LIMIT_LABELS[key]}: ${value}`;
}

export default async function PricingPage() {
  const plans = await db.plan.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: "asc" } }).catch(() => []);
  return (
    <>
      <Section className="pb-8">
        <SectionHeading
          center
          eyebrow="Pricing"
          title="Plans for every stage"
          description="Start free. Upgrade when you need more usage, larger projects or team features."
        />
      </Section>
      <Section className="pt-0">
        {plans.length === 0 ? (
          <p className="text-center text-muted-foreground">Plans are being finalized. Check back soon.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const limits = normalizeLimits(plan.limits);
              const price = formatPrice(plan.priceMonthlyCents, plan.currency);
              const highlight = plan.key === "pro";
              return (
                <div key={plan.id} className={`flex flex-col rounded-2xl border p-6 ${highlight ? "border-primary/50 ring-1 ring-primary/20" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {highlight && <Badge variant="primary">Popular</Badge>}
                  </div>
                  <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="my-5">
                    {plan.key === "free" ? (
                      <p className="text-3xl font-semibold">Free</p>
                    ) : price ? (
                      <p className="text-3xl font-semibold">
                        {price}
                        <span className="text-sm font-normal text-muted-foreground"> / month</span>
                      </p>
                    ) : (
                      <p className="text-lg font-medium text-muted-foreground">Pricing to be announced</p>
                    )}
                  </div>
                  <Button asChild variant={highlight ? "primary" : "outline"} className="w-full">
                    <Link href={plan.key === "free" ? "/signup" : "/billing"}>{plan.key === "free" ? "Get started" : "Choose plan"}</Link>
                  </Button>
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                    {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => {
                      const text = limitText(key, limits[key]);
                      return text ? (
                        <li key={key} className="flex gap-2 text-muted-foreground">
                          <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                          {text}
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          Plan names, limits and prices are provisional and may change before general availability. Taxes may apply.
        </p>
      </Section>
    </>
  );
}
