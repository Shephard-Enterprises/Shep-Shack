import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { nextGameLabel } from './sports-team-model'

const formatDate = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }) : null

function GameRow({ game, upcoming, now }) {
  const date = game.date ? formatDate(game.date) : game.dateLabel
  const ours = Number(game.score), theirs = Number(game.opponentScore)
  const result = Number.isFinite(ours) && Number.isFinite(theirs) ? (ours > theirs ? 'W' : ours < theirs ? 'L' : 'D') : null
  return <li className="team-hub-game">
    <div><span>{upcoming ? nextGameLabel(game, now) : date || 'Date unavailable'}</span><strong>{game.home ? 'vs' : '@'} {game.opponent}</strong>{game.competition && <small>{game.competition}</small>}</div>
    {upcoming ? <small>{game.venue || 'Venue not supplied'}</small> : <strong className="team-hub-result">{result && <b>{result}</b>} {game.score ?? '—'}–{game.opponentScore ?? '—'}</strong>}
  </li>
}

export default function SportsTeamHub({ team, now, onBack, renderDetails }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const heading = useRef(null)
  useEffect(() => {
    heading.current?.focus()
    let cancelled = false
    async function load() {
      try {
        const result = await supabase.functions.invoke('sports', { body: { teamKey: team.key } })
        if (cancelled) return
        if (result.error) throw new Error(result.error.message)
        if (!result.data?.team || result.data.team.key !== team.key) throw new Error('Team details unavailable')
        setData(result.data)
        setError(null)
      } catch (failure) { if (!cancelled) setError(failure.message) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load() }, 5 * 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [team.key, retry])
  const next = data?.upcoming?.[0]
  const record = data?.record
  const detailTeam = record ? { ...team, record: record.value, standing: record.standing } : team
  return <section className="team-hub" aria-label={`${team.name} team hub`}>
    <button className="team-hub-back" onClick={onBack}>← All teams</button>
    <header className="team-hub-header">
      {team.logo && <img src={team.logo} alt=""/>}
      <div><p className="cardLabel">{team.league} · TEAM HUB</p><h2 ref={heading} tabIndex={-1}>{team.name}</h2><p>{team.isLive ? 'Live now' : next ? `Next game · ${nextGameLabel(next, now)}` : data?.errors.schedule ? 'Schedule feed unavailable' : loading ? 'Checking team coverage…' : 'Season review & club updates'}</p></div>
    </header>
    <nav className="team-hub-tabs" aria-label="Team coverage">{['overview', 'schedule', 'news'].map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === 'overview' ? 'Season overview' : value === 'schedule' ? 'Schedule & results' : 'Club news'}</button>)}</nav>
    {loading && <p className="team-hub-message" role="status">Loading team coverage…</p>}
    {error && <div className="team-hub-message" role="alert"><p>Team coverage is temporarily unavailable. {data ? 'Last loaded details are shown below.' : 'Latest game details are still available below.'}</p><button onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Try again</button></div>}
    {tab === 'overview' && <div className="team-hub-grid">
      <section className="team-hub-panel">
        <p className="cardLabel">{data?.season?.year ? `${data.season.label} · REGULAR SEASON` : 'TEAM COVERAGE'}</p><h3>Season snapshot</h3>
        {record ? <><div className="team-hub-record"><strong>{record.value}</strong><span>{record.label}</span></div>{record.standing && <p>{record.standing}</p>}<dl>{[['Points', record.points], ['Goals for', record.goalsFor], ['Goals against', record.goalsAgainst]].filter(([, value]) => value != null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><small className="team-hub-source">{record.source}</small></> : <p className="team-hub-message">{loading ? 'Checking season record…' : data?.errors.record || 'Season record is not supplied by this feed.'}</p>}
        {data?.leaders?.length > 0 && <><h3>Season leaders</h3><ul className="team-hub-leaders">{data.leaders.map((leader, index) => <li key={`${leader.label}-${index}`}><span>{leader.label}<strong>{leader.name}</strong></span><b>{leader.value}</b></li>)}</ul><small className="team-hub-source">Regular season · {data.leadersSource}</small></>}
        {data?.errors.leaders && <p className="team-hub-message">{data.errors.leaders}</p>}
        {data?.sources.roster && <a className="team-hub-link" href={data.sources.roster} target="_blank" rel="noreferrer">Official roster ↗</a>}
      </section>
      <section className="team-hub-panel"><p className="cardLabel">ON THE CALENDAR</p><h3>{next ? 'Next published game' : 'Looking ahead'}</h3>
        {next ? <><p className="team-hub-match">{next.home ? 'vs' : '@'} {next.opponent}</p><p>{nextGameLabel(next, now)}</p>{next.venue && <p className="team-hub-message">{next.venue}</p>}{next.competition && <p className="team-hub-message">{next.competition}</p>}</> : <p className="team-hub-message">{loading ? 'Checking the published schedule…' : data?.errors.schedule || 'No upcoming games are listed in this feed. The club may have announced additional dates on its official site.'}</p>}
        {data?.sources.schedule && <a className="team-hub-link" href={data.sources.schedule} target="_blank" rel="noreferrer">Official schedule ↗</a>}
        <h3>Latest club update</h3>{data?.news?.[0] ? <NewsItem article={data.news[0]}/> : <p className="team-hub-message">{loading ? 'Checking club news…' : data?.errors.news || 'No recent headlines in the feed.'}</p>}
      </section>
      <section className="team-hub-panel team-hub-latest"><p className="cardLabel">LATEST GAME DETAILS</p>{renderDetails(detailTeam)}</section>
    </div>}
    {tab === 'schedule' && <div className="team-hub-grid">
      <section className="team-hub-panel"><p className="cardLabel">PUBLISHED DATES · PACIFIC</p><h3>Upcoming games</h3>
        {data?.errors.schedule && <p role="status" className="team-hub-message">{data.errors.schedule}</p>}
        {data?.upcoming?.length ? <ul>{data.upcoming.map((game, index) => <GameRow key={game.id ?? index} game={game} upcoming now={now}/>)}</ul> : <p className="team-hub-message">{loading ? 'Loading schedule…' : 'No upcoming games in the feed. Check the official schedule for newly announced dates.'}</p>}
        {data?.scheduleNote && <p className="team-hub-message">{data.scheduleNote}</p>}
        {data?.sources.schedule && <a className="team-hub-link" href={data.sources.schedule} target="_blank" rel="noreferrer">Full official schedule ↗</a>}
      </section>
      <section className="team-hub-panel"><p className="cardLabel">MOST RECENT FINALS</p><h3>Recent results</h3>{data?.recent?.length ? <ul>{data.recent.map((game, index) => <GameRow key={game.id ?? index} game={game} now={now}/>)}</ul> : <p className="team-hub-message">{loading ? 'Loading results…' : 'No recent finals supplied by the feed.'}</p>}</section>
    </div>}
    {tab === 'news' && <section className="team-hub-panel team-hub-news"><p className="cardLabel">FROM THE CLUB & TRUSTED COVERAGE</p><h3>Latest headlines</h3><p className="team-hub-message">Roster moves, coaching updates and schedule announcements, as published by the sources below.</p>
      {data?.errors.news && <p className="team-hub-message" role="status">{data.errors.news}</p>}
      {data?.news?.length ? <ul>{data.news.map(article => <li key={article.url}><NewsItem article={article}/></li>)}</ul> : <p className="team-hub-message">{loading ? 'Loading headlines…' : 'No recent headlines available.'}</p>}
      {data?.sources.news && <a className="team-hub-link" href={data.sources.news} target="_blank" rel="noreferrer">Official team news ↗</a>}
    </section>}
    {data?.updatedAt && <p className="team-hub-updated">Coverage checked {new Date(data.updatedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT · Game details and headlines may update at different times.</p>}
  </section>
}

function NewsItem({ article }) {
  return <article className="team-hub-headline"><a href={article.url} target="_blank" rel="noreferrer">{article.title} ↗</a><small>{article.source}{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ''}</small></article>
}
