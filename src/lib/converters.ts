import type { FirestoreDataConverter } from 'firebase/firestore'
import type { Round, Option } from '../types'


export const roundConverter: FirestoreDataConverter<Round> = {
toFirestore: (r: Round) => r,
fromFirestore: (snap) => snap.data() as Round,
}


export const optionConverter: FirestoreDataConverter<Option> = {
toFirestore: (o: Option) => o,
fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as Omit<Option,'id'>) }),
}