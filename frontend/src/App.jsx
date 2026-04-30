import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_BACKEND_URL

const GAMES = {
  valorant: {
    name: 'Valorant', short: 'VL', characterLabel: 'Agent',
    title: 'Sharpen your edge. Climb every round.',
    sub: 'Spectate watches your screen while you play, then delivers a full professional coaching report — mistakes, strengths, and a priority to work on next.',
    tip: 'Run Valorant in Windowed or Borderless mode. Fullscreen will block screen capture.',
  },
}

const ROSTERS = {
  valorant: [
    'Astra','Breach','Brimstone','Chamber','Clove','Cypher',
    'Deadlock','Fade','Gekko','Harbor','Iso','Jett','KAY/O',
    'Killjoy','Miks','Neon','Omen','Phoenix','Raze','Reyna',
    'Sage','Skye','Sova','Tejo','Veto','Viper','Vyse','Waylay','Yoru'
  ],
}

const gradeColor = g => ({ A: '#2d6a2d', B: '#1a4a7a', C: '#8b6a00', D: '#8b2020' }[g?.[0]] || '#8a7d5a')
const serif = "'Playfair Display', Georgia, serif"
const sans = "'Inter', system-ui"

export default function App() {
  const { user } = useUser()
  const [status, setStatus] = useState('idle')
  const [selectedGame, setSelectedGame] = useState('valorant')
  const [character, setCharacter] = useState('')
const [enemyTeam, setEnemyTeam] = useState([])
const [playerRank, setPlayerRank] = useState('')  
const [sessionId, setSessionId] = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [history, setHistory] = useState([])
  const [question, setQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [askingQuestion, setAskingQuestion] = useState(false)
  const [viewingSession, setViewingSession] = useState(null)
  const [page, setPage] = useState('home')
const [counterHero, setCounterHero] = useState('')
const [counterEnemyTeam, setCounterEnemyTeam] = useState([])
const [counterAnalysis, setCounterAnalysis] = useState(null)
const [counterLoading, setCounterLoading] = useState(false)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const prevFrameRef = useRef(null)
  const lastForcedCaptureRef = useRef(null)

  useEffect(() => { if (user) loadHistory() }, [user])
  useEffect(() => { setCharacter(ROSTERS[selectedGame]?.[0] || '') }, [selectedGame])

  async function loadHistory() {
    try {
      const { data } = await axios.get(`${API}/api/sessions/history/${user.id}`)
      setHistory(data.sessions || [])
    } catch {}
  }

  function viewSession(session) {
    setViewingSession(session)
    setAnalysis(session.analysis)
    setCharacter(session.character || '')
    setSelectedGame(session.game || 'deadlock')
    setChatHistory([])
    setSessionId(session.id)
    setStatus('done')
  }


  
  async function startSession() {
    if (character && enemyTeam.length > 0) {
      setStatus('counterpick')
      setCounterLoading(true)
      try {
        const { data } = await axios.post(`${API}/api/sessions/counter-pick`, {
          game: selectedGame,
          hero: character,
          enemyTeam
        })
        setCounterAnalysis(data.analysis)
      } catch {}
      setCounterLoading(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1, width: 1920, height: 1080 }, audio: false })
        streamRef.current = stream
        const video = document.createElement('video')
        video.srcObject = stream
        video.play()
        videoRef.current = video
        const { data } = await axios.post(`${API}/api/sessions/start`, {
          userId: user.id,
          game: selectedGame,
          character,
          enemyTeam,
          playerRank
        })
        setSessionId(data.sessionId)
        setStatus('recording')
        setFrameCount(0)
        setTimeout(() => captureFrame(data.sessionId), 2000)
        intervalRef.current = setInterval(() => captureFrame(data.sessionId), 30000)
      } catch(err) {
        console.error('Recording error:', err)
      }
    }
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
async function analyzeCounterPick() {
    if (!counterHero || counterEnemyTeam.length === 0) return
    setCounterLoading(true)
    setCounterAnalysis(null)
    try {
      const { data } = await axios.post(`${API}/api/sessions/counter-pick`, {
        game: selectedGame,
        hero: counterHero,
        enemyTeam: counterEnemyTeam
      })
      setCounterAnalysis(data.analysis)
    } catch {
      alert('Something went wrong. Try again.')
    }
    setCounterLoading(false)
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
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry something went wrong. Try asking again.' }])
    }
    setAskingQuestion(false)
  }

  async function endSession() {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStatus('analyzing')
    const { data } = await axios.post(`${API}/api/sessions/${sessionId}/analyze`, {
      game: selectedGame,
      character,
      enemyTeam: enemyTeam.filter(e => e !== ''),
      playerRank
    })
    setAnalysis(data.analysis)
    setStatus('done')
    loadHistory()
  }

  const game = GAMES[selectedGame]

  const styles = {
    page: { background: '#f5f0e8', minHeight: '100vh', fontFamily: sans, color: '#1a1a1a' },
    topbar: { background: '#1a1a1a', padding: '0 4%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    logo: { fontFamily: serif, fontSize: 20, color: '#faf6ee', letterSpacing: '-0.3px' },
    heroSection: { background: '#1a1a1a', borderBottom: '4px solid #c8a84b', padding: '3rem 4%', minHeight: 200 },
    main: { padding: '2.5rem 4%' },
    sectionHeader: { fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 10, borderBottom: '2px solid #1a1a1a', marginBottom: '1.25rem' },
    gamesGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: '2rem' },
    gameCard: { background: '#faf6ee', border: '1px solid #d4c9a8', padding: '1.25rem', cursor: 'pointer' },
    gameCardActive: { background: '#f0e9d6', border: '2px solid #1a1a1a', padding: '1.25rem', cursor: 'pointer' },
    startBtn: { width: '100%', padding: 15, background: '#1a1a1a', color: '#faf6ee', border: 'none', fontFamily: serif, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginBottom: '2.5rem' },
    tipBox: { background: '#1a1a1a', padding: '12px 16px', marginBottom: '1.5rem', display: 'flex', gap: 10, alignItems: 'flex-start' },
    sessionRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #e8e0c8', cursor: 'pointer' },
    sessionIcon: { width: 36, height: 36, border: '1px solid #d4c9a8', background: '#f0e9d6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8a7d5a', flexShrink: 0 },
    footer: { background: '#1a1a1a', padding: '1.5rem 4%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem' },
    recordingWrap: { textAlign: 'center', padding: '5rem 4%', background: '#f5f0e8' },
    priorityBox: { background: '#1a1a1a', color: '#faf6ee', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' },
    issueCard: { background: '#faf6ee', border: '1px solid #d4c9a8', borderLeft: '3px solid #8b2020', padding: '1rem 1.25rem', marginBottom: 10 },
    strengthCard: { background: '#faf6ee', border: '1px solid #d4c9a8', borderLeft: '3px solid #2d6a2d', padding: '1rem 1.25rem', marginBottom: 10 },
    chatInput: { flex: 1, padding: '10px 14px', border: '1px solid #d4c9a8', background: '#faf6ee', color: '#1a1a1a', fontSize: 13, outline: 'none', fontFamily: sans },
    askBtn: { padding: '10px 20px', background: '#1a1a1a', color: '#faf6ee', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: sans },
    newSessionBtn: { width: '100%', padding: 13, border: '2px solid #1a1a1a', background: '#f5f0e8', color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: serif, marginTop: 16 },
    select: { width: '100%', padding: '10px 14px', border: '1px solid #d4c9a8', background: '#faf6ee', color: '#1a1a1a', fontSize: 13, fontFamily: sans, outline: 'none', borderRadius: 0 },
  }

  return (
    <div style={styles.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600&display=swap'); @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      <div style={styles.topbar}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={styles.logo}>spectate<span style={{ color: '#c8a84b' }}>.gg</span></div>
          <span style={{ fontSize: 10, background: 'rgba(200,168,75,0.2)', color: '#c8a84b', border: '1px solid rgba(200,168,75,0.3)', padding: '2px 8px', borderRadius: 2, marginLeft: 8, letterSpacing: '0.05em' }}>BETA</span>
        </div>
        <SignedOut>
          <SignInButton mode="modal">
            <button style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(250,246,238,0.2)', color: '#faf6ee', fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Sign in</button>
          </SignInButton>
        </SignedOut>
        {user && <div style={{ fontSize: 12, color: 'rgba(250,246,238,0.4)', letterSpacing: '0.05em' }}>{user.firstName || user.emailAddresses?.[0]?.emailAddress}</div>}
      </div>

      <div style={styles.heroSection}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a84b', marginBottom: 12 }}>AI-powered game coaching</div>
        <div style={{ fontFamily: serif, fontSize: 42, fontWeight: 700, color: '#faf6ee', lineHeight: 1.1, marginBottom: 14, letterSpacing: '-1px' }}>{game.title}</div>
        <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.45)', lineHeight: 1.7, maxWidth: 460 }}>{game.sub}</div>
      </div>

      <SignedOut>
        <div style={{ padding: '3rem 4%', textAlign: 'center' }}>
          <div style={{ fontFamily: serif, fontSize: 22, color: '#1a1a1a', marginBottom: 8 }}>Sign in to start your first session</div>
          <div style={{ fontSize: 13, color: '#8a7d5a', marginBottom: 24 }}>Free to try — no install required</div>
          <SignInButton mode="modal">
            <button style={{ ...styles.startBtn, width: 'auto', padding: '14px 40px', marginBottom: 0 }}>Sign in to get started</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {page === 'counter' && (
          <div style={styles.main}>
            <div style={styles.sectionHeader}>Hero counter picker</div>
            <p style={{ fontSize: 13, color: '#8a7d5a', marginBottom: 24, lineHeight: 1.6 }}>Select your hero and the enemy team to get instant AI advice on how to play the matchup.</p>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>Your hero</div>
              <select value={counterHero} onChange={e => setCounterHero(e.target.value)} style={styles.select}>
                <option value="">Select your hero</option>
                {(ROSTERS[selectedGame] || []).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>
                Enemy team <span style={{ color: '#c8a84b', fontSize: 9 }}>({counterEnemyTeam.length}/6 selected)</span>
              </div>
              <div style={{ border: '1px solid #d4c9a8', background: '#faf6ee', maxHeight: 200, overflowY: 'auto' }}>
                {(ROSTERS[selectedGame] || []).map(hero => {
                  const selected = counterEnemyTeam.includes(hero)
                  return (
                    <div key={hero} onClick={() => {
                      if (selected) {
                        setCounterEnemyTeam(counterEnemyTeam.filter(e => e !== hero))
                      } else if (counterEnemyTeam.length < 6) {
                        setCounterEnemyTeam([...counterEnemyTeam, hero])
                      }
                    }} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selected ? '#f0e9d6' : 'transparent', borderBottom: '1px solid #f0e9d6' }}>
                      <div style={{ width: 14, height: 14, border: `1.5px solid ${selected ? '#1a1a1a' : '#c8bb96'}`, background: selected ? '#1a1a1a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <div style={{ width: 8, height: 8, background: '#faf6ee' }}></div>}
                      </div>
                      <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: selected ? 600 : 400 }}>{hero}</div>
                    </div>
                  )
                })}
              </div>
              {counterEnemyTeam.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#8a7d5a' }}>
                  Selected: {counterEnemyTeam.join(', ')}
                </div>
              )}
            </div>

            <button onClick={analyzeCounterPick} disabled={!counterHero || counterEnemyTeam.length === 0 || counterLoading} style={{ ...styles.startBtn, opacity: !counterHero || counterEnemyTeam.length === 0 ? 0.5 : 1, marginBottom: '1.5rem' }}>
              {counterLoading ? 'Analysing matchup...' : 'Analyse matchup'}
            </button>

            {counterAnalysis && (
              <div style={{ background: '#faf6ee', border: '1px solid #d4c9a8', padding: '2rem' }}>
                <div style={{ height: 4, background: '#1a1a1a', marginBottom: '1.5rem' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#1a1a1a', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontFamily: serif, fontSize: 13, color: 'rgba(250,246,238,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Difficulty</div>
                  <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: '#c8a84b' }}>{counterAnalysis.difficulty}</div>
                  <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)' }}></div>
                  <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.7)', lineHeight: 1.6 }}>{counterAnalysis.overview}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Laning phase</div>
                    <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.laning}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Items to prioritise</div>
                    {(counterAnalysis.items || []).map((item, i) => (
                      <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e8e0c8' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.5 }}>{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Key threats</div>
                  {(counterAnalysis.threats || []).map((threat, i) => (
                    <div key={i} style={{ background: '#fff8f0', border: '1px solid #d4c9a8', borderLeft: '3px solid #8b2020', padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{threat.hero}</div>
                      <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.5 }}>{threat.why}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#1a1a1a', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(250,246,238,0.4)', marginBottom: 6 }}>Win condition</div>
                  <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.85)', lineHeight: 1.6 }}>{counterAnalysis.winCondition}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Team fights</div>
                    <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.teamfight}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>What to avoid</div>
                    <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.avoid}</div>
                  </div>
                </div>

                <div style={{ height: 4, background: '#1a1a1a', marginTop: '1.5rem' }}></div>
              </div>
            )}

            <button onClick={() => { setPage('home'); setCounterAnalysis(null); setCounterHero(''); setCounterEnemyTeam([]) }} style={{ ...styles.newSessionBtn, marginTop: '1.5rem' }}>
              Back to home
            </button>
          </div>
        )}
        {status === 'idle' && (
          <div style={styles.main}>
            

            {selectedGame !== 'cs2' && (
  <div style={{ marginBottom: '1.5rem' }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>{game.characterLabel}</div>
    <select value={character} onChange={e => setCharacter(e.target.value)} style={styles.select}>
      {(ROSTERS[selectedGame] || []).map(c => <option key={c}>{c}</option>)}
    </select>
  </div>
)}

            {selectedGame !== 'cs2' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>
                  Enemy team <span style={{ color: '#c8a84b', fontSize: 9 }}>({enemyTeam.filter(e => e !== '').length}/6 selected)</span>
                </div>
                <div style={{ border: '1px solid #d4c9a8', background: '#faf6ee', maxHeight: 200, overflowY: 'auto' }}>
                  {(ROSTERS[selectedGame] || []).map(hero => {
                    const selected = enemyTeam.includes(hero)
                    return (
                      <div key={hero} onClick={() => {
                        if (selected) {
                          setEnemyTeam(enemyTeam.filter(e => e !== hero))
                        } else if (enemyTeam.filter(e => e !== '').length < 6) {
                          setEnemyTeam([...enemyTeam.filter(e => e !== ''), hero, ...Array(6 - enemyTeam.filter(e => e !== '').length - 1).fill('')])
                        }
                      }} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selected ? '#f0e9d6' : 'transparent', borderBottom: '1px solid #f0e9d6' }}>
                        <div style={{ width: 14, height: 14, border: `1.5px solid ${selected ? '#1a1a1a' : '#c8bb96'}`, background: selected ? '#1a1a1a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <div style={{ width: 8, height: 8, background: '#faf6ee' }}></div>}
                        </div>
                        <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: selected ? 600 : 400 }}>{hero}</div>
                      </div>
                    )
                  })}
                </div>
                {enemyTeam.filter(e => e !== '').length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#8a7d5a' }}>
                    Selected: {enemyTeam.filter(e => e !== '').join(', ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>Your rank</div>
  <select value={playerRank} onChange={e => setPlayerRank(e.target.value)} style={styles.select}>
    <option value="">Select your rank (optional)</option>
    {selectedGame === 'deadlock' && <>
      <option value="beginner">Obscurus / Initiate</option>
      <option value="beginner2">Seeker / Alchemist</option>
      <option value="intermediate">Ritualist / Emissary</option>
      <option value="intermediate2">Archon</option>
      <option value="advanced">Oracle / Phantom</option>
      <option value="advanced2">Ascendant / Eternus</option>
    </>}
    {selectedGame === 'valorant' && <>
      <option value="beginner">Iron / Bronze</option>
      <option value="beginner2">Silver / Gold</option>
      <option value="intermediate">Platinum / Diamond</option>
      <option value="advanced">Ascendant / Immortal</option>
      <option value="advanced2">Radiant</option>
    </>}
    {selectedGame === 'cs2' && <>
      <option value="beginner">Silver / Gold Nova</option>
      <option value="intermediate">Master Guardian</option>
      <option value="intermediate2">Distinguished / Legendary Eagle</option>
      <option value="advanced">Supreme / Global Elite</option>
    </>}
  </select>
</div>
            <div style={styles.tipBox}>
              <div style={{ width: 6, height: 6, background: '#c8a84b', borderRadius: '50%', flexShrink: 0, marginTop: 5 }}></div>
              <div style={{ fontSize: 12, color: 'rgba(250,246,238,0.6)', lineHeight: 1.6 }}><span style={{ color: '#c8a84b', fontWeight: 500 }}>Before starting:</span> {game.tip}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '2.5rem' }}>
  <button onClick={startSession} style={styles.startBtn}>
    Analyse matchup & record
  </button>
  <button onClick={async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1, width: 1920, height: 1080 }, audio: false })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()
      videoRef.current = video
      const { data } = await axios.post(`${API}/api/sessions/start`, {
        userId: user.id,
        game: selectedGame,
        character,
        enemyTeam,
        playerRank
      })
      setSessionId(data.sessionId)
      setStatus('recording')
      setFrameCount(0)
      setTimeout(() => captureFrame(data.sessionId), 2000)
      intervalRef.current = setInterval(() => captureFrame(data.sessionId), 30000)
    } catch(err) {
      console.error('Recording error:', err)
    }
  }} style={styles.startBtn}>
    Start recording
  </button>
