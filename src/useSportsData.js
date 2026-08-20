import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function usePadres({ enabled = true, intervalMs = 60_000, refreshKey = 0 } = {}) {
  const [game, setGame] = useState(null)
  const [latestGame, setLatestGame] = useState(null)
  const [nextGame, setNextGame] = useState(null)
  const [standing, setStanding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const todayResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${localDateStr()}&teamId=135`)
        if (!todayResponse.ok) throw new Error(`MLB HTTP ${todayResponse.status}`)
        const today = await todayResponse.json()
        if (cancelled) return
        const current = today.dates?.[0]?.games?.[0]

        if (current) {
          setNextGame(null)
          const padresAway = current.teams.away.team.id === 135
          const padresSide = padresAway ? current.teams.away : current.teams.home
          const opponentSide = padresAway ? current.teams.home : current.teams.away
          setGame({
            gamePk: current.gamePk,
            state: current.status.abstractGameState,
            detailedState: current.status.detailedState,
            padresScore: padresSide.score ?? 0,
            opponentScore: opponentSide.score ?? 0,
            opponent: opponentSide.team.name,
            padresAway,
            padresHome: !padresAway,
            venue: current.venue?.name,
            gameDate: current.gameDate,
            wins: padresSide.leagueRecord?.wins,
            losses: padresSide.leagueRecord?.losses,
          })
        } else {
          setGame(null)
        }

        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const recentResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&startDate=${localDateStr(weekAgo)}&endDate=${localDateStr(yesterday)}`)
        if (recentResponse.ok) {
          const recent = await recentResponse.json()
          if (cancelled) return
          const games = (recent.dates ?? []).flatMap(date => date.games ?? [])
          const latest = games.filter(item => item.status.abstractGameState === 'Final').at(-1)
          if (latest) {
            const padresAway = latest.teams.away.team.id === 135
            const padresSide = padresAway ? latest.teams.away : latest.teams.home
            const opponentSide = padresAway ? latest.teams.home : latest.teams.away
            setLatestGame({
              gamePk: latest.gamePk,
              state: 'Final',
              detailedState: latest.status.detailedState,
              padresScore: padresSide.score ?? 0,
              opponentScore: opponentSide.score ?? 0,
              opponent: opponentSide.team.name,
              padresAway,
              padresHome: !padresAway,
              venue: latest.venue?.name,
              gameDate: latest.gameDate,
            })
          } else {
            setLatestGame(null)
          }
        }

        const season = new Date().getFullYear()
        const standingsResponse = await fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=${season}&standingsTypes=regularSeason`)
        if (standingsResponse.ok) {
          const standings = await standingsResponse.json()
          if (cancelled) return
          const padresStanding = (standings.records ?? []).flatMap(record => record.teamRecords ?? []).find(team => team.team?.id === 135)
          if (padresStanding) {
            setStanding({
              divisionRank: padresStanding.divisionRank,
              leagueRank: padresStanding.leagueRank,
              wildCardRank: padresStanding.wildCardRank,
              gamesBack: padresStanding.gamesBack,
              wins: padresStanding.wins,
              losses: padresStanding.losses,
            })
          }
        }

        const futureStart = new Date()
        futureStart.setDate(futureStart.getDate() + 1)
        const futureEnd = new Date()
        futureEnd.setDate(futureEnd.getDate() + 14)
        const futureResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&startDate=${localDateStr(futureStart)}&endDate=${localDateStr(futureEnd)}`)
        if (futureResponse.ok) {
          const future = await futureResponse.json()
          if (cancelled) return
          const upcoming = future.dates?.[0]?.games?.[0]
          if (upcoming) {
            const padresAway = upcoming.teams.away.team.id === 135
            const padresSide = padresAway ? upcoming.teams.away : upcoming.teams.home
            const opponentSide = padresAway ? upcoming.teams.home : upcoming.teams.away
            setNextGame({
              gameDate: upcoming.gameDate,
              opponent: opponentSide.team.name,
              padresHome: !padresAway,
              venue: upcoming.venue?.name,
              wins: padresSide.leagueRecord?.wins,
              losses: padresSide.leagueRecord?.losses,
            })
          }
        }

        if (!cancelled) {
          setError(null)
          setLastUpdated(new Date())
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        inFlight = false
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs, refreshKey])

  return { game, latestGame, nextGame, standing, loading, error, lastUpdated }
}

export function useSoccerScores({ enabled = true, intervalMs = 60_000, refreshKey = 0 } = {}) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const { data, error: functionError } = await supabase.functions.invoke('sports')
        if (functionError) throw new Error(functionError.message)
        if (cancelled) return
        setTeams(data?.teams ?? [])
        setError(data?.error ?? null)
        setLastUpdated(data?.updatedAt ? new Date(data.updatedAt) : new Date())
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        inFlight = false
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs, refreshKey])

  return { teams, loading, error, lastUpdated }
}
