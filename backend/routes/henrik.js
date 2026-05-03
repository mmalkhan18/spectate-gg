const axios = require('axios')
console.log('Henrik key loaded:', process.env.HENRIK_API_KEY ? 'YES' : 'NO')
const HENRIK_KEY = process.env.HENRIK_API_KEY
const BASE = 'https://api.henrikdev.xyz/valorant'

async function getAccountByRiotId(riotId, region) {
  const [name, tag] = riotId.split('#')
  if (!name || !tag) throw new Error('Invalid Riot ID format — must be Name#TAG')
  console.log('Looking up account:', name, tag)
  const url = `${BASE}/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
  console.log('Henrik URL:', url)
  const { data } = await axios.get(url, {
    headers: { Authorization: HENRIK_KEY }
  })
  console.log('Account found:', data.data?.puuid)
  return data.data
}

async function getRecentMatches(puuid, region) {
  console.log('Fetching matches for puuid:', puuid, 'region:', region)
  const url = `${BASE}/v4/by-puuid/matches/${region}/pc/${puuid}?size=1`
  console.log('Matches URL:', url)
  const { data } = await axios.get(url, {
    headers: { Authorization: HENRIK_KEY }
  })
  console.log('Matches response status:', data.status)
  return data.data || []
}

async function getMatchDetails(matchId, region) {
  const { data } = await axios.get(`${BASE}/v4/match/${region}/pc/${matchId}`, {
    headers: { Authorization: HENRIK_KEY }
  })
  return data.data
}

async function getMatchDataForUser(riotId, region) {
  console.log('getMatchDataForUser called with:', riotId, region)
  try {
    const account = await getAccountByRiotId(riotId, region)
    const puuid = account.puuid
    const matches = await getRecentMatches(puuid, region)
    if (!matches || matches.length === 0) return null
    const match = matches[0]
    const matchId = match.metadata?.match_id
    if (!matchId) return null
    const details = await getMatchDetails(matchId, region)
    return { puuid, match: details }
  } catch (err) {
    console.error('Henrik API error:', err.message)
    return null
  }
}

function parseMatchData(matchData, puuid) {
  if (!matchData || !matchData.match) return null
  const { match } = matchData
  const metadata = match.metadata || {}
  const players = match.players || []
  const rounds = match.rounds || []

  const player = players.find(p => p.puuid === puuid)
  if (!player) return null

  const teamId = player.team_id
  const stats = player.stats || {}

  // Round outcomes
  const roundTimeline = rounds.map((r, i) => {
    const playerDied = r.player_stats?.find(ps => ps.puuid === puuid)?.was_afk === false &&
      r.player_stats?.find(ps => ps.puuid === puuid)?.survived === false
    const teamWon = r.winning_team === teamId
    const economy = player.economy?.find?.(e => e.round === i) || {}
    const spent = economy.spent || 0
    const loadout = economy.loadout_value || 0

    let roundType = 'full'
    if (spent < 1000) roundType = 'eco'
    else if (spent < 2500) roundType = 'force'
    else if (i === 0 || i === 12) roundType = 'pistol'

    return {
      round: i + 1,
      won: teamWon,
      died: playerDied,
      roundType,
      creditsSpent: spent,
      loadoutValue: loadout,
    }
  })

  // Kill/death data
  const kills = []
  const deaths = []
  rounds.forEach((r, roundIndex) => {
    const ps = r.player_stats?.find(p => p.puuid === puuid)
    if (!ps) return
    ps.kill_events?.forEach(k => {
      kills.push({
        round: roundIndex + 1,
        timeInRound: k.kill_time_in_round || 0,
        weapon: k.damage_weapon_name || 'Unknown',
        headshot: k.secondary_fire_mode === false && k.headshot === true,
        victim: k.victim_display_name || '',
        firstBlood: k.kill_time_in_round < 5000 && roundIndex > 0,
      })
    })
    if (!ps.survived) {
      deaths.push({
        round: roundIndex + 1,
        timeInRound: ps.kill_time || 0,
      })
    }
  })

  // Summary stats
  const totalKills = stats.kills || 0
  const totalDeaths = stats.deaths || 0
  const totalAssists = stats.assists || 0
  const headshotPct = stats.headshots && (stats.headshots + stats.bodyshots + stats.legshots) > 0
    ? Math.round((stats.headshots / (stats.headshots + stats.bodyshots + stats.legshots)) * 100)
    : 0

  // Headshot % per round
  const hsPerRound = rounds.map((r, i) => {
    const ps = r.player_stats?.find(p => p.puuid === puuid)
    if (!ps || !ps.kill_events?.length) return { round: i + 1, hs: 0 }
    const hsKills = ps.kill_events.filter(k => k.headshot).length
    return { round: i + 1, hs: Math.round((hsKills / ps.kill_events.length) * 100) }
  })

  // Weapon breakdown
  const weaponMap = {}
  kills.forEach(k => {
    if (!weaponMap[k.weapon]) weaponMap[k.weapon] = { kills: 0, headshots: 0 }
    weaponMap[k.weapon].kills++
    if (k.headshot) weaponMap[k.weapon].headshots++
  })
  const weaponBreakdown = Object.entries(weaponMap).map(([name, data]) => ({
    name,
    kills: data.kills,
    hsPct: data.kills > 0 ? Math.round((data.headshots / data.kills) * 100) : 0
  })).sort((a, b) => b.kills - a.kills)

  // Multi-kill rounds
  const multiKills = { '1k': 0, '2k': 0, '3k': 0, '4k+': 0 }
  rounds.forEach(r => {
    const ps = r.player_stats?.find(p => p.puuid === puuid)
    const k = ps?.kill_events?.length || 0
    if (k === 1) multiKills['1k']++
    else if (k === 2) multiKills['2k']++
    else if (k === 3) multiKills['3k']++
    else if (k >= 4) multiKills['4k+']++
  })

  // Map info
  const mapName = metadata.map?.name || 'Unknown'
  const matchId = metadata.match_id
  const score = match.teams?.find(t => t.team_id === teamId)

  return {
    mapName,
    matchId,
    totalKills,
    totalDeaths,
    totalAssists,
    headshotPct,
    roundTimeline,
    kills,
    deaths,
    hsPerRound,
    weaponBreakdown,
    multiKills,
    score: {
      won: score?.won || false,
      roundsWon: score?.rounds_won || 0,
      roundsLost: score?.rounds_lost || 0,
    }
  }
}

module.exports = { getMatchDataForUser, parseMatchData }