import { type ReactElement } from 'react'
import { AGENT_INSTALL_TARGETS, type AgentInstallTarget } from '../model/skillDistribution'

export function SkillTargetSelector({
  value,
  onChange
}: {
  value: AgentInstallTarget
  onChange: (value: AgentInstallTarget) => void
}): ReactElement {
  return (
    <div className="skill-target-selector" role="group" aria-label="选择目标 Agent">
      {AGENT_INSTALL_TARGETS.map((target) => (
        <button
          key={target.value}
          type="button"
          className={value === target.value ? 'active' : ''}
          onClick={() => onChange(target.value)}
        >
          {target.label}
        </button>
      ))}
    </div>
  )
}
