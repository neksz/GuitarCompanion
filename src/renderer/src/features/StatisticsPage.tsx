import React, { useEffect, useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts'
import {
  Clock,
  PlayCircle,
  Timer,
  Flame,
  Music,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Menu
} from 'lucide-react'
import {
  playSessionService,
  Granularity,
  IAggregatedStatPoint,
  IOverallStats,
  ISongLeaderboardEntry
} from '../services/PlaySessionService'
import { IPlaySession } from '../../../shared/types'
import styles from './StatisticsPage.module.css'

interface StatisticsPageProps {
  onOpenSidebar?: () => void
}

const formatSeconds = (sec: number): string => {
  if (sec < 60) return `${sec}s`
  const minutes = Math.floor(sec / 60)
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60

  if (hours > 0) {
    return `${hours}h ${remainingMins > 0 ? `${remainingMins}m` : ''}`
  }
  return `${minutes}m`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: IAggregatedStatPoint }>
  label?: string
  valueFormatter?: (val: number, item: IAggregatedStatPoint) => string
  unitLabel?: string
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  valueFormatter,
  unitLabel
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const rawVal = payload[0].value
    const formatted = valueFormatter ? valueFormatter(rawVal, data) : `${rawVal} ${unitLabel || ''}`

    return (
      <div className={styles.customTooltip}>
        <div className={styles.tooltipLabel}>{label || data.label}</div>
        <div className={styles.tooltipValue}>{formatted}</div>
        {data.playCount > 0 && unitLabel !== 'plays' && (
          <div style={{ fontSize: '0.75rem', color: '#888899', marginTop: '2px' }}>
            {data.playCount} {data.playCount === 1 ? 'session' : 'sessions'}
          </div>
        )}
      </div>
    )
  }
  return null
}

