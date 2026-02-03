import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { roundConverter } from '../lib/converters'
import type { Round } from '../types'
import { useOptions } from '../hooks/useEventData'

const EVENT_ID = 'default'

export default function Conductor() {
  const options = useOptions(EVENT_ID)
  const [round, setRound] = useState<Round | null>(null)

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

  if (!round) {
    return <div className="card">Efkes wachtsje, wy binne nog net begûn</div>
  }

  if (round.status !== 'open') {
    return (
      <div className="card">
        <h1>Dirigent</h1>
        <div>Gjin iepen stimronde</div>
      </div>
    )
  }

  return (
    <div>
      <h1>Dirigent</h1>

      <div className="card row">
        <div><strong>Kategory:</strong> {(round as any).categoryId}</div>
        <div className="small">Veto’s: {vetoed.size}</div>
      </div>

      <div className="card small" style={{ opacity: 0.85 }}>
        Tip: VETO betsjut “dit stik mei net winne”, ek al stimt it publyk derop.
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
                opacity: isVeto ? 1 : 0.8,
                border: isVeto ? '2px solid #ff6b6b' : undefined,
              }}
            >
              {isVeto ? 'VETO OAN' : 'VETO ÚT'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
