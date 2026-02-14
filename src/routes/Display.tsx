import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { roundConverter } from '../lib/converters'
import type { Round } from '../types'
import { useOptions } from '../hooks/useEventData'
import { useCountdown } from '../hooks/useCountdown'

const EVENT_ID = 'default'

export default function Display() {
  const options = useOptions(EVENT_ID)
  const [round, setRound] = useState<Round | null>(null)
  const roundCategory = (round as any)?.categoryId as string | undefined

  const displayOptions = useMemo(() => {
    if (!round || round.status !== 'open') return []
    return options
      .filter(o => o.enabled && !o.hasWon)
      .filter(o => {
        const c = (o as any).categoryId || o.section
        return String(c) === String(roundCategory)
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [options, round, roundCategory])

  // QR: bron uit query parameter ?qr=... (valt terug op /qr.png)
  const loc = useLocation()
  const params = new URLSearchParams(loc.search)
  const qrSrc = params.get('qr') || '/qr.png'

  // ronde volgen
  useEffect(() => {
    const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`).withConverter(roundConverter)
    const unsub = onSnapshot(currentRef, (snap) => setRound(snap.exists() ? snap.data() : null))
    return () => unsub()
  }, [])

  // countdown + progress
  const endTs = useMemo(() => round?.endsAt ?? null, [round])
  const { msLeft } = useCountdown(endTs)

  // We willen een procent: initialMsLeft pakken zodra de ronde open gaat
const startedAt = round?.startedAt ?? null
let pct = 100
if (round?.status === 'open' && startedAt && endTs) {
  const durationTotal = endTs - startedAt
  if (durationTotal > 0) {
    const elapsed = Date.now() - startedAt
    pct = Math.max(0, Math.min(100, Math.round((1 - elapsed / durationTotal) * 100)))
  } else {
    pct = 0
  }
}


  const roundResults = useMemo(() => {
    if (!round || round.status !== 'closed') return []
    const categoryId = String((round as any).categoryId ?? '')
    const totals = ((round as any).totals ?? {}) as Record<string, number>
    const vetoed = new Set<string>(((round as any).vetoedOptionIds ?? []) as string[])

    const inCategory = options.filter((o) => {
      const c = (o as any).categoryId || o.section
      return String(c) === categoryId
    })

    const allIds = new Set<string>([
      ...Object.keys(totals),
      ...inCategory.map((o) => o.id),
      ...Array.from(vetoed),
    ])

    return Array.from(allIds)
      .map((id) => {
        const meta = options.find((o) => o.id === id)
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
  }, [options, round])

  return (
    <div className="display-root">
      <div className="display-grid">
        {/* Linker kolom: QR + instructie */}
        <div className="panel qr">
          <img src={qrSrc} alt="QR naar de webapp" />
          <div className="caption">Scan de QR-code om mee te doen</div>
        </div>

        {/* Rechter kolom: status */}
        <div className="panel status">
          {!round && (
            <Idle />
          )}

          {round?.status === 'open' && (
            <OpenRound msLeft={msLeft} pct={pct} categoryId={(round as any).categoryId} options={displayOptions} />
          )}

          {round?.status === 'closed' && (
            <ClosedRound results={roundResults} />
          )}
        </div>
        {typeof (round as any)?.totalVotes === 'number' && (
          <div style={{ marginTop: 12, fontSize: '2rem', opacity: 0.9 }}>
            Totaal aantal uitgebrachte stemmen: <strong>{(round as any).totalVotes}</strong>
          </div>
        )}

      </div>
    </div>
  )
}

function Idle() {
  return (
    <div className="center">
      <div className="headline">Soli's Spetterende Spelshow begint binnenkort!</div>
      <div className="subtle">Blijf het scherm in de gaten houden…</div>
    </div>
  )
}

function OpenRound({ msLeft, pct, categoryId, options }: { msLeft: number; pct: number; categoryId: string; options: { id: string; title: string } [] }) {
  const seconds = Math.ceil(msLeft / 1000)
  return (
    <div className="center">
      <div className="headline">{categoryId}</div>
      <div className="massive">{seconds}</div>
      <div className="bar large"><div style={{ width: `${pct}%` }} /></div>
      <div className="display-options">
        {options.slice(0, 10).map(o => (
          <div key={o.id} className="display-option">{o.title}</div>
        ))}
      </div>

      {options.length > 10 && (
        <div className="subtle">+ {options.length - 10} meer…</div>
      )}

      <div className="subtle">Stem nu via de QR — de tijd loopt</div>
    </div>
  )
}

function ClosedRound({ results }: { results: { id: string; title: string; composer: string; section: string; vetoed: boolean }[] }) {
  return (
    <div className="center">
      <div className="headline">Uitslag ronde</div>
      {results.length === 0 && <div className="subtle">Nog geen uitslag beschikbaar.</div>}
      {results.length > 0 && (
        <div className="display-results-list">
          {results.map((result, index) => (
            <div key={result.id} className={`display-result-item ${result.vetoed ? 'is-vetoed' : ''}`}>
              <div>
                <strong>{index + 1}. {result.title}</strong>
                {(result.composer) && (
                  <div className="subtle" style={{ marginTop: 4 }}>
                    {result.composer}
                  </div>
                )}
              </div>
              {/* {result.vetoed && <span>VETO</span>}*/}
            </div>
          ))}
        </div>
      )}
      <div className="subtle">Nieuwe ronde start zo</div>
    </div>
  )
}
