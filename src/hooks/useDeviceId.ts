const KEY = 'jukebox_device_id'
let inMemoryDeviceId: string | null = null

function createFallbackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createStableId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return createFallbackId()
}

export function useDeviceId() {
  if (inMemoryDeviceId) return inMemoryDeviceId

  try {
    const fromStorage = localStorage.getItem(KEY)
    if (fromStorage) {
      inMemoryDeviceId = fromStorage
      return fromStorage
    }

    const created = createStableId()
    localStorage.setItem(KEY, created)
    inMemoryDeviceId = created
    return created
  } catch {
    const created = createStableId()
    inMemoryDeviceId = created
    return created
  }
}
