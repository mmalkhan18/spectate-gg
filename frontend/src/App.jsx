import { SignedIn, SignedOut, SignInButton, SignOutButton, useUser } from '@clerk/clerk-react'
import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_BACKEND_URL

const GAME = {
  name: 'Valorant', short: 'VL', characterLabel: 'Agent',
  title: 'Know exactly what you did wrong.',
  sub: 'Spectate watches your screen while you play, then delivers a full professional coaching report — crosshair placement, economy, utility, deaths and decisions.',
  tip: 'Run Valorant in Windowed or Borderless mode. Fullscreen will block screen capture.',
}

const AGENTS = [
  'Astra','Breach','Brimstone','Chamber','Clove','Cypher',
  'Deadlock','Fade','Gekko','Harbor','Iso','Jett','KAY/O',
  'Killjoy','Miks','Neon','Omen','Phoenix','Raze','Reyna',
  'Sage','Skye','Sova','Tejo','Veto','Viper','Vyse','Waylay','Yoru'
]

const RANKS = [
  { value: '', label: 'Select your rank (optional)' },
  { value: 'beginner', label: 'Iron / Bronze' },
  { value: 'beginner2', label: 'Silver / Gold' },
  { value: 'intermediate', label: 'Platinum / Diamond' },
  { value: 'advanced', label: 'Ascendant / Immortal' },
  { value: 'advanced2', label: 'Radiant' },
]

const gradeColor = g => ({A:'#68d391',B:'#e2e8f0',C:'#f6ad55',D:'#fc8181'}[g?.[0]] || '#718096')

const serif = "'Rajdhani', sans-serif"
const mono = "'DM Mono', monospace"
const sans = "'Inter', system-ui"

