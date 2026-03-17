import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore'
import crypto from 'node:crypto'

// ===== CONFIG =====
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const EVENT_ID = process.env.EVENT_ID ?? 'default'
const TOTAL_VOTERS = Number(process.env.TOTAL_VOTERS ?? 300)
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS ?? 45)
const RANDOM_SPREAD = true
// ==================

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

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDeviceId() {
  return `loadtest-${crypto.randomUUID()}`
}

async function main() {
  const currentRef = doc(db, `events/${EVENT_ID}/rounds/current`)
  const currentSnap = await getDoc(currentRef)

  if (!currentSnap.exists()) {
    throw new Error(`Geen rounds/current gevonden voor event ${EVENT_ID}`)
  }

  const round = currentSnap.data()
  if (round.status !== 'open') {
    throw new Error(`Ronde is niet open. Huidige status: ${round.status}`)
  }

  const roundId = round.id
  const categoryId = round.categoryId

  console.log(`Actieve ronde: ${roundId}`)
  console.log(`Categorie: ${categoryId}`)

  // Geldige opties ophalen
  const optionsSnap = await getDocs(collection(db, `events/${EVENT_ID}/options`))
  const options = optionsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => o.enabled === true && o.hasWon !== true)
    .filter((o) => String(o.categoryId ?? o.section) === String(categoryId))

  if (!options.length) {
    throw new Error(`Geen stemopties gevonden voor categorie ${categoryId}`)
  }

  console.log(`Opties in ronde: ${options.map((o) => o.id).join(', ')}`)

  const start = Date.now()
  const tasks = []

  for (let i = 0; i < TOTAL_VOTERS; i++) {
    const option = options[i % options.length]
    const deviceId = randomDeviceId()

    const delay = RANDOM_SPREAD
      ? Math.floor(Math.random() * DURATION_SECONDS * 1000)
      : Math.floor((i / TOTAL_VOTERS) * DURATION_SECONDS * 1000)

    tasks.push(
      (async () => {
        await sleep(delay)

        const voteRef = doc(db, `events/${EVENT_ID}/rounds/${roundId}/votes/${deviceId}`)
        try {
          await setDoc(voteRef, {
            optionId: option.id,
            createdAt: serverTimestamp(),
          })
          return { ok: true, optionId: option.id, delay }
        } catch (err) {
          return { ok: false, optionId: option.id, delay, err: String(err) }
        }
      })()
    )
  }

  const results = await Promise.all(tasks)
  const success = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  console.log(`\n=== RESULTAAT ===`)
  console.log(`Totaal stemmers: ${TOTAL_VOTERS}`)
  console.log(`Succesvol: ${success}`)
  console.log(`Gefaald: ${failed.length}`)
  console.log(`Looptijd: ${((Date.now() - start) / 1000).toFixed(1)}s`)

  if (failed.length) {
    console.log(`\nEerste 10 errors:`)
    failed.slice(0, 10).forEach((f, idx) => {
      console.log(`${idx + 1}. ${f.err}`)
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})