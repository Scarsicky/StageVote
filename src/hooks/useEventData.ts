import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { optionConverter } from '../lib/converters'
import type { Option } from '../types'

export function useOptions(eventId: string) {
  const [data, setData] = useState<Option[]>([])
  useEffect(() => {
    const col = collection(db, `events/${eventId}/options`).withConverter(optionConverter)
    return onSnapshot(col, (snap) => {
      const items = snap.docs.map((d) => d.data())
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      setData(items)
    })
  }, [eventId])
  return data
}
