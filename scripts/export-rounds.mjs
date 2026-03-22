import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {
  initializeApp,
} from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore'

dotenv.config({ path: '.env.local' })

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Ontbrekende environment variable: ${key}`)
  }
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const EVENT_ID = process.env.EVENT_ID ?? 'default'
const OUTPUT_DIR = path.resolve('exports')

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function safeJson(value) {
  return JSON.stringify(value ?? '')
}

function formatTs(value) {
  if (value == null) return ''
  if (typeof value === 'number') return new Date(value).toISOString()
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis()).toISOString()
  return String(value)
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`
  }
  return s
}

async function main() {
  ensureDir(OUTPUT_DIR)

  // 1) Alle opties ophalen en lookup bouwen
  const optionsRef = collection(db, `events/${EVENT_ID}/options`)
  const optionsSnap = await getDocs(optionsRef)

  const optionLookup = new Map()
  optionsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data()
    optionLookup.set(docSnap.id, {
      title: data.title ?? docSnap.id,
      composer: data.composer ?? '',
      section: data.section ?? '',
      categoryId: data.categoryId ?? '',
    })
  })

  // 2) Rondes ophalen
  const roundsRef = collection(db, `events/${EVENT_ID}/rounds`)
  const roundsSnap = await getDocs(query(roundsRef, orderBy('startedAt', 'asc')))

  const rounds = roundsSnap.docs
    .filter((docSnap) => docSnap.id !== 'current')
    .map((docSnap) => {
      const data = docSnap.data()

      const totals = data.totals ?? {}
      const vetoedOptionIds =
        data.vetoedOptionIds ??
        data.vetoedOptiesIds ??
        []

      const winnerOptionId = data.winnerOptionId ?? ''
      const winnerMeta = optionLookup.get(winnerOptionId)

      const vetoedTitles = vetoedOptionIds.map((id) => {
        const meta = optionLookup.get(id)
        return meta?.title ?? id
      })

      const totalsByTitle = {}
      for (const [optionId, count] of Object.entries(totals)) {
        const meta = optionLookup.get(optionId)
        const title = meta?.title ?? optionId
        totalsByTitle[title] = count
      }

      return {
        roundId: docSnap.id,
        status: data.status ?? '',
        categoryId: data.categoryId ?? '',
        startedAt: formatTs(data.startedAt),
        endsAt: formatTs(data.endsAt),

        winnerOptionId,
        winnerTitle: winnerMeta?.title ?? winnerOptionId,
        winnerComposer: winnerMeta?.composer ?? '',
        winnerSection: winnerMeta?.section ?? '',

        totalVotes: data.totalVotes ?? 0,

        vetoedTitles,
        totalsByTitle,
      }
    })

  // 3) JSON export
  const jsonPath = path.join(OUTPUT_DIR, `rounds-${EVENT_ID}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(rounds, null, 2), 'utf-8')

  // 4) CSV export
  const csvHeaders = [
    'roundId',
    'status',
    'categoryId',
    'startedAt',
    'endsAt',
    'winnerTitle',
    'winnerComposer',
    'winnerSection',
    'totalVotes',
    'vetoedTitles',
    'totalsByTitle',
  ]

  const csvLines = [
    csvHeaders.join(','),
    ...rounds.map((r) =>
      [
        csvEscape(r.roundId),
        csvEscape(r.status),
        csvEscape(r.categoryId),
        csvEscape(r.startedAt),
        csvEscape(r.endsAt),
        csvEscape(r.winnerTitle),
        csvEscape(r.winnerComposer),
        csvEscape(r.winnerSection),
        csvEscape(r.totalVotes),
        csvEscape(safeJson(r.vetoedTitles)),
        csvEscape(safeJson(r.totalsByTitle)),
      ].join(',')
    ),
  ]

  const csvPath = path.join(OUTPUT_DIR, `rounds-${EVENT_ID}.csv`)
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8')

  console.log(`Export klaar.`)
  console.log(`JSON: ${jsonPath}`)
  console.log(`CSV : ${csvPath}`)
  console.log(`Aantal rondes: ${rounds.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})