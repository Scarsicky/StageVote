export type RoundStatus = 'open' | 'closed' | 'announced'


export type Round = {
id: string
status: RoundStatus
endsAt: number // ms since epoch
startedAt: number
categoryId: string
winnerOptionId?: string | null
totals?: Record<string, number>
totalVotes?: number
vetoedOptionIds?: string[]
}


export type Option = {
id: string
title: string
composer: string
section: string
order: number
enabled: boolean
hasWon: boolean
categoryId?: string
}