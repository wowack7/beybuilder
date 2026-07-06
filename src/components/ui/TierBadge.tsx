interface TierBadgeProps {
  tier: string
  /** 階級是同名家族繼承而來（非該變體實測） */
  inherited?: boolean
}

function tierGroup(tier: string): string {
  if (!tier) return 'none'
  if (tier === 'X') return 'x'
  const head = tier[0].toLowerCase()
  return ['s', 'a', 'b', 'c', 'd', 'e'].includes(head) ? head : 'none'
}

export function TierBadge({ tier, inherited = false }: TierBadgeProps) {
  return (
    <span
      className="tier-badge"
      data-group={tierGroup(tier)}
      title={inherited ? '階級由同系列基本款繼承' : undefined}
    >
      {tier || '—'}
      {inherited ? '*' : ''}
    </span>
  )
}
