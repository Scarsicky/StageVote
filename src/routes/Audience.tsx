import { useEffect, useMemo, useState } from 'react'
import { useCountdown } from '../hooks/useCountdown'
import { useDeviceId } from '../hooks/useDeviceId'
import { useOptions } from '../hooks/useEventData'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { roundConverter } from '../lib/converters'
import type { Round } from '../types'


const EVENT_ID = 'default'


export default function Audience() {
const deviceId = useDeviceId()
const [round, setRound] = useState<Round | null>(null)
const options = useOptions(EVENT_ID)
const voteOptions = useMemo(() => {
  if (!round || round.status !== 'open') return []
  return options
    .filter((o) => o.enabled && !o.hasWon)
    .filter((o) => {
      const c = (o as any).categoryId || o.section
      return String(c) === String((round as any).categoryId)
    })
}, [options, round])

  // ✅ Bevestiging + gekozen optie
  const [voted, setVoted] = useState(false)
  const [chosenOptionId, setChosenOptionId] = useState<string | null>(null)
  const chosen = useMemo(
    () => options.find(o => o.id === chosenOptionId) ?? null,
    [options, chosenOptionId]
  )


useEffect(() => {
const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`).withConverter(roundConverter)
const unsub = onSnapshot(currentRef, (snap) => setRound(snap.exists() ? snap.data() : null))
return () => unsub()
}, [])


const endTs = useMemo(() => round?.endsAt ?? null, [round])
const { msLeft, done } = useCountdown(endTs)

// ✅ Check: heeft dit device al gestemd in deze ronde? (robust na refresh)
  useEffect(() => {
    setVoted(false)
    setChosenOptionId(null)
    if (!round?.id || round.status !== 'open') return
    const voteRef = doc(db, `events/${EVENT_ID}/rounds/${round.id}/votes/${deviceId}`)
    const unsub = onSnapshot(voteRef, (snap) => {
      if (snap.exists()) {
        setVoted(true)
        const optId = (snap.data()?.optionId as string | undefined) ?? null
        setChosenOptionId(optId)
      }
    })
    return () => unsub()
  }, [round?.id, round?.status, deviceId])

async function vote(optionId: string) {
if (!round || round.status !== 'open' || voted) return
const voteRef = doc(db, `events/${EVENT_ID}/rounds/${round.id}/votes/${deviceId}`)
try {
await setDoc(voteRef, { optionId, createdAt: serverTimestamp() })
setChosenOptionId(optionId)
setVoted(true)
console.log('✅ Vote OK')
} catch (err) {
console.error('❌ Vote FAIL', err)
}
}

function ResultsPublic({
  optionsAll,
  totals,
  winnerOptionId,
}: {
  optionsAll: { id: string; title: string; composer: string; section: string }[]
  totals: Record<string, number>
  winnerOptionId: string | null
}) {
  // rows uit totals (bron van waarheid), metadata via optionsAll
  const rows = Object.entries(totals ?? {}).map(([optId, count]) => {
    const meta = optionsAll.find(o => o.id === optId)
    return {
      id: optId,
      title: meta?.title ?? optId,
      composer: meta?.composer ?? '',
      section: meta?.section ?? '',
      count: count ?? 0,
    }
  }).sort((a,b) => b.count - a.count)

  const totalVotes = rows.reduce((a,b)=>a+b.count, 0)
  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Uitslag</h2>
      {rows.length === 0 && <div className="small">Nog geen stemmen geregistreerd.</div>}
      {rows.map(r => {
        const pct = totalVotes ? Math.round(r.count / totalVotes * 100) : 0
        const isWinner = r.id === winnerOptionId
        return (
          <div key={r.id} style={{marginBottom:10}}>
            <div className="row">
              <div>
                <strong>{r.title}</strong> {isWinner && <span className="small">— winnaar 🏆</span>}
                {(r.composer || r.section) && <div className="small">{r.composer}{r.composer && r.section ? ' · ' : ''}{r.section}</div>}
              </div>
            </div>
          </div>
        )
      })}
      <div className="small" style={{marginTop:6}}>Totaal stemmen: {totalVotes}</div>
      <div className="small">Wachten op de volgende ronde…</div>
    </div>
  )
}

  return (
    <div>
      <h1>Stem mee</h1>

      {/* Geen actieve ronde */}
      {!round && <div className="card">Maak je klaar voor Soli's Spetterende Spelshow!</div>}

      {/* Open ronde → stem UI */}
      {round?.status === 'open' && (
        <>
          <div className="card row">
            <strong>Categorie:</strong> {(round as any).categoryId}
            <div><strong>Resterende tijd:</strong></div>
            <div className="small">{Math.ceil(msLeft / 1000)}s</div>
          </div>
          {/* ✅ Bevestiging na stem */}
          {voted ? (
            <div className="card">
              <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>✅ Bedankt, je stem is ontvangen!</div>
              {chosen && (
                <div className="small">
                  Je koos: <strong>{chosen.title}</strong> {chosen.composer ? `· ${chosen.composer}` : ''}
                </div>
              )}
              <div className="small" style={{ marginTop: 8 }}>Wacht op de uitslag…</div>
            </div>
          ) : (
            // Stemlijst (disabled als tijd om is)
            voteOptions.map((o) => (
              <div className="card row" key={o.id}>
                <div>
                  <div><strong>{o.title}</strong></div>
                  <div className="small">{o.composer}</div>
                </div>
                <button onClick={() => vote(o.id)} disabled={done}>Stem</button>
              </div>
            ))
          )}
        </>
      )}
      {round?.status === 'closed' && (
        <RankedResults
          optionsAll={options}
          round={round}
        />
      )}
    </div>
  )


  function RankedResults({
    optionsAll,
    round,
  }: {
    optionsAll: { id: string; title: string; composer?: string; section?: string; categoryId?: string }[]
    round: Round
  }) {
    const categoryId = String((round as any).categoryId ?? '')
    const totals = ((round as any).totals ?? {}) as Record<string, number>
    const vetoed = new Set<string>(((round as any).vetoedOptionIds ?? []) as string[])

    const inCategory = optionsAll.filter((o) => {
      const c = (o as any).categoryId || o.section
      return String(c) === categoryId
    })

    const allIds = new Set<string>([
      ...Object.keys(totals),
      ...inCategory.map((o) => o.id),
      ...Array.from(vetoed),
    ])

    const rows = Array.from(allIds)
      .map((id) => {
        const meta = optionsAll.find((o) => o.id === id)
        return {
          id,
          title: meta?.title ?? id,
          composer: meta?.composer ?? '',
          section: meta?.section ?? '',
          count: totals[id] ?? 0,
          vetoed: vetoed.has(id),
        }
      })
      .sort((a, b) => {
        if (a.vetoed !== b.vetoed) return a.vetoed ? 1 : -1
        if (a.count !== b.count) return b.count - a.count
        return a.title.localeCompare(b.title)
      })

    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Uitslag</h2>

        {rows.length === 0 && (
          <div className="small">
            De uitslag is nog niet bekend.
          </div>
        )}

        {rows.map((row, index) => (
          <div key={row.id} className="row" style={{ marginBottom: 8, opacity: row.vetoed ? 0.7 : 1 }}>
            <div>
              <div><strong>{index + 1}. {row.title}</strong></div>
              {(row.composer) && (
                <div className="small">
                  {row.composer}
                </div>
              )}
            </div>
           {/* {row.vetoed && <div className="small">VETO</div>} */}
          </div>
        ))}

        <div className="small" style={{ marginTop: 10, opacity: 0.8 }}>
          Bedankt voor het stemmen!
        </div>
      </div>
    )
  }



}