</div>

            {history.length > 0 && (
              <div>
                <div style={styles.sectionHeader}>Recent sessions</div>
                {history.slice(0, 5).map(s2 => {
                  const g = GAMES[s2.game]
                  return (
                    <div key={s2.id} onClick={() => viewSession(s2)} style={styles.sessionRow}>
                      <div style={styles.sessionIcon}>{g?.short || '?'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{g?.name} {s2.character ? `— ${s2.character}` : ''}</div>
                        <div style={{ fontSize: 11, color: '#8a7d5a', marginTop: 2 }}>{s2.frame_count} frames · {new Date(s2.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      </div>
                      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: gradeColor(s2.analysis?.grades?.positioning) }}>{s2.analysis?.grades?.positioning || '—'}</div>
                      <div style={{ fontSize: 11, color: '#8a7d5a', marginLeft: 8 }}>View →</div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={styles.footer}>
              <div style={{ fontFamily: serif, fontSize: 14, color: 'rgba(250,246,238,0.4)' }}>spectate.gg</div>
              <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.2)', letterSpacing: '0.05em' }}>AI coaching · No install required</div>
            </div>
          </div>
        )}

        {status === 'counterpick' && (
          <div style={styles.main}>
            {counterLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                <div style={{ fontFamily: serif, fontSize: 22, color: '#1a1a1a', marginBottom: 8 }}>Analysing matchup...</div>
                <div style={{ fontSize: 13, color: '#8a7d5a' }}>Getting your pre-game briefing ready</div>
              </div>
            ) : counterAnalysis && (
              <div>
                <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>Pre-game briefing</div>
                <div style={{ fontSize: 13, color: '#8a7d5a', marginBottom: 24 }}>{character} vs {enemyTeam.join(', ')}</div>

                <div style={{ background: '#faf6ee', border: '1px solid #d4c9a8', padding: '2rem', marginBottom: '1.5rem' }}>
                  <div style={{ height: 4, background: '#1a1a1a', marginBottom: '1.5rem' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#1a1a1a', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontFamily: serif, fontSize: 13, color: 'rgba(250,246,238,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Difficulty</div>
                    <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: '#c8a84b' }}>{counterAnalysis.difficulty}</div>
                    <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)' }}></div>
                    <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.7)', lineHeight: 1.6 }}>{counterAnalysis.overview}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Laning phase</div>
                      <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.laning}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Items to prioritise</div>
                      {(counterAnalysis.items || []).map((item, i) => (
                        <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e8e0c8' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.5 }}>{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Key threats</div>
                    {(counterAnalysis.threats || []).map((threat, i) => (
                      <div key={i} style={{ background: '#fff8f0', border: '1px solid #d4c9a8', borderLeft: '3px solid #8b2020', padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{threat.hero}</div>
                        <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.5 }}>{threat.why}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#1a1a1a', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(250,246,238,0.4)', marginBottom: 6 }}>Win condition</div>
                    <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.85)', lineHeight: 1.6 }}>{counterAnalysis.winCondition}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Team fights</div>
                      <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.teamfight}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>What to avoid</div>
                      <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.7 }}>{counterAnalysis.avoid}</div>
                    </div>
                  </div>

                  <div style={{ height: 4, background: '#1a1a1a', marginTop: '1.5rem' }}></div>
                </div>

                <button onClick={async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1, width: 1920, height: 1080 }, audio: false })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()
      videoRef.current = video
      const { data } = await axios.post(`${API}/api/sessions/start`, {
        userId: user.id,
        game: selectedGame,
        character,
        enemyTeam,
        playerRank
      })
      setSessionId(data.sessionId)
      setStatus('recording')
      setFrameCount(0)
      setTimeout(() => captureFrame(data.sessionId), 2000)
      intervalRef.current = setInterval(() => captureFrame(data.sessionId), 30000)
    } catch(err) {
      console.error('Recording error:', err)
    }
  }} style={styles.startBtn}>
  Start recording session
</button>
              </div>
            )}
          </div>
        )}
        {status === 'recording' && (
          <div style={styles.main}>
            <div style={{ textAlign: 'center', padding: '2rem', background: '#1a1a1a', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b2020', animation: 'pulse 1.5s infinite' }}></div>
                <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.6)' }}>Recording {game.name}</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 56, fontWeight: 700, color: '#faf6ee', marginBottom: 4 }}>{frameCount}</div>
              <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.3)', marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Frames captured</div>
              <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.4)', marginBottom: 24 }}>Go play — come back when you are done</div>
<div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
  <button onClick={endSession} style={{ padding: '12px 32px', background: '#8b2020', color: '#faf6ee', border: 'none', fontFamily: serif, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>End session and analyze</button>
  <button onClick={() => {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStatus('idle')
    setFrameCount(0)
    setCounterAnalysis(null)
    setEnemyTeam([])
  }} style={{ padding: '12px 32px', background: 'transparent', color: 'rgba(250,246,238,0.4)', border: '1px solid rgba(250,246,238,0.15)', fontFamily: serif, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
</div>
            </div>

            {counterAnalysis && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 10, borderBottom: '2px solid #1a1a1a', marginBottom: '1.5rem' }}>Pre-game briefing — refer back while playing</div>
                <div style={{ background: '#faf6ee', border: '1px solid #d4c9a8', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem', background: '#1a1a1a', padding: '1rem 1.25rem' }}>
                    <div style={{ fontFamily: serif, fontSize: 13, color: 'rgba(250,246,238,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Difficulty</div>
                    <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: '#c8a84b' }}>{counterAnalysis.difficulty}</div>
                    <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)' }}></div>
                    <div style={{ fontSize: 12, color: 'rgba(250,246,238,0.6)', lineHeight: 1.6 }}>{counterAnalysis.overview}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 8 }}>Win condition</div>
                      <div style={{ fontSize: 12, color: '#3d3320', lineHeight: 1.6 }}>{counterAnalysis.winCondition}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 8 }}>Key threats</div>
                      {(counterAnalysis.threats || []).slice(0, 2).map((threat, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#3d3320', marginBottom: 6 }}>
                          <strong>{threat.hero}:</strong> {threat.why}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'analyzing' && (
          <div style={{ textAlign: 'center', padding: '5rem 4%' }}>
            <div style={{ fontFamily: serif, fontSize: 24, color: '#1a1a1a', marginBottom: 8 }}>Analysing your session...</div>
            <div style={{ fontSize: 13, color: '#8a7d5a' }}>This takes about 20–30 seconds</div>
          </div>
        )}

        {status === 'done' && analysis && (
          <div style={{ padding: '2.5rem 4%' }}>
            <div id="coaching-report" style={{ background: '#faf6ee', border: '1px solid #d4c9a8', maxWidth: 780, margin: '0 auto', padding: '3rem', fontFamily: sans, color: '#1a1a1a' }}>
              <div style={{ height: 4, background: '#1a1a1a', marginBottom: '2rem' }}></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #c8bb96' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', marginBottom: 6 }}>Spectate.gg — Performance Report</div>
                  <div style={{ fontFamily: serif, fontSize: 36, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1, marginBottom: 8 }}>{user?.firstName || user?.emailAddresses?.[0]?.emailAddress || 'Player'}</div>
                  <div style={{ fontSize: 13, color: '#6b5f3e', marginBottom: 4 }}>{GAMES[selectedGame]?.name} · {character} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ width: 120, height: 120, border: '1px solid #c8bb96', background: '#f0e9d6', overflow: 'hidden', marginLeft: 'auto', marginBottom: 8 }}>
                    <img src={`/heroes/${(character || '').toLowerCase().replace(/\s+/g, '-').replace(/[&]/g, 'and')}.png`} alt={character} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#1a1a1a', color: '#faf6ee', padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: serif, fontSize: 56, fontWeight: 700, color: '#faf6ee', lineHeight: 1, minWidth: 60 }}>{analysis.grades?.positioning || analysis.grades?.decisions || 'B'}</div>
                <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.15)' }}></div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(250,246,238,0.5)', marginBottom: 6 }}>Overall assessment</div>
                  <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.85)', lineHeight: 1.6, maxWidth: 480 }}>{analysis.summary}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Key highlights</div>
                  {[analysis.topPriority, ...(analysis.mistakes || []).slice(0, 2).map(m => m.title), ...(analysis.strengths || []).slice(0, 1).map(st => st.title)].filter(Boolean).map((point, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: '#c8bb96', minWidth: 20, lineHeight: 1.2 }}>{i + 1}</div>
                      <div style={{ fontSize: 12, color: '#3d3320', lineHeight: 1.6 }}>{point}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Ratings</div>
                  {Object.entries(analysis.grades || {}).map(([k, v]) => {
                    const pct = { A: 88, B: 65, C: 40, D: 20 }[v?.[0]] || 50
                    const col = { A: '#2d6a2d', B: '#1a1a1a', C: '#8b2020', D: '#8b2020' }[v?.[0]] || '#1a1a1a'
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e0d8c0' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', minWidth: 100, textTransform: 'capitalize' }}>{k}</div>
                        <div style={{ flex: 1, height: 6, background: '#e0d8c0' }}><div style={{ width: `${pct}%`, height: '100%', background: col }}></div></div>
                        <div style={{ fontFamily: serif, fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: 'right', color: col }}>{v}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {analysis.topPriority && (
                <div style={styles.priorityBox}>
                  <div style={{ fontFamily: serif, fontSize: 24, color: '#c8a84b', flexShrink: 0 }}>★</div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(250,246,238,0.5)', marginBottom: 5 }}>Top priority this week</div>
                    <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.85)', lineHeight: 1.6 }}>{analysis.topPriority}</div>
                  </div>
                </div>
              )}

              {(analysis.strengths || []).length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Strengths</div>
                  {(analysis.strengths || []).map((st, i) => (
                    <div key={i} style={styles.strengthCard}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{st.title}</div>
                      <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.6 }}>{st.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              {(analysis.mistakes || []).length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 8, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Weaknesses</div>
                  {(analysis.mistakes || []).map((m, i) => (
                    <div key={i} style={styles.issueCard}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>
                        {m.title}
                        {m.severity && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', marginLeft: 8, border: `1px solid ${m.severity === 'high' ? '#8b2020' : '#7a5c00'}`, color: m.severity === 'high' ? '#8b2020' : '#7a5c00' }}>{m.severity}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#5a4e35', lineHeight: 1.6 }}>{m.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px solid #c8bb96', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
                <div style={{ fontFamily: serif, fontSize: 14, color: '#8a7d5a' }}>spectate.gg</div>
                <div style={{ fontSize: 10, color: '#a89870', letterSpacing: '0.05em' }}>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Confidential</div>
              </div>
              <div style={{ height: 4, background: '#1a1a1a', marginTop: '2rem' }}></div>
            </div>

            <div style={{ maxWidth: 780, margin: '2rem auto 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7d5a', paddingBottom: 10, borderBottom: '2px solid #1a1a1a', marginBottom: '1rem' }}>Ask your coach</div>
              <div style={{ marginBottom: 16 }}>
                {chatHistory.map((m, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: '12px 16px', background: m.role === 'user' ? '#f0e9d6' : '#faf6ee', border: `1px solid ${m.role === 'user' ? '#c8bb96' : '#d4c9a8'}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: m.role === 'user' ? '#8a7d5a' : '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{m.role === 'user' ? 'You' : 'Coach'}</div>
                    <div style={{ fontSize: 13, color: '#3d3320', lineHeight: 1.6 }}>{m.content}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && askQuestion()} placeholder="Ask anything about your game..." style={styles.chatInput} />
                <button onClick={askQuestion} disabled={askingQuestion || !question.trim()} style={{ ...styles.askBtn, opacity: askingQuestion ? 0.6 : 1 }}>{askingQuestion ? '...' : 'Ask'}</button>
              </div>
            </div>

            <div style={{ maxWidth: 780, margin: '1rem auto 0' }}>
              <button onClick={() => { setStatus('idle'); setAnalysis(null); setFrameCount(0); setChatHistory([]); setQuestion(''); setViewingSession(null); setEnemyTeam([]) }} style={styles.newSessionBtn}>
                Start new session
              </button>
            </div>

            <div style={styles.footer}>
              <div style={{ fontFamily: serif, fontSize: 14, color: 'rgba(250,246,238,0.4)' }}>spectate.gg</div>
              <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.2)', letterSpacing: '0.05em' }}>AI coaching · No install required</div>
            </div>
          </div>
        )}
      </SignedIn>
    </div>
  )
}