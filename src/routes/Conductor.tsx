import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, getAuth } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { roundConverter } from '../lib/converters'
import type { Round } from '../types'
import { useOptions } from '../hooks/useEventData'

const EVENT_ID = 'default'

export default function Conductor() {
  const [user, setUser] = useState<ReturnType<typeof getAuth>['currentUser']>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [checkingRole, setCheckingRole] = useState(false)
  const [isConductor, setIsConductor] = useState(false)

  const options = useOptions(EVENT_ID)
  const [round, setRound] = useState<Round | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!user) {
        setIsConductor(false)
        return
      }
      setCheckingRole(true)
      try {
        const ref = doc(db, `conductors/${user.uid}`)
        const snap = await getDoc(ref)
        if (!cancelled) setIsConductor(snap.exists())
      } finally {
        if (!cancelled) setCheckingRole(false)
      }
    }

    check()
    return () => { cancelled = true }
  }, [user?.uid])

  useEffect(() => {
    if (!user || !isConductor) return
    const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`).withConverter(roundConverter)
    const unsub = onSnapshot(currentRef, (snap) => setRound(snap.exists() ? snap.data() : null))
    return () => unsub()
  }, [user, isConductor])

  async function login() {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function logout() {
    await signOut(auth)
    setRound(null)
  }

  useEffect(() => {
    const ref = doc(db, `events/${EVENT_ID}/rounds/current`).withConverter(roundConverter)
    return onSnapshot(ref, (snap) => setRound(snap.exists() ? snap.data() : null))
  }, [])

  const vetoed = useMemo(() => new Set((round?.vetoedOptionIds ?? []) as string[]), [round?.vetoedOptionIds])

  const roundOptions = useMemo(() => {
    if (!round || round.status !== 'open') return []
    const cat = (round as any).categoryId
    return options
      .filter(o => o.enabled && !o.hasWon)
      .filter(o => String(((o as any).categoryId || o.section)) === String(cat))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [options, round])

  async function toggleVeto(optionId: string) {
    if (!round || round.status !== 'open') return
    const ref = doc(db, `events/${EVENT_ID}/rounds/current`)
    const isVeto = vetoed.has(optionId)
    await updateDoc(ref, {
      vetoedOptionIds: isVeto ? arrayRemove(optionId) : arrayUnion(optionId),
    })
  }

  // --- UI states ---

  // 1) Niet ingelogd → login prompt (zoals admin)
  if (!user) {
    return (
      <div className="page">
        <h1>Dirigent</h1>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ynlogge</h2>

          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <input
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <input
              placeholder="Wachtwurd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button onClick={login} disabled={!email || !password}>
              Ynlogge
            </button>
          </div>

          <div className="small" style={{ opacity: 0.8, marginTop: 10 }}>
            Brûk it dirigenten account datst fan Jurjen krige hast.
          </div>
        </div>
      </div>
    )
  }

  // 2) Wel ingelogd, role check bezig
  if (checkingRole) {
    return (
      <div className="page">
        <h1>Dirigent</h1>
        <div className="card">Tagong kontrolearje</div>
      </div>
    )
  }

  // 3) Wel ingelogd, maar geen dirigent-rechten
  if (!isConductor) {
    return (
      <div className="page">
        <h1>Dirigent</h1>
        <div className="card">
          <p>
            Ynlogt as <strong>{user.email}</strong>, mar der binne gjin rjochten oan dit account tawiizen.
          </p>
          <button onClick={logout}>Útlogge</button>
          <p className="small" style={{ opacity: 0.8, marginTop: 10 }}>
            In admin moat dyn UID tafoege oan collection <code>conductors</code>.
          </p>
        </div>
      </div>
    )
  }

  // 4) Toegang OK → veto UI
  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dirigent</h1>
        <button onClick={logout}>Útlogge</button>
      </div>

      {!round && <div className="card">Efkes wachtsje, wy binne nog net begûn.</div>}

      {round && round.status !== 'open' && (
        <div className="card">Gjin iepen stimronde.</div>
      )}

      {round && round.status === 'open' && (
        <>
          <div className="card row" style={{ justifyContent: 'space-between' }}>
            <div><strong>Kategory:</strong> {(round as any).categoryId}</div>
            <div className="small">Veto’s: {vetoed.size}</div>
          </div>

          <div className="card small" style={{ opacity: 0.85 }}>
            VETO betsjut: dit stik mei net winne, ek al stimt it publyk derop.
          </div>

          {roundOptions.map(o => {
            const isVeto = vetoed.has(o.id)
            return (
              <div key={o.id} className="card row" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div><strong>{o.title}</strong></div>
                  <div className="small">{o.composer} · {o.section}</div>
                </div>

                <button
                  onClick={() => toggleVeto(o.id)}
                  style={{
                    border: isVeto ? '2px solid #ff6b6b' : undefined,
                    opacity: isVeto ? 1 : 0.85,
                  }}
                >
                  {isVeto ? 'VETO OAN' : 'VETO ÚT'}
                </button>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
