import type { SubscriptionPlan } from '@/types';

/** Clickable plan-card grid, shared between company registration and subscription management. */
export function PlanPicker({
  plans,
  selected,
  onSelect,
}: {
  plans: Record<string, SubscriptionPlan> | undefined;
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="plan-grid">
      {Object.values(plans ?? {}).map((plan) => (
        <div
          key={plan.code}
          className={`plan-card${selected === plan.code ? ' plan-card--selected' : ''}`}
          onClick={() => onSelect(plan.code)}
        >
          <span className="plan-card__label">{plan.label}</span>
          <span className="plan-card__price">{plan.monthlyPrice.toFixed(0)} TND/mo</span>
          <span className="plan-card__description">{plan.description}</span>
        </div>
      ))}
    </div>
  );
}