export const StatisticsPage: React.FC<StatisticsPageProps> = ({ onOpenSidebar }) => {
  const [sessions, setSessions] = useState<IPlaySession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [granularity, setGranularity] = useState<Granularity>('day')

  const loadData = async (forceRefresh = true): Promise<void> => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const data = await playSessionService.getSessions(forceRefresh)
      setSessions(data)
    } catch (err) {
      console.error('[StatisticsPage] Failed to load sessions:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    // Load fresh session data when Statistics page is opened
    loadData(true)
  }, [])

  const overallStats: IOverallStats = useMemo(() => {
    return playSessionService.getOverallStats(sessions)
  }, [sessions])

  const chartData: IAggregatedStatPoint[] = useMemo(() => {
    return playSessionService.getAggregatedData(sessions, granularity)
  }, [sessions, granularity])

  const leaderboard: ISongLeaderboardEntry[] = useMemo(() => {
    return playSessionService.getLeaderboard(sessions, 10)
  }, [sessions])

  const hasSessions = sessions.length > 0

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          {onOpenSidebar && (
            <button
              className={styles.menuButton}
              onClick={onOpenSidebar}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <h1 className={styles.title}>
              <BarChart3 className={styles.titleIcon} size={28} />
              Statistics
            </h1>
            <p className={styles.subtitle}>
              Track your guitar practice time, session consistency, and song mastery
            </p>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.granularityPills}>
            <button
              className={`${styles.pill} ${granularity === 'day' ? styles.activePill : ''}`}
              onClick={() => setGranularity('day')}
            >
              Days
            </button>
            <button
              className={`${styles.pill} ${granularity === 'week' ? styles.activePill : ''}`}
              onClick={() => setGranularity('week')}
            >
              Weeks
            </button>
            <button
              className={`${styles.pill} ${granularity === 'month' ? styles.activePill : ''}`}
              onClick={() => setGranularity('month')}
            >
              Months
            </button>
            <button
              className={`${styles.pill} ${granularity === 'year' ? styles.activePill : ''}`}
              onClick={() => setGranularity('year')}
            >
              Years
            </button>
          </div>

          <button
            className={styles.refreshButton}
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            title="Refresh statistics"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <section className={styles.cardsGrid}>
        {/* Total Time */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Total Practice Time</span>
            <div
              className={styles.cardIconWrapper}
              style={{ background: 'rgba(187, 134, 252, 0.15)', color: '#bb86fc' }}
            >
              <Clock size={20} />
            </div>
          </div>
          <div className={styles.cardValue}>{formatSeconds(overallStats.totalSeconds)}</div>
          <div className={styles.cardSubtext}>
            {overallStats.totalSeconds > 0
              ? `${Math.round(overallStats.totalSeconds / 60)} minutes recorded`
              : 'Start practicing to track time'}
          </div>
        </div>

        {/* Total Plays */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Total Sessions</span>
            <div
              className={styles.cardIconWrapper}
              style={{ background: 'rgba(3, 218, 198, 0.15)', color: '#03dac6' }}
            >
              <PlayCircle size={20} />
            </div>
          </div>
          <div className={styles.cardValue}>{overallStats.totalPlays}</div>
          <div className={styles.cardSubtext}>
            Across {overallStats.uniqueSongsCount}{' '}
            {overallStats.uniqueSongsCount === 1 ? 'song' : 'different songs'}
          </div>
        </div>

        {/* Average Session Length */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Avg. Session Length</span>
            <div
              className={styles.cardIconWrapper}
              style={{ background: 'rgba(255, 117, 151, 0.15)', color: '#ff7597' }}
            >
              <Timer size={20} />
            </div>
          </div>
          <div className={styles.cardValue}>{formatSeconds(overallStats.avgSessionSeconds)}</div>
          <div className={styles.cardSubtext}>Per practice session</div>
        </div>

        {/* Practice Streak */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Practice Streak</span>
            <div
              className={styles.cardIconWrapper}
              style={{ background: 'rgba(255, 152, 0, 0.15)', color: '#ff9800' }}
            >
              <Flame size={20} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {overallStats.currentStreakDays}{' '}
            <span style={{ fontSize: '1rem', fontWeight: 500, color: '#888' }}>
              {overallStats.currentStreakDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className={styles.cardSubtext}>
            Best streak: {overallStats.longestStreakDays}{' '}
            {overallStats.longestStreakDays === 1 ? 'day' : 'days'}
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <section className={styles.chartsGrid}>
        {/* Chart 1: Practice Time */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.chartTitle}>
                <Clock size={18} color="#bb86fc" /> Practice Time
              </h2>
              <p className={styles.chartSubtitle}>Total minutes played per {granularity}</p>
            </div>
          </div>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22222d" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#555566"
                  tick={{ fill: '#888899', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#22222d' }}
                />
                <YAxis
                  stroke="#555566"
                  tick={{ fill: '#888899', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#22222d' }}
                  tickFormatter={(val) => (val >= 60 ? `${Math.round(val / 60)}h` : `${val}m`)}
                />
                <Tooltip
                  content={
                    <CustomChartTooltip
                      valueFormatter={(_val, item) => formatSeconds(item.totalSeconds)}
                    />
                  }
                  cursor={{ fill: 'rgba(187, 134, 252, 0.08)' }}
                />
                <Bar dataKey="totalMinutes" fill="#bb86fc" radius={[5, 5, 0, 0]} maxBarSize={45}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.totalMinutes > 0 ? '#bb86fc' : '#282836'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Play Count */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.chartTitle}>
                <PlayCircle size={18} color="#03dac6" /> Play Count
              </h2>
              <p className={styles.chartSubtitle}>Number of sessions per {granularity}</p>
            </div>
          </div>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22222d" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#555566"
                  tick={{ fill: '#888899', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#22222d' }}
                />
                <YAxis
                  stroke="#555566"
                  tick={{ fill: '#888899', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#22222d' }}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomChartTooltip unitLabel="plays" />}
                  cursor={{ fill: 'rgba(3, 218, 198, 0.08)' }}
                />
                <Bar dataKey="playCount" fill="#03dac6" radius={[5, 5, 0, 0]} maxBarSize={45}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-play-${index}`}
                      fill={entry.playCount > 0 ? '#03dac6' : '#282836'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Leaderboard Section */}
      {hasSessions ? (
        <section className={styles.leaderboardCard}>
          <div className={styles.leaderboardHeader}>
            <h2 className={styles.chartTitle}>
              <TrendingUp size={18} color="#bb86fc" /> Most Played Tabs
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#78788a' }}>Top 10 Leaderboard</span>
          </div>
          <div className={styles.leaderboardList}>
            {leaderboard.map((item, idx) => {
              const rankClass =
                idx === 0
                  ? styles.rankGold
                  : idx === 1
                    ? styles.rankSilver
                    : idx === 2
                      ? styles.rankBronze
                      : styles.rankDefault

              return (
                <div key={item.fid || idx} className={styles.leaderboardItem}>
                  <div className={styles.leaderboardLeft}>
                    <div className={`${styles.rankBadge} ${rankClass}`}>#{idx + 1}</div>
                    <div className={styles.songInfo}>
                      <div className={styles.songName} title={item.name}>
                        {item.name}
                      </div>
                      <div className={styles.songMeta}>
                        Last played:{' '}
                        {item.lastPlayed
                          ? new Date(item.lastPlayed).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : 'Recently'}
                      </div>
                    </div>
                  </div>

                  <div className={styles.leaderboardRight}>
                    <div className={styles.statBadge}>
                      <span className={styles.statBadgeVal}>{item.playCount}x</span>
                      <span className={styles.statBadgeLabel}>Plays</span>
                    </div>
                    <div className={styles.statBadge}>
                      <span className={styles.statBadgeVal} style={{ color: '#03dac6' }}>
                        {formatSeconds(item.totalSeconds)}
                      </span>
                      <span className={styles.statBadgeLabel}>Time</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Music size={32} />
          </div>
          <h3 className={styles.emptyTitle}>No Playing Statistics Yet</h3>
          <p className={styles.emptyDesc}>
            Open any tab in the PDF viewer or Guitar Pro viewer to start recording your practice
            sessions. Your statistics and charts will automatically populate here!
          </p>
        </div>
      )}
    </div>
  )
}
