import React from 'react'
import {
  REPORT_TASK_STEPS,
  ReportGenerationPhase
} from '../../hooks/useGroupReportGeneration'

interface ReportTaskStatusPanelProps {
  phase: ReportGenerationPhase
  error: string
  onRetry: () => void
}

const phaseIndex = (phase: ReportGenerationPhase): number =>
  REPORT_TASK_STEPS.findIndex((step) => step.id === phase)

export function ReportTaskStatusPanel({
  phase,
  error,
  onRetry
}: ReportTaskStatusPanelProps): React.ReactElement {
  const activeIndex = phaseIndex(phase)
  const completedAll = phase === 'success'

  return (
    <aside className="report-task-panel">
      <div className="report-task-header">
        <h2>任务状态</h2>
        <p>
          {completedAll
            ? '生成完成'
            : phase === 'error'
              ? '生成失败'
              : activeIndex >= 0
                ? `${activeIndex + 1}/${REPORT_TASK_STEPS.length}`
                : '等待开始'}
        </p>
      </div>
      <div className="report-task-steps">
        {REPORT_TASK_STEPS.map((step, index) => {
          const state =
            completedAll || (activeIndex >= 0 && index < activeIndex)
              ? 'done'
              : activeIndex === index
                ? 'active'
                : 'waiting'
          return (
            <div key={step.id} className={`report-task-step ${state}`}>
              <span className="report-task-dot" aria-hidden />
              <div>
                <b>{step.label}</b>
                <small>
                  {state === 'done' ? '已完成' : state === 'active' ? '进行中' : '等待中'}
                </small>
              </div>
            </div>
          )
        })}
      </div>
      {phase === 'error' && (
        <div className="report-task-error">
          <b>错误摘要</b>
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}
      {phase === 'success' && (
        <div className="report-task-success">
          <b>生成成功</b>
          <p>HTML 与 PNG 已导出，可以查看生成结果。</p>
        </div>
      )}
      <div className="report-task-note">
        模型调用耗时取决于你配置的服务，当前只展示真实执行阶段。
      </div>
    </aside>
  )
}
