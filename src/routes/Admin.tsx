import { SetStateAction, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { doc, onSnapshot, serverTimestamp, setDoc, getDoc, deleteDoc, collection, getDocs, updateDoc, writeBatch } from 'firebase/firestore'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, getAuth } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { roundConverter } from '../lib/converters'
import type { Round, Option} from '../types'
import { useOptions} from '../hooks/useEventData'
import BuildFooter from '../components/BuildFooter'

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseBool(v: unknown, fallback: boolean) {
  if (v === undefined || v === null || v === '') return fallback
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'y'
}

function parseNum(v: unknown, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export default function Admin() {
const [user, setUser] = useState<ReturnType<typeof getAuth>['currentUser']>(null)
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [round, setRound] = useState<Round | null>(null)
const [duration, setDuration] = useState(45)
const [tally, setTally] = useState<Record<string, number>>({})
const [csvError, setCsvError] = useState<string | null>(null)
const [csvRows, setCsvRows] = useState<any[]>([])
const [csvPreview, setCsvPreview] = useState<Option[]>([])
const [importing, setImporting] = useState(false)
const SHOW_CSV_IMPORT = false
const EVENT_ID = 'default'
const options = useOptions(EVENT_ID)
const vetoed = new Set<string>((round as any)?.vetoedOptionIds ?? [])

const categories = useMemo(() => {
  const set = new Set<string>()
  for (const o of options) {
    const c = (o as any).categoryId || o.section
    if (c) set.add(String(c))
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}, [options])

const [selectedCategory, setSelectedCategory] = useState<string>('')

useEffect(() => {
  if (!selectedCategory && categories.length > 0) {
    const first = categories[0]
    if (first) setSelectedCategory(first)
  }
}, [categories, selectedCategory])


useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

function onCsvFile(file: File) {
  setCsvError(null)
  setCsvRows([])
  setCsvPreview([])

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results: { data: any[]; errors: string | any[] }) => {
      const rows = results.data as any[]
      setCsvRows(rows)

      // preview: maak Option objects van de eerste 10 regels
      const preview = rows.slice(0, 10).map((r, idx) => {
        const title = String(r.title ?? '').trim()
        const id = String(r.id ?? '').trim() || slugify(title) || `option-${idx + 1}`
        return {
          id,
          title,
          composer: String(r.composer ?? '').trim(),
          section: String(r.section ?? '').trim(),
          order: parseNum(r.order, idx + 1),
          enabled: parseBool(r.enabled, true),
          hasWon: parseBool(r.hasWon, false),
          // @ts-ignore (als je Option type nog geen categoryId heeft, voeg ’m toe in types.ts)
          categoryId: String(r.categoryId ?? r.genre ?? '').trim(),
        } as any
      })
      setCsvPreview(preview)

      if (results.errors?.length) {
        setCsvError(results.errors[0].message)
      }
    },
    error: (err: { message: SetStateAction<string | null> }) => setCsvError(err.message),
  })
}

async function importCsvToFirestore() {
  setCsvError(null)
  if (!csvRows.length) {
    setCsvError('Geen CSV data geladen.')
    return
  }

  setImporting(true)
  try {
    // om fallback order te bepalen
    let fallbackOrder = 1

    // maak lijst Options
    const optionsToWrite = csvRows.map((r, idx) => {
      const title = String(r.title ?? '').trim()
      if (!title) throw new Error(`Regel ${idx + 2}: title ontbreekt`) // +2 door header + 1-index

      const id = String(r.id ?? '').trim() || slugify(title) || `option-${idx + 1}`

      const opt: any = {
        title,
        composer: String(r.composer ?? '').trim(),
        section: String(r.section ?? '').trim(),
        order: parseNum(r.order, fallbackOrder++),
        enabled: parseBool(r.enabled, true),
        hasWon: parseBool(r.hasWon, false),
      }

      const categoryId = String(r.categoryId ?? r.genre ?? '').trim()
      if (categoryId) opt.categoryId = categoryId

      return { id, data: opt }
    })

    // chunk batches
    const chunkSize = 450 // safe margin
    for (let i = 0; i < optionsToWrite.length; i += chunkSize) {
      const chunk = optionsToWrite.slice(i, i + chunkSize)
      const batch = writeBatch(db)

      for (const item of chunk) {
        const ref = doc(db, `events/${EVENT_ID}/options/${item.id}`)
        batch.set(ref, item.data, { merge: true }) // merge = update/overwrite velden
      }

      await batch.commit()
    }

    alert(`✅ Import klaar: ${optionsToWrite.length} opties verwerkt.`)
  } catch (e: any) {
    setCsvError(e?.message ?? String(e))
  } finally {
    setImporting(false)
  }
}



