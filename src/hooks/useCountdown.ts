import { useEffect, useState } from 'react'
export function useCountdown(endTs: number | null) {
const [now, setNow] = useState(Date.now())
useEffect(() => {
const t = setInterval(() => setNow(Date.now()), 250)
return () => clearInterval(t)
}, [])
if (!endTs) return { msLeft: 0, done: true }
const msLeft = Math.max(0, endTs - now)
return { msLeft, done: msLeft === 0 }
}