export default function App() {
  const { user } = useUser()
  const [status, setStatus] = useState('idle')
  const [character, setCharacter] = useState('Jett')
  const [enemyTeam, setEnemyTeam] = useState([])
  const [playerRank, setPlayerRank] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [history, setHistory] = useState([])
  const [question, setQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [askingQuestion, setAskingQuestion] = useState(false)
  const [counterAnalysis, setCounterAnalysis] = useState(null)
  const [counterLoading, setCounterLoading] = useState(false)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => { if (user) loadHistory() }, [user])

  async function loadHistory() {
    try {
      const { data } = await axios.get(`${API}/api/sessions/history/${user.id}`)
      setHistory(data.sessions || [])
    } catch {}
  }

  function viewSession(session) {
    setAnalysis(session.analysis)
    setCharacter(session.character || '')
    setChatHistory([])
    setSessionId(session.id)
    setStatus('done')
  }

  async function captureFrame(sid) {
    const video = videoRef.current
    if (!video || !sid) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    await axios.post(`${API}/api/sessions/${sid}/frame`, { imageBase64: base64, timestamp: Date.now() })
    setFrameCount(c => c + 1)
  }

  async function beginRecording() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1, width: 1920, height: 1080 }, audio: false })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()
      videoRef.current = video
      const { data } = await axios.post(`${API}/api/sessions/start`, {
        userId: user.id, game: 'valorant', character, enemyTeam, playerRank
      })
      setSessionId(data.sessionId)
      setStatus('recording')
      setFrameCount(0)
      setTimeout(() => captureFrame(data.sessionId), 2000)
      intervalRef.current = setInterval(() => captureFrame(data.sessionId), 15000)
    } catch(err) { console.error('Recording error:', err) }
  }

  async function startSession() {
    if (character && enemyTeam.length > 0) {
      setStatus('counterpick')
      setCounterLoading(true)
      try {
        const { data } = await axios.post(`${API}/api/sessions/counter-pick`, {
          game: 'valorant', hero: character, enemyTeam
        })
        setCounterAnalysis(data.analysis)
      } catch {}
      setCounterLoading(false)
    } else {
      await beginRecording()
    }
  }

  async function endSession() {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStatus('analyzing')
    const { data } = await axios.post(`${API}/api/sessions/${sessionId}/analyze`, {
      game: 'valorant', character, enemyTeam, playerRank
    })
    setAnalysis(data.analysis)
    setStatus('done')
    loadHistory()
  }

  async function askQuestion() {
    if (!question.trim() || askingQuestion) return
    const userMessage = { role: 'user', content: question }
    setChatHistory(prev => [...prev, userMessage])
    setQuestion('')
    setAskingQuestion(true)
    try {
      const { data } = await axios.post(`${API}/api/sessions/${sessionId}/question`, { question, chatHistory })
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    }
    setAskingQuestion(false)
  }

  const c = {
    bg: '#0a0a0f',
    surface: '#0f0f18',
    panel: '#0c0c14',
    border: '#1e1e2e',
    borderLight: '#141420',
    red: '#ff4655',
    redDim: 'rgba(255,70,85,0.15)',
    redBorder: '#742a2a',
    text: '#e2e8f0',
    textMid: '#718096',
    textDim: '#4a5568',
    textFaint: '#2d3748',
    green: '#68d391',
    greenDim: '#1c3829',
    gold: '#f6ad55',
  }

  const clip = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
  const clipSm = 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))'

  const btn = {
    primary: { background: c.red, color: '#fff', border: 'none', fontFamily: serif, fontSize: 15, fontWeight: 700, padding: '12px 28px', cursor: 'pointer', clipPath: clip, letterSpacing: '0.05em', textTransform: 'uppercase' },
    secondary: { background: 'transparent', color: c.textMid, border: `1px solid ${c.border}`, fontFamily: serif, fontSize: 14, fontWeight: 600, padding: '11px 24px', cursor: 'pointer', clipPath: clipSm, letterSpacing: '0.05em', textTransform: 'uppercase' },
    ghost: { background: 'transparent', color: c.red, border: `1px solid ${c.redBorder}`, fontFamily: mono, fontSize: 11, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' },
  }

  const secHead = { fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', color: c.textDim, fontFamily: mono, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }

  return (
    <div style={{ background: c.bg, minHeight: '100vh', fontFamily: sans, color: c.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        * { box-sizing: border-box; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #1e1e2e; }
      `}</style>

      {/* TOPBAR */}
      <div style={{ background: c.panel, borderBottom: `1px solid ${c.border}`, padding: '0 2.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 24, background: c.red }}></div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: 1 }}>
            Spectate<span style={{ color: c.red }}>.gg</span>
          </div>
          <span style={{ fontSize: 8, background: c.redDim, color: c.red, border: `1px solid ${c.redBorder}`, padding: '2px 8px', letterSpacing: '0.15em', fontFamily: mono }}>BETA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={btn.ghost}>Sign in</button>
            </SignInButton>
          </SignedOut>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 11, color: c.textDim, fontFamily: mono, letterSpacing: '0.05em' }}>{user.firstName || user.emailAddresses?.[0]?.emailAddress}</div>
              <SignOutButton>
                <button style={btn.ghost}>Sign out</button>
              </SignOutButton>
            </div>
          )}
        </div>
      </div>

      {/* HERO SECTION */}
      <div style={{ background: c.panel, borderBottom: `3px solid ${c.red}`, padding: '3rem 2.5rem' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: c.red, fontFamily: mono, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ opacity: 0.5 }}>//</span> AI-powered Valorant coaching
        </div>
        <div style={{ fontFamily: serif, fontSize: 52, fontWeight: 700, color: c.text, lineHeight: 1, marginBottom: 16, textTransform: 'uppercase', letterSpacing: -1 }}>{GAME.title}</div>
        <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.8, maxWidth: 540 }}>{GAME.sub}</div>
      </div>

      <SignedOut>
        <div style={{ padding: '4rem 2.5rem', textAlign: 'center' }}>
          <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, color: c.text, textTransform: 'uppercase', marginBottom: 8 }}>Sign in to start your first session</div>
          <div style={{ fontSize: 13, color: c.textDim, marginBottom: 32, fontFamily: mono, letterSpacing: '0.05em' }}>Free to try — no install required</div>
          <SignInButton mode="modal">
            <button style={btn.primary}>Get started</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>

        {/* IDLE */}
        {status === 'idle' && (
          <div style={{ padding: '2.5rem', maxWidth: 800, margin: '0 auto' }}>

            {/* Agent selector */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={secHead}><span style={{ color: c.red }}>//</span> Your agent</div>
              <select value={character} onChange={e => setCharacter(e.target.value)} style={{ width: '100%', padding: '11px 16px', background: c.panel, border: `1px solid ${c.border}`, color: c.text, fontSize: 13, fontFamily: sans, outline: 'none', clipPath: clipSm }}>
                {AGENTS.map(a => <option key={a} style={{ background: c.panel }}>{a}</option>)}
              </select>
            </div>

            {/* Enemy team */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={secHead}>
                <span style={{ color: c.red }}>//</span> Enemy team
                <span style={{ color: c.red, fontFamily: mono, fontSize: 9 }}>({enemyTeam.length}/6)</span>
              </div>
              <div style={{ border: `1px solid ${c.border}`, background: c.panel, maxHeight: 200, overflowY: 'auto', clipPath: clipSm }}>
                {AGENTS.map(agent => {
                  const selected = enemyTeam.includes(agent)
                  return (
                    <div key={agent} onClick={() => {
                      if (selected) setEnemyTeam(enemyTeam.filter(e => e !== agent))
                      else if (enemyTeam.length < 6) setEnemyTeam([...enemyTeam, agent])
                    }} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selected ? 'rgba(255,70,85,0.08)' : 'transparent', borderBottom: `1px solid ${c.borderLight}` }}>
                      <div style={{ width: 14, height: 14, border: `1.5px solid ${selected ? c.red : c.border}`, background: selected ? c.red : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <div style={{ width: 6, height: 6, background: '#fff' }}></div>}
                      </div>
                      <div style={{ fontSize: 12, color: selected ? c.text : c.textDim, fontWeight: selected ? 500 : 400 }}>{agent}</div>
                    </div>
                  )
                })}
              </div>
              {enemyTeam.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, color: c.textDim, fontFamily: mono }}>
                  {enemyTeam.join(' · ')}
                </div>
              )}
            </div>

            {/* Rank */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={secHead}><span style={{ color: c.red }}>//</span> Your rank</div>
              <select value={playerRank} onChange={e => setPlayerRank(e.target.value)} style={{ width: '100%', padding: '11px 16px', background: c.panel, border: `1px solid ${c.border}`, color: playerRank ? c.text : c.textDim, fontSize: 13, fontFamily: sans, outline: 'none', clipPath: clipSm }}>
                {RANKS.map(r => <option key={r.value} value={r.value} style={{ background: c.panel }}>{r.label}</option>)}
              </select>
            </div>

            {/* Tip */}
            <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `2px solid ${c.red}`, padding: '12px 16px', marginBottom: '2rem', display: 'flex', gap: 10 }}>
              <div style={{ fontSize: 9, color: c.red, fontFamily: mono, letterSpacing: '0.1em', flexShrink: 0, marginTop: 1 }}>TIP</div>
              <div style={{ fontSize: 12, color: c.textDim, lineHeight: 1.6 }}>{GAME.tip}</div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '2.5rem' }}>
              <button onClick={startSession} style={{ ...btn.primary, padding: '14px', width: '100%' }}>
                Analyse matchup &amp; record
              </button>
              <button onClick={async () => { await beginRecording() }} style={{ ...btn.secondary, padding: '14px', width: '100%' }}>
                Start recording
              </button>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div>
                <div style={secHead}><span style={{ color: c.red }}>//</span> Recent sessions</div>
                {history.slice(0, 5).map(s => (
                  <div key={s.id} onClick={() => viewSession(s)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: `1px solid ${c.borderLight}`, cursor: 'pointer', background: 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = c.panel}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 32, height: 32, background: c.redDim, border: `1px solid ${c.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: c.red, fontFamily: mono, flexShrink: 0, clipPath: clipSm }}>{s.character?.slice(0,3).toUpperCase() || 'VAL'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, fontFamily: serif, textTransform: 'uppercase' }}>{s.character}</div>
                      <div style={{ fontSize: 10, color: c.textDim, marginTop: 2, fontFamily: mono }}>{s.frame_count} frames · {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: gradeColor(s.analysis?.grades?.aim) }}>{s.analysis?.grades?.aim || '—'}</div>
                    <div style={{ fontSize: 10, color: c.textDim, fontFamily: mono, marginLeft: 4 }}>→</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COUNTER PICK */}
        {status === 'counterpick' && (
          <div style={{ padding: '2.5rem', maxWidth: 900, margin: '0 auto' }}>
            {counterLoading ? (
              <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTop: `2px solid ${c.red}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: c.text, textTransform: 'uppercase' }}>Analysing matchup...</div>
                <div style={{ fontSize: 12, color: c.textDim, marginTop: 8, fontFamily: mono }}>Building your pre-game briefing</div>
              </div>
            ) : counterAnalysis && (
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: c.red, fontFamily: mono, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ opacity: 0.5 }}>//</span> Pre-game briefing</div>
                  <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, color: c.text, textTransform: 'uppercase' }}>{character} <span style={{ color: c.textDim, fontSize: 18 }}>vs</span> {enemyTeam.join(', ')}</div>
                </div>

                {/* Difficulty + Overview */}
                <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.red}`, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 8, color: c.textDim, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>Difficulty</div>
                    <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: c.red, textTransform: 'uppercase' }}>{counterAnalysis.difficulty}</div>
                  </div>
                  <div style={{ width: 1, height: 50, background: c.border }}></div>
                  <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{counterAnalysis.overview}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={secHead}><span style={{ color: c.red }}>//</span> Laning phase</div>
                    <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{counterAnalysis.laning}</div>
                  </div>
                  <div>
                    <div style={secHead}><span style={{ color: c.red }}>//</span> Items to prioritise</div>
                    {(counterAnalysis.items || []).map((item, i) => (
                      <div key={i} style={{ background: c.panel, border: `1px solid ${c.border}`, padding: '10px 14px', marginBottom: 6, clipPath: clipSm }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c.text, marginBottom: 3, fontFamily: serif, textTransform: 'uppercase' }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: c.textDim, lineHeight: 1.5 }}>{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Threats */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={secHead}><span style={{ color: c.red }}>//</span> Key threats</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(counterAnalysis.threats || []).map((threat, i) => (
                      <div key={i} style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `2px solid ${c.redBorder}`, padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c.text, marginBottom: 3, fontFamily: serif, textTransform: 'uppercase' }}>{threat.hero}</div>
                        <div style={{ fontSize: 11, color: c.textDim, lineHeight: 1.5 }}>{threat.why}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Win condition */}
                <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.red}`, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 8, color: c.red, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>★ Win condition</div>
                  <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7 }}>{counterAnalysis.winCondition}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  <div>
                    <div style={secHead}><span style={{ color: c.red }}>//</span> Team fights</div>
                    <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{counterAnalysis.teamfight}</div>
                  </div>
                  <div>
                    <div style={secHead}><span style={{ color: c.red }}>//</span> What to avoid</div>
                    <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{counterAnalysis.avoid}</div>
                  </div>
                </div>

                <button onClick={async () => { await beginRecording() }} style={{ ...btn.primary, width: '100%', padding: 14 }}>
                  Start recording session
                </button>
              </div>
            )}
          </div>
        )}

        {/* RECORDING */}
        {status === 'recording' && (
          <div style={{ padding: '2.5rem', maxWidth: 800, margin: '0 auto' }}>
            <div style={{ background: c.panel, border: `1px solid ${c.border}`, padding: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.red, animation: 'pulse 1.5s infinite' }}></div>
                <div style={{ fontSize: 10, color: c.red, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Recording Valorant</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 72, fontWeight: 700, color: c.text, lineHeight: 1, marginBottom: 8 }}>{frameCount}</div>
              <div style={{ fontSize: 10, color: c.textDim, marginBottom: 28, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: mono }}>Frames captured</div>
              <div style={{ fontSize: 13, color: c.textDim, marginBottom: 28 }}>Go play — come back when you are done</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={endSession} style={{ ...btn.primary }}>End session and analyze</button>
                <button onClick={() => {
                  clearInterval(intervalRef.current)
                  streamRef.current?.getTracks().forEach(t => t.stop())
                  setStatus('idle')
                  setFrameCount(0)
                  setCounterAnalysis(null)
                  setEnemyTeam([])
                }} style={btn.secondary}>Cancel</button>
              </div>
            </div>

            {counterAnalysis && (
              <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.red}`, padding: '1.25rem 1.5rem' }}>
                <div style={{ fontSize: 8, color: c.red, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>// Pre-game briefing — refer back while playing</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: 9, color: c.textDim, fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Win condition</div>
                    <div style={{ fontSize: 12, color: c.textMid, lineHeight: 1.6 }}>{counterAnalysis.winCondition}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: c.textDim, fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Key threats</div>
                    {(counterAnalysis.threats || []).slice(0, 2).map((threat, i) => (
                      <div key={i} style={{ fontSize: 12, color: c.textMid, marginBottom: 6 }}>
                        <span style={{ color: c.text, fontWeight: 600 }}>{threat.hero}:</span> {threat.why}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ANALYZING */}
        {status === 'analyzing' && (
          <div style={{ textAlign: 'center', padding: '5rem 2.5rem' }}>
            <div style={{ width: 48, height: 48, border: `2px solid ${c.border}`, borderTop: `2px solid ${c.red}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }}></div>
            <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: c.text, textTransform: 'uppercase', marginBottom: 8 }}>Analysing your session...</div>
            <div style={{ fontSize: 12, color: c.textDim, fontFamily: mono }}>This takes about 20–30 seconds</div>
          </div>
        )}

        {/* DONE / REPORT */}
        {status === 'done' && analysis && (
          <div style={{ padding: '2.5rem', maxWidth: 900, margin: '0 auto' }}>

            {/* Report header */}
            <div style={{ background: c.panel, border: `1px solid ${c.border}`, padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1px 1fr 1px auto', gap: '1.5rem', alignItems: 'center', clipPath: clip }}>
              <div>
                <div style={{ fontSize: 8, color: c.textDim, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>Performance Report</div>
                <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 700, color: c.text, textTransform: 'uppercase', lineHeight: 1 }}>{user?.firstName || 'Player'}</div>
                <div style={{ fontSize: 11, color: c.textDim, marginTop: 6, fontFamily: mono }}>Valorant · {character} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <div style={{ background: c.border, width: 1, alignSelf: 'stretch' }}></div>
              <div>
                <div style={{ fontSize: 9, color: c.textDim, fontFamily: mono, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Assessment</div>
                <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{analysis.summary}</div>
              </div>
              <div style={{ background: c.border, width: 1, alignSelf: 'stretch' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: serif, fontSize: 64, fontWeight: 700, color: c.text, lineHeight: 1 }}>{analysis.grades?.aim?.[0] || analysis.grades?.positioning?.[0] || 'B'}</div>
                <div style={{ fontSize: 8, color: c.textDim, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Overall</div>
              </div>
            </div>

            {/* Ratings */}
            <div style={{ background: c.panel, border: `1px solid ${c.border}`, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <div style={secHead}><span style={{ color: c.red }}>//</span> Ratings</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem 2rem' }}>
                {Object.entries(analysis.grades || {}).map(([k, v]) => {
                  const pct = { A: 88, B: 65, C: 40, D: 20 }[v?.[0]] || 50
                  const col = gradeColor(v)
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${c.borderLight}` }}>
                      <div style={{ fontSize: 9, color: c.textDim, textTransform: 'capitalize', fontFamily: mono, minWidth: 80 }}>{k}</div>
                      <div style={{ flex: 1, height: 2, background: c.border }}><div style={{ width: `${pct}%`, height: '100%', background: col }}></div></div>
                      <div style={{ fontFamily: serif, fontSize: 16, fontWeight: 700, color: col, minWidth: 28, textAlign: 'right' }}>{v}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Priority */}
            {analysis.topPriority && (
              <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.red}`, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                <div style={{ fontSize: 16, color: c.red, flexShrink: 0 }}>★</div>
                <div>
                  <div style={{ fontSize: 8, color: c.red, fontFamily: mono, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>Top priority this week</div>
                  <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.7, fontWeight: 300 }}>{analysis.topPriority}</div>
                </div>
              </div>
            )}

            {/* Strengths + Weaknesses */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={secHead}><span style={{ color: c.red }}>//</span> Strengths</div>
                {(analysis.strengths || []).map((st, i) => (
                  <div key={i} style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `2px solid #276749`, padding: '1rem', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 4, fontFamily: serif, textTransform: 'uppercase' }}>{st.title}</div>
                    <div style={{ fontSize: 12, color: c.textDim, lineHeight: 1.6 }}>{st.detail}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={secHead}><span style={{ color: c.red }}>//</span> Weaknesses</div>
                {(analysis.mistakes || []).map((m, i) => (
                  <div key={i} style={{ background: c.panel, border: `1px solid ${c.border}`, borderLeft: `2px solid ${c.redBorder}`, padding: '1rem', marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 4, fontFamily: serif, textTransform: 'uppercase' }}>{m.title}</div>
                      <div style={{ fontSize: 12, color: c.textDim, lineHeight: 1.6 }}>{m.detail}</div>
                    </div>
                    {m.severity && <div style={{ fontSize: 7, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '3px 6px', fontFamily: mono, flexShrink: 0, height: 'fit-content', color: m.severity === 'high' ? '#fc8181' : '#f6ad55', border: `1px solid ${m.severity === 'high' ? '#742a2a' : '#744210'}`, background: m.severity === 'high' ? '#1a0808' : '#1a1008' }}>{m.severity}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Ask your coach */}
            <div style={{ background: c.panel, border: `1px solid ${c.border}`, padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={secHead}><span style={{ color: c.red }}>//</span> Ask your coach</div>
              <div style={{ marginBottom: 16 }}>
                {chatHistory.map((m, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: '10px 14px', background: m.role === 'user' ? 'rgba(255,70,85,0.05)' : c.bg, border: `1px solid ${m.role === 'user' ? c.redBorder : c.borderLight}` }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: m.role === 'user' ? c.red : c.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: mono, marginBottom: 6 }}>{m.role === 'user' ? 'You' : 'Coach'}</div>
                    <div style={{ fontSize: 13, color: c.textMid, lineHeight: 1.6 }}>{m.content}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && askQuestion()} placeholder="Ask anything about your game..." style={{ flex: 1, padding: '10px 14px', background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 13, outline: 'none', fontFamily: sans }} />
                <button onClick={askQuestion} disabled={askingQuestion || !question.trim()} style={{ ...btn.primary, opacity: askingQuestion ? 0.6 : 1, padding: '10px 20px' }}>{askingQuestion ? '...' : 'Ask'}</button>
              </div>
            </div>

            {/* New session */}
            <button onClick={() => { setStatus('idle'); setAnalysis(null); setFrameCount(0); setChatHistory([]); setQuestion(''); setCounterAnalysis(null); setEnemyTeam([]) }} style={{ ...btn.secondary, width: '100%', padding: 13 }}>
              Start new session
            </button>
          </div>
        )}
      </SignedIn>

      {/* FOOTER */}
      <div style={{ background: c.panel, borderTop: `1px solid ${c.border}`, padding: '1.25rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem' }}>
        <div style={{ fontFamily: serif, fontSize: 14, fontWeight: 700, color: c.text, textTransform: 'uppercase' }}>Spectate<span style={{ color: c.red }}>.gg</span></div>
        <div style={{ fontSize: 9, color: c.textFaint, letterSpacing: '0.1em', fontFamily: mono }}>AI coaching · No install required</div>
      </div>
    </div>
  )
}