useEffect(() => {
const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`).withConverter(roundConverter)
const unsub = onSnapshot(currentRef, (snap) => setRound(snap.exists() ? snap.data() : null))
return () => unsub()
}, [])


useEffect(() => {
if (!round) return
const unsub = onSnapshot(collection(db, `events/${EVENT_ID}/rounds/${round.id}/votes`), (snap) => {
const t: Record<string, number> = {}
snap.forEach((d) => {
const opt = d.data().optionId as string
t[opt] = (t[opt] ?? 0) + 1
})
setTally(t)
})
return () => unsub()
}, [round?.id])


async function login() {
await signInWithEmailAndPassword(auth, email, password)
}
async function logout() { await signOut(auth) }

// ...

async function startRound() {
  // 1) Als er een huidige ronde is: winner bepalen + markeren
  const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`)
  const currentSnap = await getDoc(currentRef)

  if (currentSnap.exists()) {
    const prev = currentSnap.data() as { id: string; status: string }
    // Alleen afronden als hij nog open is
    if (prev?.id && prev.status === 'open') {
      // votes ophalen
      const votesSnap = await getDocs(collection(db, `events/${EVENT_ID}/rounds/${prev.id}/votes`))
      const tally: Record<string, number> = {}
      votesSnap.forEach((d) => {
        const opt = d.data().optionId as string
        tally[opt] = (tally[opt] ?? 0) + 1
      })
      // winnaar kiezen
      let winner: string | null = null
      let max = -1
      // Object.entries(tally).forEach(([opt, n]) => { if (n > max) { max = n; winner = opt } })
      for (const [optId, n] of Object.entries(tally)) {
        if (vetoed.has(optId)) continue
        if (n > max) {max = n; winner = optId}
      }
      // vorige ronde sluiten + winnaar markeren
      await updateDoc(doc(db, `events/${EVENT_ID}/rounds/${prev.id}`), {
        status: 'closed',
        winnerOptionId: winner ?? null,
        tally,
        vetoedOptionIds: Array.from(vetoed)
      })
      if (winner) {
        await updateDoc(doc(db, `events/${EVENT_ID}/options/${winner}`), { hasWon: true })
      }
    }
  }

  // 2) Nieuwe ronde starten
  const id = crypto.randomUUID()
  const endsAt = Date.now() + duration * 1000
  const startedAt = Date.now()
  const categoryId = selectedCategory || 'unknown'

  await setDoc(doc(db, `events/${EVENT_ID}/rounds/${id}`), {
    id, status: 'open', startedAt, endsAt, categoryId, createdAt: serverTimestamp(),
  })
  await setDoc(doc(db, `events/${EVENT_ID}/rounds/current`), {
    id, status: 'open', startedAt, endsAt, categoryId,
  })
}

async function resetEvent() {
  if (!confirm('Weet je zeker dat je het hele event wilt resetten? Dit verwijdert alle rondes en stemmen.')) {
    return
  }

  // 1) Opties resetten
  const optionsSnap = await getDocs(collection(db, `events/${EVENT_ID}/options`))
  for (const optDoc of optionsSnap.docs) {
    // pas aan als je ook enabled=true wilt forceren
    await updateDoc(doc(db, `events/${EVENT_ID}/options/${optDoc.id}`), { hasWon: false })
  }

  // 2) rounds/current alias verwijderen (als aanwezig)
  try { await deleteDoc(doc(db, `events/${EVENT_ID}/rounds/current`)) } catch (_) {}

  // 3) Alle rondes + hun votes verwijderen
  const roundsSnap = await getDocs(collection(db, `events/${EVENT_ID}/rounds`))
  for (const r of roundsSnap.docs) {
    if (r.id === 'current') continue

    // votes subcollectie verwijderen
    const votesSnap = await getDocs(collection(db, `events/${EVENT_ID}/rounds/${r.id}/votes`))
    for (const v of votesSnap.docs) {
      await deleteDoc(v.ref)
    }

    // (optioneel) opruimen van legacy subcollecties, als die ooit bestaan:
    // const shardsSnap = await getDocs(collection(db, `events/${EVENT_ID}/rounds/${r.id}/optionCounts`))
    // for (const oc of shardsSnap.docs) {
    //   const shardDocs = await getDocs(collection(db, `events/${EVENT_ID}/rounds/${r.id}/optionCounts/${oc.id}/shards`))
    //   for (const sd of shardDocs.docs) await deleteDoc(sd.ref)
    //   await deleteDoc(oc.ref)
    // }

    // rondeDoc verwijderen
    await deleteDoc(r.ref)
  }

  console.log('✅ Event gereset: opties hersteld, rondes en stemmen verwijderd.')
  alert('Event is gereset.')
}

