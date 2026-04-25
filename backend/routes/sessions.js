const express = require('express')
const router = express.Router()
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')
const sharp = require('sharp')
const games = require('../games')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

router.post('/start', async (req, res) => {
  const { userId, game, character, gamePhase } = req.body
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      game,
      character,
      game_phase: gamePhase,
      status: 'active',
      frames: []
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ sessionId: data.id })
})

router.post('/:sessionId/frame', async (req, res) => {
  const { sessionId } = req.params
  const { imageBase64, timestamp } = req.body

  try {
    const resized = await sharp(Buffer.from(imageBase64, 'base64'))
      .resize(1280, 720, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer()

    const { data: session } = await supabase
      .from('sessions').select('frames, status').eq('id', sessionId).single()

    if (!session || session.status !== 'active') return res.json({ ok: false })

    const frames = session.frames || []
    frames.push({ image: resized.toString('base64'), timestamp })

    await supabase.from('sessions').update({ frames }).eq('id', sessionId)
    res.json({ ok: true, frameCount: frames.length })
  } catch (err) {
    res.json({ ok: false })
  }
})

router.post('/:sessionId/analyze', async (req, res) => {
  const { sessionId } = req.params
  const { game, character, enemyTeam, playerRank } = req.body
  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', sessionId).single()

if (!session) return res.status(404).json({ error: 'Session not found' })

const allFrames = session.frames || []
const frames = allFrames.length <= 80
  ? allFrames
  : Array.from({ length: 80 }, (_, i) => allFrames[Math.floor(i * allFrames.length / 80)])

  const gameConfig = games[session.game] || games.deadlock
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('analysis')
    .eq('user_id', session.user_id)
    .eq('status', 'complete')
    .neq('id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5)

  const patternContext = recentSessions && recentSessions.length > 0
    ? `\n\nPREVIOUS SESSION PATTERNS:
${recentSessions.map((s, i) => `Session ${i + 1}: ${s.analysis?.topPriority || 'No data'} | Mistakes: ${(s.analysis?.mistakes || []).map(m => m.title).join(', ')}`).join('\n')}

IMPORTANT INSTRUCTIONS FOR PATTERNS:
- If the same mistake appears more than 3 times across sessions, do NOT flag it again — the player is already aware. Focus on NEW issues instead.
- Use the pattern history to identify what the player has IMPROVED on and acknowledge it as a strength.
- Always prioritise fresh coaching points over repeating the same feedback.`
    : ''
  const characterCtx = session.character ? `playing ${session.character}` : ''
  const phaseCtx = session.game_phase ? `during ${session.game_phase}` : ''

  const maxFrames = 40
  const step = Math.max(1, Math.floor(frames.length / maxFrames))
  const sampled = frames.filter((_, i) => i % step === 0).slice(0, maxFrames)

  const imageContent = sampled.map(f => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: f.image }
  }))

  const systemPrompt = gameConfig.prompt

  const enemyTeamCtx = enemyTeam && enemyTeam.length > 0
    ? `\nThe enemy team consisted of: ${enemyTeam.join(', ')}. Use this to give specific matchup advice and explain how enemy abilities affected the player's decisions.`
    : ''

  const userPrompt = `Analyze this ${gameConfig.name} gameplay session (${sampled.length} screenshots).
The player is confirmed to be playing as ${session.character || 'unknown hero'} - do not suggest or imply they are playing a different hero based on visuals.
The player's rank is: ${playerRank === 'beginner' ? 'Beginner — focus on fundamentals, explain concepts clearly, be encouraging' : playerRank === 'advanced' ? 'Advanced — skip basics, focus on high level macro and micro optimisation, be direct and detailed' : 'Intermediate — assume basic knowledge, focus on efficiency and decision making'}.
${enemyTeamCtx}
${patternContext}

Return ONLY a JSON object:
{
  "summary": "3-4 sentence overall assessment",
  "grades": {
    "farm": "A/B/C/D or N/A",
    "positioning": "A/B/C/D or N/A",
    "mechanics": "A/B/C/D or N/A",
    "decisions": "A/B/C/D or N/A"
  },
  "mistakes": [
    { "title": "short title", "detail": "specific explanation referencing what you saw", "severity": "high/medium/low" }
  ],
  "strengths": [
    { "title": "short title", "detail": "specific explanation" }
  ],
  "topPriority": "The single most impactful thing to work on this week"
}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [...imageContent, { type: 'text', text: userPrompt }]
    }]
  })

  const raw = response.content.map(b => b.text || '').join('')
  const clean = raw.replace(/```json|```/g, '').trim()
  const analysis = JSON.parse(clean)

  await supabase.from('sessions')
    .update({ status: 'complete', analysis, frame_count: frames.length })
    .eq('id', sessionId)

  res.json({ analysis })
})

router.get('/history/:userId', async (req, res) => {
  const { userId } = req.params
  const { data } = await supabase
    .from('sessions')
    .select('id, game, character, status, frame_count, analysis, created_at')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(20)

  res.json({ sessions: data || [] })
})
router.post('/:sessionId/question', async (req, res) => {
  const { sessionId } = req.params
  const { question, chatHistory } = req.body

  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', sessionId).single()

  const gameConfig = games[session.game] || games.deadlock
  const frames = session.frames || []

  const maxFrames = 5
  const step = Math.max(1, Math.floor(frames.length / maxFrames))
  const sampled = frames.filter((_, i) => i % step === 0).slice(0, maxFrames)

  const imageContent = sampled.map(f => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: f.image }
  }))

  const messages = [
    {
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: `You are an expert ${gameConfig.name} coach. The player was playing as ${session.character || 'unknown'}. 
          Here are screenshots from their game session. Previous analysis: ${JSON.stringify(session.analysis)}.
          Answer the following question specifically based on what you can see in the screenshots: ${question}`
        }
      ]
    },
    ...chatHistory.map(m => ({ role: m.role, content: m.content }))
  ]

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    system: gameConfig.prompt,
    messages
  })

  const answer = response.content.map(b => b.text || '').join('')
  res.json({ answer })
})
router.post('/counter-pick', async (req, res) => {
  const { game, hero, enemyTeam, playerRank } = req.body

  const gameConfig = games[game] || games.deadlock

  const prompt = `You are an expert ${gameConfig.name} coach specialising in hero matchups and counter picking.

NEWER HERO ABILITIES (use these exact names):
Celeste: Light Eater, Radiant Dagger, Dazzling Trick, Shining Wonder
Paige: Bookwyrm, Plot Armor, Captivating Read, Rallying Charge
Rem: Pillow Toss, Naptime, Tag Along, Lil Helpers
Silver: Slam Fire, Boot Kick, Entangling Bola, Lycan Curse
Billy: Rising Ram, Blasted, Chain Gang, Bashdown
Mina: Rake, Sanguine Retreat, Love Bites, Nox Nostra
  The player is playing as ${hero}.
The enemy team is: ${enemyTeam.join(', ')}.

Give a detailed counter pick analysis. Return ONLY a JSON object:
{
  "overview": "2-3 sentence summary of how this matchup looks overall",
  "difficulty": "Easy / Moderate / Hard / Very Hard",
  "laning": "Specific advice for the laning phase against this enemy team",
  "items": [
    { "name": "Item name", "reason": "Why this item specifically against this team" }
  ],
  "threats": [
    { "hero": "Enemy hero name", "why": "Why they are dangerous and how to deal with them" }
  ],
  "winCondition": "The specific win condition for this hero against this team composition",
  "teamfight": "How to play team fights against this specific enemy composition",
  "avoid": "What to specifically avoid doing against this team"
}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = response.content.map(b => b.text || '').join('')
  const clean = raw.replace(/```json|```/g, '').trim()
  const analysis = JSON.parse(clean)

  res.json({ analysis })
})
module.exports = router