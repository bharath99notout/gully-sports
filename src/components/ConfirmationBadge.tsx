import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldX, Hourglass } from 'lucide-react';
import { describeConfirmationState, type ConfirmationState } from '@/lib/matchConfirmation';

interface Props {
  state: ConfirmationState;
  /** When true, render only the icon + label inline (for cards). */
  compact?: boolean;
}

const iconByState: Record<ConfirmationState, React.ComponentType<{ size?: number; className?: string }>> = {
  pending:      Hourglass,
  confirmed:    CheckCircle2,
  disputed:     AlertTriangle,
  force_pushed: ShieldAlert,
  rejected:     ShieldX,
};

const styleByTone: Record<'neutral' | 'warning' | 'danger' | 'success', string> = {
  neutral: 'bg-gray-800/60 text-gray-400 border-gray-700',
  warning: 'bg-amber-950/50 text-amber-400 border-amber-800/60',
  danger:  'bg-red-950/50 text-red-400 border-red-800/60',
  success: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60',
};

/**
 * Pill that shows the trust state of a match. Used inline on feed cards
 * (compact) and on the match detail page (full, with hint).
 *
 * Confirmed matches render nothing in compact mode — that's the default
 * happy path and a green pill on every card would just be visual noise.
 */
export default function ConfirmationBadge({ state, compact = false }: Props) {
  const meta = describeConfirmationState(state);
  const Icon = iconByState[state];
  if (compact && state === 'confirmed') return null;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styleByTone[meta.tone]}`}>
      <Icon size={11} />
      {meta.label}
      {!compact && meta.hint && (
        <span className="text-[10px] font-normal opacity-70 ml-1">· {meta.hint}</span>
      )}
    </span>
  );
}
