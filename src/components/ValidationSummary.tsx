import type { LayoutAssessment } from '../lib/types'

export function ValidationSummary({ assessment }: { assessment: LayoutAssessment }) {
  return (
    <div className="panel">
      <div className="space-between">
        <div className="section-title">Layout quality</div>
        <div className="score-pill">{assessment.score}/100 | {assessment.verdict}</div>
      </div>
      <div className="stack">
        {assessment.visual ? (
          <div className="hint">
            Visual quality: <strong>{assessment.visual.overallScore}/100 | {assessment.visual.band}</strong>
          </div>
        ) : null}
        {assessment.issues.map((issue, index) => (
          <div key={issue.code || index} className={`alert ${issue.severity === 'high' ? 'error' : issue.severity === 'medium' ? 'warning' : 'ok'}`}>
            {issue.message}
          </div>
        ))}
        {assessment.visual?.warnings.slice(0, 2).map((item, index) => (
          <div key={`visual-${index}`} className="alert warning">
            {item}
          </div>
        ))}
        {assessment.aiReview?.recommendations.map((item, index) => (
          <div key={`ai-${index}`} className="alert ok">
            {item}
          </div>
        ))}
        {(assessment.aiReview?.likelyRootCauses?.length || assessment.aiReview?.likelyRootCause?.length) ? (
          <div className="hint">Root cause: {(assessment.aiReview?.likelyRootCauses || assessment.aiReview?.likelyRootCause || []).join(', ')}</div>
        ) : null}
      </div>
    </div>
  )
}
