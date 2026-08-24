import { IPlaySession } from '../../../shared/types'
import { api } from './api'

export type Granularity = 'day' | 'week' | 'month' | 'year'

export interface IAggregatedStatPoint {
  key: string
  label: string
  totalSeconds: number
  totalMinutes: number
  totalHours: number
  playCount: number
  avgSessionMinutes: number
}

export interface IOverallStats {
  totalSeconds: number
  totalPlays: number
  avgSessionSeconds: number
  currentStreakDays: number
  longestStreakDays: number
  uniqueSongsCount: number
}

export interface ISongLeaderboardEntry {
  fid: string
  name: string
  playCount: number
  totalSeconds: number
  lastPlayed: string
}

class PlaySessionService {
  private sessionsCache: IPlaySession[] | null = null
  private loadPromise: Promise<IPlaySession[]> | null = null
  private saveTimeout: ReturnType<typeof setTimeout> | null = null

  async getSessions(forceRefresh = false): Promise<IPlaySession[]> {
    if (this.sessionsCache && !forceRefresh) {
      return this.sessionsCache
    }

    if (this.loadPromise && !forceRefresh) {
      return this.loadPromise
    }

    this.loadPromise = (async () => {
      try {
        if (api.getPlaySessions) {
          const sessions = await api.getPlaySessions()
          this.sessionsCache = Array.isArray(sessions) ? sessions : []
        } else {
          this.sessionsCache = []
        }
      } catch (err) {
        console.error('[PlaySessionService] Failed to load sessions:', err)
        this.sessionsCache = []
      } finally {
        this.loadPromise = null
      }
      return this.sessionsCache || []
    })()

    return this.loadPromise
  }

  async recordSession(params: {
    fid: string
    fn: string
    dur: number
    ts?: string
  }): Promise<void> {
    if (params.dur <= 0) return

    const sessions = await this.getSessions()
    const newSession: IPlaySession = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ts: params.ts || new Date().toISOString(),
      fid: params.fid,
      fn: params.fn,
      dur: Math.round(params.dur)
    }

    sessions.push(newSession)
    this.sessionsCache = sessions