async function closeRound() {
  if (!round) return

  // 1) stemmen optellen
  const votesSnap = await getDocs(collection(db, `events/${EVENT_ID}/rounds/${round.id}/votes`))
  const totals: Record<string, number> = {}
  votesSnap.forEach((v) => {
    const data = v.data() as any
    const optionId = data?.optionId as string | undefined
    if (!optionId) return
    totals[optionId] = (totals[optionId] ?? 0) + 1
  })

  const totalVotes = Object.values(totals).reduce((acc, n) => acc + (n ?? 0), 0)

  const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`)
  const currentSnap = await getDoc(currentRef)
  const currentData: any = currentSnap.exists() ? currentSnap.data() : {}

  const vetoList: string[] =
    currentData.vetoedOptionIds ??
    []

  const vetoed = new Set<string>(vetoList)


  // 2) winnaar bepalen
  let winnerOptionId: string | null = null
  let max = -1
  for (const [optId, n] of Object.entries(totals)) {
    if (vetoed.has(optId)) continue
    if (n > max) { max = n; winnerOptionId = optId }
  }

  // 3) ronde sluiten + resultaten *publiceren*
  const roundRef   = doc(db, `events/${EVENT_ID}/rounds/${round.id}`)
  await updateDoc(roundRef,   { status: 'closed', winnerOptionId, totals, totalVotes, vetoedOptionIds: Array.from(vetoed) })
  await updateDoc(currentRef, { status: 'closed', winnerOptionId, totals, totalVotes, vetoedOptionIds: Array.from(vetoed) }) // publiek leest deze

  // 4) winnaar markeren zodat hij verdwijnt in volgende ronde
  if (winnerOptionId) {
    await updateDoc(doc(db, `events/${EVENT_ID}/options/${winnerOptionId}`), { hasWon: true })
  }
}

async function resetHasWon() {
  const optionsSnap = await getDocs(collection(db, `events/${EVENT_ID}/options`))
  for (const docSnap of optionsSnap.docs) {
    await updateDoc(doc(db, `events/${EVENT_ID}/options/${docSnap.id}`), { hasWon: false })
  }
  console.log('✅ Alle opties gereset (hasWon = false)')
}

const totalVotes = useMemo(() => Object.values(tally).reduce((a,b)=>a+b,0), [tally])


if (!user) {
return (
<div>
<h1>Regie login</h1>
<div className="card">
<div className="row"><input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} /></div>
<div className="row"><input type="password" placeholder="Wachtwoord" value={password} onChange={(e)=>setPassword(e.target.value)} /></div>
<div className="row"><button onClick={login}>Log in</button></div>
<p className="small">Zorg dat je in Firestore een doc hebt onder <code>/admins/{'{uid}'}</code> voor deze gebruiker.</p>
</div>
</div>
)
}


return (
<div>
<h1>Regie</h1>
<div className="card row">
<label>Duur (s): <input type="number" value={duration} onChange={(e)=>setDuration(Number(e.target.value))} /></label>
<label>Categorie:&nbsp; <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>{categories.map((c) => (<option key={c} value={c}>{c}</option>))}</select></label>
<div className="row" style={{gap:8}}>
<button onClick={startRound}>Start ronde</button>
<button onClick={closeRound}>Sluit ronde</button>
<button onClick={resetHasWon}>Reset opties</button>
<button onClick={resetEvent}>Reset hele event</button>
<button onClick={logout}>Log uit</button>
</div>
</div>


<div className="card">
<div><strong>Ronde:</strong> {round?.id ?? '—'} · <strong>Status:</strong> {round?.status ?? '—'}</div>
<div className="small">Totaal stemmen: {totalVotes}</div>
{Object.entries(tally).map(([opt, n]) => (
<div key={opt} style={{marginTop:8}}>
<div className="small">{opt}</div>
<div className="bar"><div style={{width: totalVotes? `${(n/totalVotes*100).toFixed(0)}%`:'0%'}}></div></div>
</div>
))}
</div>

  {SHOW_CSV_IMPORT &&(
    <div className="card">
      <h2 style={{ marginTop: 0 }}>CSV import (opties)</h2>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onCsvFile(f)
        }}
      />

      {csvError && <p style={{ color: 'tomato' }}>{csvError}</p>}

      {csvPreview.length > 0 && (
        <>
          <p className="small">Preview (eerste {csvPreview.length} regels):</p>
          {csvPreview.map((o) => (
            <div key={o.id} className="row" style={{ marginBottom: 8 }}>
              <div className="small">
                <strong>{o.title}</strong> — {o.id}
                {/* @ts-ignore */}
                {o.categoryId ? ` · ${o.categoryId}` : ''} · order {o.order}
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={importCsvToFirestore} disabled={importing}>
              {importing ? 'Importeren…' : `Importeer ${csvRows.length} opties`}
            </button>
          </div>
        </>
      )}
    </div>
  )}


<BuildFooter />
</div>

)
}
