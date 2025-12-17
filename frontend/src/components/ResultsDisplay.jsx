import './ResultsDisplay.css'

export function ResultsDisplay({ data, type }) {
  if (!data) {
    return null
  }

  // Handle error state
  if (data.error) {
    return (
      <div className="results-container">
        <div className="results-error">
          <h3>Error</h3>
          <p>{data.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="results-container">
      <div className="results-header">
        <h3>{type === 'pr-tracker' ? 'PR Tracker Results' : 'Team Report Results'}</h3>
      </div>

      <div className="results-content">
        {type === 'pr-tracker' ? (
          <PRTrackerResults data={data} />
        ) : (
          <TeamReportResults data={data} />
        )}
      </div>
    </div>
  )
}

function PRTrackerResults({ data }) {
  // Handle array of PRs
  if (Array.isArray(data)) {
    return (
      <div className="pr-list">
        {data.map((pr, index) => (
          <div key={index} className="pr-item">
            <div className="pr-title">
              <a href={pr.url} target="_blank" rel="noopener noreferrer">
                {pr.title || pr.name || `PR #${pr.number || index + 1}`}
              </a>
            </div>
            {pr.author && <div className="pr-meta">Author: {pr.author}</div>}
            {pr.status && <div className="pr-meta">Status: {pr.status}</div>}
            {pr.createdAt && <div className="pr-meta">Created: {new Date(pr.createdAt).toLocaleDateString()}</div>}
          </div>
        ))}
      </div>
    )
  }

  // Handle object with nested data
  return <pre className="json-output">{JSON.stringify(data, null, 2)}</pre>
}

function TeamReportResults({ data }) {
  // Handle structured team report
  if (data.members || data.summary) {
    return (
      <div className="team-report">
        {data.summary && (
          <div className="report-section">
            <h4>Summary</h4>
            <div className="summary-stats">
              {Object.entries(data.summary).map(([key, value]) => (
                <div key={key} className="stat-item">
                  <span className="stat-label">{key}:</span>
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.members && Array.isArray(data.members) && (
          <div className="report-section">
            <h4>Team Members</h4>
            <div className="members-list">
              {data.members.map((member, index) => (
                <div key={index} className="member-card">
                  <div className="member-name">{member.name || member.username}</div>
                  {member.contributions && (
                    <div className="member-stats">
                      <span>Contributions: {member.contributions}</span>
                    </div>
                  )}
                  {member.commits && (
                    <div className="member-stats">
                      <span>Commits: {member.commits}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Fallback to JSON display
  return <pre className="json-output">{JSON.stringify(data, null, 2)}</pre>
}