    // Debounce save to MEGA
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        if (api.savePlaySessions && this.sessionsCache) {
          await api.savePlaySessions(this.sessionsCache)
          console.log('[PlaySessionService] Saved play sessions to MEGA')
        }
      } catch (err) {
        console.error('[PlaySessionService] Failed to save sessions:', err)
      }
    }, 500)
  }

  getOverallStats(sessions: IPlaySession[]): IOverallStats {
    if (!sessions || sessions.length === 0) {
      return {
        totalSeconds: 0,
        totalPlays: 0,
        avgSessionSeconds: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        uniqueSongsCount: 0
      }
    }

    let totalSeconds = 0
    const songIdSet = new Set<string>()
    const activeDaysSet = new Set<string>()

    for (const session of sessions) {
      totalSeconds += session.dur || 0
      if (session.fid) songIdSet.add(session.fid)
      const dateStr = session.ts ? session.ts.split('T')[0] : ''
      if (dateStr) activeDaysSet.add(dateStr)
    }

    const totalPlays = sessions.length
    const avgSessionSeconds = totalPlays > 0 ? Math.round(totalSeconds / totalPlays) : 0

    // Compute streak
    const sortedDays = Array.from(activeDaysSet).sort()
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0

    if (sortedDays.length > 0) {
      // Calculate longest streak
      let prevDate: Date | null = null
      for (const dayStr of sortedDays) {
        const currentDate = new Date(dayStr)
        if (prevDate) {
          const diffMs = currentDate.getTime() - prevDate.getTime()
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
          if (diffDays === 1) {
            tempStreak++
          } else {
            tempStreak = 1
          }
        } else {
          tempStreak = 1
        }
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak
        }
        prevDate = currentDate
      }

      // Calculate current streak
      const todayStr = new Date().toISOString().split('T')[0]
      const yesterdayDate = new Date()
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterdayStr = yesterdayDate.toISOString().split('T')[0]

      const hasPlayedToday = activeDaysSet.has(todayStr)
      const hasPlayedYesterday = activeDaysSet.has(yesterdayStr)

      if (hasPlayedToday || hasPlayedYesterday) {
        const checkDate = new Date(hasPlayedToday ? todayStr : yesterdayStr)
        while (true) {
          const checkStr = checkDate.toISOString().split('T')[0]
          if (activeDaysSet.has(checkStr)) {
            currentStreak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else {
            break
          }
        }
      }
    }

    return {
      totalSeconds,
      totalPlays,
      avgSessionSeconds,
      currentStreakDays: currentStreak,
      longestStreakDays: longestStreak,
      uniqueSongsCount: songIdSet.size
    }
  }

  getAggregatedData(sessions: IPlaySession[], granularity: Granularity): IAggregatedStatPoint[] {
    if (!sessions || sessions.length === 0) {
      return this.generateEmptyTimeframes(granularity)
    }

    const groupedMap = new Map<
      string,
      { label: string; totalSeconds: number; playCount: number; sortKey: string }
    >()

    for (const session of sessions) {
      const date = new Date(session.ts)
      if (isNaN(date.getTime())) continue

      const { key, label, sortKey } = this.getTimeGroupInfo(date, granularity)
      const existing = groupedMap.get(key) || {
        label,
        totalSeconds: 0,
        playCount: 0,
        sortKey
      }

      existing.totalSeconds += session.dur || 0
      existing.playCount += 1
      groupedMap.set(key, existing)
    }

    // Fill missing contiguous buckets for a pleasing continuous bar chart
    const result = this.fillContiguousBuckets(groupedMap, granularity)
    return result
  }

  private getTimeGroupInfo(
    date: Date,
    granularity: Granularity
  ): { key: string; label: string; sortKey: string } {
    const year = date.getFullYear()
    const month = date.getMonth() // 0-11
    const day = date.getDate()

    if (granularity === 'day') {
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ]
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const label = `${monthNames[month]} ${day}`
      return { key, label, sortKey: key }
    }

    if (granularity === 'week') {
      // Get ISO Week Number
      const startOfYear = new Date(year, 0, 1)
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
      const key = `${year}-W${String(weekNumber).padStart(2, '0')}`
      const label = `W${weekNumber}`
      return { key, label, sortKey: key }
    }

    if (granularity === 'month') {
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ]
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      const label = `${monthNames[month]} ${year}`
      return { key, label, sortKey: key }
    }

    // Year
    const key = `${year}`
    return { key, label: `${year}`, sortKey: key }
  }

  private generateEmptyTimeframes(granularity: Granularity): IAggregatedStatPoint[] {
    const now = new Date()
    const list: IAggregatedStatPoint[] = []

    if (granularity === 'day') {
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(now.getDate() - i)
        const info = this.getTimeGroupInfo(d, 'day')
        list.push({
          key: info.key,
          label: info.label,
          totalSeconds: 0,
          totalMinutes: 0,
          totalHours: 0,
          playCount: 0,
          avgSessionMinutes: 0
        })
      }
    } else if (granularity === 'week') {
      for (let i = 7; i >= 0; i--) {
        const d = new Date()
        d.setDate(now.getDate() - i * 7)
        const info = this.getTimeGroupInfo(d, 'week')
        list.push({
          key: info.key,
          label: info.label,
          totalSeconds: 0,
          totalMinutes: 0,
          totalHours: 0,
          playCount: 0,
          avgSessionMinutes: 0
        })
      }
    } else if (granularity === 'month') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const info = this.getTimeGroupInfo(d, 'month')
        list.push({
          key: info.key,
          label: info.label,
          totalSeconds: 0,
          totalMinutes: 0,
          totalHours: 0,
          playCount: 0,
          avgSessionMinutes: 0
        })
      }
    } else {
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear() - i, 0, 1)
        const info = this.getTimeGroupInfo(d, 'year')
        list.push({
          key: info.key,
          label: info.label,
          totalSeconds: 0,
          totalMinutes: 0,
          totalHours: 0,
          playCount: 0,
          avgSessionMinutes: 0
        })
      }
    }

    return list
  }

  private fillContiguousBuckets(
    groupedMap: Map<
      string,
      { label: string; totalSeconds: number; playCount: number; sortKey: string }
    >,
    granularity: Granularity
  ): IAggregatedStatPoint[] {
    const keys = Array.from(groupedMap.keys()).sort()
    if (keys.length === 0) {
      return this.generateEmptyTimeframes(granularity)
    }

    // Default window based on granularity
    const now = new Date()
    const pointsMap = new Map<string, IAggregatedStatPoint>()

    if (granularity === 'day') {
      // Ensure at least the last 14 days are shown
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(now.getDate() - i)
        const { key, label } = this.getTimeGroupInfo(d, 'day')
        const data = groupedMap.get(key)
        const totalSeconds = data ? data.totalSeconds : 0
        const playCount = data ? data.playCount : 0
        const totalMinutes = Math.round((totalSeconds / 60) * 10) / 10
        const totalHours = Math.round((totalSeconds / 3600) * 100) / 100
        const avgSessionMinutes =
          playCount > 0 ? Math.round((totalSeconds / playCount / 60) * 10) / 10 : 0

        pointsMap.set(key, {
          key,
          label,
          totalSeconds,
          totalMinutes,
          totalHours,
          playCount,
          avgSessionMinutes
        })
      }
    } else if (granularity === 'week') {
      // Last 12 weeks
      for (let i = 11; i >= 0; i--) {
        const d = new Date()
        d.setDate(now.getDate() - i * 7)
        const { key, label } = this.getTimeGroupInfo(d, 'week')
        const data = groupedMap.get(key)
        const totalSeconds = data ? data.totalSeconds : 0
        const playCount = data ? data.playCount : 0
        const totalMinutes = Math.round((totalSeconds / 60) * 10) / 10
        const totalHours = Math.round((totalSeconds / 3600) * 100) / 100
        const avgSessionMinutes =
          playCount > 0 ? Math.round((totalSeconds / playCount / 60) * 10) / 10 : 0

        pointsMap.set(key, {
          key,
          label,
          totalSeconds,
          totalMinutes,
          totalHours,
          playCount,
          avgSessionMinutes
        })
      }
    } else if (granularity === 'month') {
      // Last 12 months
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const { key, label } = this.getTimeGroupInfo(d, 'month')
        const data = groupedMap.get(key)
        const totalSeconds = data ? data.totalSeconds : 0
        const playCount = data ? data.playCount : 0
        const totalMinutes = Math.round((totalSeconds / 60) * 10) / 10
        const totalHours = Math.round((totalSeconds / 3600) * 100) / 100
        const avgSessionMinutes =
          playCount > 0 ? Math.round((totalSeconds / playCount / 60) * 10) / 10 : 0

        pointsMap.set(key, {
          key,
          label,
          totalSeconds,
          totalMinutes,
          totalHours,
          playCount,
          avgSessionMinutes
        })
      }
    } else {
      // Years - include all existing keys from map + current year
      const yearKeys = new Set(keys)
      yearKeys.add(`${now.getFullYear()}`)
      const sortedYears = Array.from(yearKeys).sort()

      for (const y of sortedYears) {
        const data = groupedMap.get(y)
        const totalSeconds = data ? data.totalSeconds : 0
        const playCount = data ? data.playCount : 0
        const totalMinutes = Math.round((totalSeconds / 60) * 10) / 10
        const totalHours = Math.round((totalSeconds / 3600) * 100) / 100
        const avgSessionMinutes =
          playCount > 0 ? Math.round((totalSeconds / playCount / 60) * 10) / 10 : 0

        pointsMap.set(y, {
          key: y,
          label: y,
          totalSeconds,
          totalMinutes,
          totalHours,
          playCount,
          avgSessionMinutes
        })
      }
    }

    // Also merge any extra keys that existed in groupedMap
    for (const [key, data] of groupedMap.entries()) {
      if (!pointsMap.has(key)) {
        const totalMinutes = Math.round((data.totalSeconds / 60) * 10) / 10
        const totalHours = Math.round((data.totalSeconds / 3600) * 100) / 100
        const avgSessionMinutes =
          data.playCount > 0 ? Math.round((data.totalSeconds / data.playCount / 60) * 10) / 10 : 0

        pointsMap.set(key, {
          key,
          label: data.label,
          totalSeconds: data.totalSeconds,
          totalMinutes,
          totalHours,
          playCount: data.playCount,
          avgSessionMinutes
        })
      }
    }

    return Array.from(pointsMap.values()).sort((a, b) => a.key.localeCompare(b.key))
  }

  getLeaderboard(sessions: IPlaySession[], limit = 10): ISongLeaderboardEntry[] {
    if (!sessions || sessions.length === 0) return []

    const songMap = new Map<string, ISongLeaderboardEntry>()

    for (const s of sessions) {
      const fid = s.fid || s.fn
      const existing = songMap.get(fid) || {
        fid,
        name: s.fn || 'Unknown Tab',
        playCount: 0,
        totalSeconds: 0,
        lastPlayed: s.ts
      }

      existing.playCount += 1
      existing.totalSeconds += s.dur || 0
      if (!existing.lastPlayed || new Date(s.ts) > new Date(existing.lastPlayed)) {
        existing.lastPlayed = s.ts
        existing.name = s.fn || existing.name
      }

      songMap.set(fid, existing)
    }

    const sorted = Array.from(songMap.values()).sort((a, b) => {
      if (b.totalSeconds !== a.totalSeconds) {
        return b.totalSeconds - a.totalSeconds
      }
      return b.playCount - a.playCount
    })

    return sorted.slice(0, limit)
  }
}

export const playSessionService = new PlaySessionService()
