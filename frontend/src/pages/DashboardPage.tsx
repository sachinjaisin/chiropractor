import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Loader2,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Phone,
  Mail,
  Home,
  Coins,
  RefreshCw,
  Bell,
  Award,
  TrendingUp,
  Activity,
} from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import DashboardShell from '@/components/DashboardShell'

// ─── Types ───────────────────────────────────────────────────────────────────

type UrgencyLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

type ReferralStatus =
  | 'OPEN'
  | 'CLAIMED'
  | 'PATIENT_CONTACTED'
  | 'APPOINTMENT_BOOKED'
  | 'TREATMENT_IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'

interface AvailableReferral {
  id: string
  referral_number: string
  status: string
  primary_complaint: string
  symptoms: string | null
  duration_of_problem: string | null
  urgency_level: UrgencyLevel
  preferred_contact: string | null
  additional_notes: string | null
  city: string
  state: string
  zip_code: string
  distance_km: number | null
  priority_score: number
  published_at: string | null
  expires_at: string | null
  created_at: string
  viewed_at: string | null
  patient_problems: string[]
}

interface PatientInfo {
  first_name: string
  last_name: string
  phone: string
  email: string
  street_address: string
  city: string
  state: string
  zip_code: string
}

interface ClaimedReferral extends AvailableReferral {
  referral_id: string
  claimed_at: string
  token_balance: number
  patient: PatientInfo
}

interface WalletData {
  balance: number
  total_used: number
}

interface QualityScore {
  composite_score: number
  claim_rate: number
  completion_rate: number
  avg_response_time_s: number | null
  avg_patient_rating: number | null
  score_date: string
}

interface PerformanceData {
  quality_score: QualityScore | null
  stats: {
    total: number
    claimed: number
    completed: number
  }
}

interface StatusHistoryItem {
  old_status: string
  new_status: string
  changed_by: string
  notes: string | null
  changed_at: string
}

interface NoteItem {
  id: string
  author_id: string
  note_text: string
  is_internal: boolean
  created_at: string
  author_name: string
}

interface ActivityLogItem {
  event_type: string
  actor_id: string
  metadata: any
  occurred_at: string
}

interface TimelineData {
  status_history: StatusHistoryItem[]
  notes: NoteItem[]
  activity_logs: ActivityLogItem[]
}

interface Notification {
  id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const parsed = new Date(dateStr).getTime()
  if (isNaN(parsed)) return ''
  const diffMs = Date.now() - parsed
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function expiresCountdown(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null
  const parsed = new Date(expiresAt).getTime()
  if (isNaN(parsed)) return null
  const diffMs = parsed - Date.now()
  if (diffMs <= 0) return 'Expired'
  if (diffMs > 24 * 60 * 60 * 1000) return null
  const diffHr = Math.floor(diffMs / (60 * 60 * 1000))
  const diffMin = Math.floor((diffMs % (60 * 60 * 1000)) / 60000)
  if (diffHr > 0) return `Expires in ${diffHr}h ${diffMin}m`
  return `Expires in ${diffMin}m`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatResponseTime(seconds: number | null | undefined): string {
  if (seconds == null) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

const URGENCY_CLASSES: Record<UrgencyLevel, string> = {
  LOW: 'bg-secondary-subtle text-secondary',
  NORMAL: 'bg-primary-subtle text-primary',
  HIGH: 'bg-warning-subtle text-warning',
  URGENT: 'bg-danger-subtle text-danger',
}

const STATUS_CLASSES: Record<string, string> = {
  CLAIMED: 'bg-primary-subtle text-primary',
  PATIENT_CONTACTED: 'bg-info-subtle text-info',
  APPOINTMENT_BOOKED: 'bg-warning-subtle text-warning',
  TREATMENT_IN_PROGRESS: 'bg-danger-subtle text-danger',
  COMPLETED: 'bg-success-subtle text-success',
  CLOSED: 'bg-secondary-subtle text-secondary',
}

const STATUS_STEPS: ReferralStatus[] = [
  'CLAIMED',
  'PATIENT_CONTACTED',
  'APPOINTMENT_BOOKED',
  'TREATMENT_IN_PROGRESS',
  'COMPLETED',
]

const NEXT_STATUS_LABEL: Partial<Record<ReferralStatus, string>> = {
  CLAIMED: 'Mark Patient Contacted',
  PATIENT_CONTACTED: 'Mark Appointment Booked',
  APPOINTMENT_BOOKED: 'Mark Treatment In Progress',
  TREATMENT_IN_PROGRESS: 'Mark Completed',
}

const NEXT_STATUS_VALUE: Partial<Record<ReferralStatus, ReferralStatus>> = {
  CLAIMED: 'PATIENT_CONTACTED',
  PATIENT_CONTACTED: 'APPOINTMENT_BOOKED',
  APPOINTMENT_BOOKED: 'TREATMENT_IN_PROGRESS',
  TREATMENT_IN_PROGRESS: 'COMPLETED',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, walletBalance, refreshWallet } = useAuth()
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get('section') || 'dashboard'

  const [activeTab, setActiveTab] = useState<'available' | 'claimed'>('available')
  const [availableReferrals, setAvailableReferrals] = useState<AvailableReferral[]>([])
  const [claimedReferrals, setClaimedReferrals] = useState<ClaimedReferral[]>([])
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(false)

  const [availableCursor, setAvailableCursor] = useState<string | null>(null)
  const [availableHasMore, setAvailableHasMore] = useState(false)
  const [claimedCursor, setClaimedCursor] = useState<string | null>(null)
  const [claimedHasMore, setClaimedHasMore] = useState(false)

  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false)
  const [isLoadingClaimed, setIsLoadingClaimed] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const [isClaimLoading, setIsClaimLoading] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const [isStatusUpdating, setIsStatusUpdating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [hasNewReferrals, setHasNewReferrals] = useState(false)

  // Notifications state
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [notifsFetched, setNotifsFetched] = useState(false)

  // Table search, entries page size, and pagination state
  const [availableSearch, setAvailableSearch] = useState('')
  const [availablePageSize, setAvailablePageSize] = useState(10)
  const [availableCurrentPage, setAvailableCurrentPage] = useState(1)
  const [availableSortField, setAvailableSortField] = useState<'referral_number' | 'location' | 'distance' | 'primary_complaint' | 'date'>('referral_number')
  const [availableSortAsc, setAvailableSortAsc] = useState(true)

  const [claimedSearch, setClaimedSearch] = useState('')
  const [claimedPageSize, setClaimedPageSize] = useState(10)
  const [claimedCurrentPage, setClaimedCurrentPage] = useState(1)
  const [claimedSortField, setClaimedSortField] = useState<'referral_number' | 'patient_name' | 'location' | 'primary_complaint' | 'status' | 'date'>('referral_number')
  const [claimedSortAsc, setClaimedSortAsc] = useState(true)

  // Reset page when search or page size changes
  useEffect(() => {
    setAvailableCurrentPage(1)
  }, [availableSearch, availablePageSize])

  useEffect(() => {
    setClaimedCurrentPage(1)
  }, [claimedSearch, claimedPageSize])

  // Helper for Available sorting/filtering/pagination
  const filteredAvailable = availableReferrals.filter((ref) => {
    const term = availableSearch.toLowerCase()
    if (!term) return true
    const locationStr = `${ref.city}, ${ref.state}`.toLowerCase()
    const complaintStr = (ref.primary_complaint || '').toLowerCase()
    const distStr = ref.distance_km != null ? `${ref.distance_km.toFixed(1)} km`.toLowerCase() : 'n/a'
    const dateStr = formatDate(ref.published_at || ref.created_at).toLowerCase()
    return (
      ref.referral_number.toLowerCase().includes(term) ||
      locationStr.includes(term) ||
      complaintStr.includes(term) ||
      distStr.includes(term) ||
      dateStr.includes(term)
    )
  })

  const sortedAvailable = [...filteredAvailable].sort((a, b) => {
    let valA: any = ''
    let valB: any = ''
    if (availableSortField === 'referral_number') {
      valA = a.referral_number
      valB = b.referral_number
    } else if (availableSortField === 'location') {
      valA = `${a.city}, ${a.state}`
      valB = `${b.city}, ${b.state}`
    } else if (availableSortField === 'distance') {
      valA = a.distance_km ?? 0
      valB = b.distance_km ?? 0
    } else if (availableSortField === 'primary_complaint') {
      valA = a.primary_complaint
      valB = b.primary_complaint
    } else if (availableSortField === 'date') {
      valA = new Date(a.published_at || a.created_at).getTime()
      valB = new Date(b.published_at || b.created_at).getTime()
    }

    if (valA < valB) return availableSortAsc ? -1 : 1
    if (valA > valB) return availableSortAsc ? 1 : -1
    return 0
  })

  const totalAvailableCount = sortedAvailable.length
  const totalAvailablePages = Math.ceil(totalAvailableCount / availablePageSize)
  const availableStartIndex = (availableCurrentPage - 1) * availablePageSize
  const paginatedAvailable = sortedAvailable.slice(availableStartIndex, availableStartIndex + availablePageSize)

  // Helper for Claimed sorting/filtering/pagination
  const filteredClaimed = claimedReferrals.filter((ref) => {
    const term = claimedSearch.toLowerCase()
    if (!term) return true
    const patientName = `${ref.patient?.first_name || ''} ${ref.patient?.last_name || ''}`.toLowerCase()
    const locationStr = `${ref.patient?.city || ''}, ${ref.patient?.state || ''}`.toLowerCase()
    const complaintStr = (ref.primary_complaint || '').toLowerCase()
    const statusStr = (ref.status || '').toLowerCase()
    const dateStr = formatDate(ref.claimed_at).toLowerCase()
    return (
      ref.referral_number.toLowerCase().includes(term) ||
      patientName.includes(term) ||
      locationStr.includes(term) ||
      complaintStr.includes(term) ||
      statusStr.includes(term) ||
      dateStr.includes(term)
    )
  })

  const sortedClaimed = [...filteredClaimed].sort((a, b) => {
    let valA: any = ''
    let valB: any = ''
    if (claimedSortField === 'referral_number') {
      valA = a.referral_number
      valB = b.referral_number
    } else if (claimedSortField === 'patient_name') {
      valA = `${a.patient?.first_name || ''} ${a.patient?.last_name || ''}`.toLowerCase()
      valB = `${b.patient?.first_name || ''} ${b.patient?.last_name || ''}`.toLowerCase()
    } else if (claimedSortField === 'location') {
      valA = `${a.patient?.city || ''}, ${a.patient?.state || ''}`.toLowerCase()
      valB = `${b.patient?.city || ''}, ${b.patient?.state || ''}`.toLowerCase()
    } else if (claimedSortField === 'primary_complaint') {
      valA = a.primary_complaint
      valB = b.primary_complaint
    } else if (claimedSortField === 'status') {
      valA = a.status
      valB = b.status
    } else if (claimedSortField === 'date') {
      valA = new Date(a.claimed_at).getTime()
      valB = new Date(b.claimed_at).getTime()
    }

    if (valA < valB) return claimedSortAsc ? -1 : 1
    if (valA > valB) return claimedSortAsc ? 1 : -1
    return 0
  })

  const totalClaimedCount = sortedClaimed.length
  const totalClaimedPages = Math.ceil(totalClaimedCount / claimedPageSize)
  const claimedStartIndex = (claimedCurrentPage - 1) * claimedPageSize
  const paginatedClaimed = sortedClaimed.slice(claimedStartIndex, claimedStartIndex + claimedPageSize)

  // Sorting handlers
  const handleSort = (field: string) => {
    if (activeTab === 'available') {
      const isAsc = availableSortField === field ? !availableSortAsc : true
      setAvailableSortField(field as any)
      setAvailableSortAsc(isAsc)
      setAvailableCurrentPage(1)
    } else {
      const isAsc = claimedSortField === field ? !claimedSortAsc : true
      setClaimedSortField(field as any)
      setClaimedSortAsc(isAsc)
      setClaimedCurrentPage(1)
    }
  }

  const renderSortIndicator = (field: string) => {
    const isCurrent = activeTab === 'available' ? availableSortField === field : claimedSortField === field
    const isAsc = activeTab === 'available' ? availableSortAsc : claimedSortAsc
    
    if (!isCurrent) {
      return <span style={{ fontSize: '10px', opacity: 0.3, marginLeft: '6px' }}>⇅</span>
    }
    return isAsc ? (
      <span className="text-primary" style={{ fontSize: '10px', marginLeft: '6px' }}>▲</span>
    ) : (
      <span className="text-primary" style={{ fontSize: '10px', marginLeft: '6px' }}>▼</span>
    )
  }

  // Referral Modal State
  const [selectedReferral, setSelectedReferral] = useState<AvailableReferral | ClaimedReferral | null>(null)
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)
  const [modalTab, setModalTab] = useState<'notes' | 'timeline'>('notes')
  const [noteText, setNoteText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)

  // Track known available IDs to detect new arrivals
  const knownAvailableIds = useRef<Set<string>>(new Set())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch performance ─────────────────────────────────────────────────────

  const fetchPerformance = useCallback(async () => {
    setIsLoadingPerformance(true)
    try {
      const { data } = await api.get<PerformanceData>('/practitioners/me/performance')
      setPerformance(data)
    } catch {
      // non-critical
    } finally {
      setIsLoadingPerformance(false)
    }
  }, [])

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotifsLoading(true)
    try {
      const { data } = await api.get<{ data: Notification[] }>('/practitioners/me/notifications?limit=50')
      setNotifs(data.data ?? [])
      setNotifsFetched(true)
    } catch {
      // non-critical
    } finally {
      if (!silent) setNotifsLoading(false)
    }
  }, [])

  // ── Fetch wallet ──────────────────────────────────────────────────────────

  const fetchWallet = useCallback(async () => {
    await refreshWallet()
  }, [refreshWallet])

  // ── Fetch available referrals ─────────────────────────────────────────────

  const fetchAvailable = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingAvailable(true)
    try {
      const { data } = await api.get<{ data: AvailableReferral[]; pagination: { cursor: string | null; has_next: boolean } }>(
        '/referrals/available?limit=20',
      )
      const items: AvailableReferral[] = data.data ?? []

      // Detect new referrals for notification dot
      const newIds = items.filter((r) => !knownAvailableIds.current.has(r.id))
      if (newIds.length > 0 && knownAvailableIds.current.size > 0) {
        setHasNewReferrals(true)
      }
      items.forEach((r) => knownAvailableIds.current.add(r.id))

      setAvailableReferrals(items)
      setAvailableCursor(data.pagination?.cursor ?? null)
      setAvailableHasMore(!!data.pagination?.cursor)
    } catch (err) {
      if (!silent) toast.error(getApiError(err))
    } finally {
      if (!silent) setIsLoadingAvailable(false)
    }
  }, [])

  // ── Load more available ───────────────────────────────────────────────────

  const loadMoreAvailable = useCallback(async () => {
    if (!availableCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { data } = await api.get<{ data: AvailableReferral[]; pagination: { cursor: string | null; has_next: boolean } }>(
        `/referrals/available?limit=20&cursor=${availableCursor}`,
      )
      const items: AvailableReferral[] = data.data ?? []
      items.forEach((r) => knownAvailableIds.current.add(r.id))
      setAvailableReferrals((prev) => [...prev, ...items])
      setAvailableCursor(data.pagination?.cursor ?? null)
      setAvailableHasMore(!!data.pagination?.cursor)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoadingMore(false)
    }
  }, [availableCursor, isLoadingMore])

  // ── Fetch claimed referrals ───────────────────────────────────────────────

  const fetchClaimed = useCallback(async () => {
    setIsLoadingClaimed(true)
    try {
      const { data } = await api.get<{ data: ClaimedReferral[]; pagination: { cursor: string | null; has_next: boolean } }>(
        '/referrals/claimed?limit=20',
      )
      const items: ClaimedReferral[] = data.data ?? []
      setClaimedReferrals(items)
      setClaimedCursor(data.pagination?.cursor ?? null)
      setClaimedHasMore(!!data.pagination?.cursor)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoadingClaimed(false)
    }
  }, [])

  // ── Load more claimed ─────────────────────────────────────────────────────

  const loadMoreClaimed = useCallback(async () => {
    if (!claimedCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { data } = await api.get<{ data: ClaimedReferral[]; pagination: { cursor: string | null; has_next: boolean } }>(
        `/referrals/claimed?limit=20&cursor=${claimedCursor}`,
      )
      const items: ClaimedReferral[] = data.data ?? []
      setClaimedReferrals((prev) => [...prev, ...items])
      setClaimedCursor(data.pagination?.cursor ?? null)
      setClaimedHasMore(!!data.pagination?.cursor)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoadingMore(false)
    }
  }, [claimedCursor, isLoadingMore])

  // ── Fetch timeline for modal details ──────────────────────────────────────

  const fetchTimeline = useCallback(async (referralId: string) => {
    setIsLoadingTimeline(true)
    try {
      const { data } = await api.get<TimelineData>(`/referrals/claimed/${referralId}/timeline`)
      setTimeline(data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoadingTimeline(false)
    }
  }, [])

  // ── Claim referral ────────────────────────────────────────────────────────

  const claimReferral = useCallback(
    async (id: string, retry = false) => {
      if (walletBalance === 0) {
        toast.error('Insufficient Care Tokens balance. Please purchase more Care Tokens.')
        return
      }
      setIsClaimLoading(true)
      setClaimingId(id)
      const idempotencyKey = crypto.randomUUID()
      try {
        await api.post(
          `/referrals/available/${id}/claim`,
          {},
          { headers: { 'Idempotency-Key': idempotencyKey } },
        )
        toast.success('Referral claimed! Patient details unlocked.')
        // Close modal if open
        setSelectedReferral(null)
        // Remove from available list
        setAvailableReferrals((prev) => prev.filter((r) => r.id !== id))
        knownAvailableIds.current.delete(id)
        // Refresh claimed list, wallet, and performance metrics
        await Promise.all([fetchClaimed(), fetchWallet(), fetchPerformance()])
        // Switch to claimed tab
        setActiveTab('claimed')
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } }
        if (axiosErr?.response?.status === 423 && !retry) {
          toast.info('Another claim in progress, retrying...')
          setTimeout(() => claimReferral(id, true), 1200)
          return
        } else {
          toast.error(getApiError(err))
        }
      } finally {
        setIsClaimLoading(false)
        setClaimingId(null)
      }
    },
    [walletBalance, fetchClaimed, fetchWallet, fetchPerformance],
  )

  // ── Status update ─────────────────────────────────────────────────────────

  const updateStatus = useCallback(async (referralId: string, newStatus: ReferralStatus) => {
    setIsStatusUpdating(true)
    setUpdatingId(referralId)
    try {
      await api.patch(`/referrals/claimed/${referralId}/status`, { status: newStatus })
      
      // Update local state
      setClaimedReferrals((prev) =>
        prev.map((r) => (r.referral_id === referralId ? { ...r, status: newStatus } : r)),
      )
      
      // Update modal copy if open
      setSelectedReferral((prev) => {
        if (prev && 'referral_id' in prev && prev.referral_id === referralId) {
          return { ...prev, status: newStatus }
        }
        return prev
      })

      await Promise.all([fetchPerformance(), fetchTimeline(referralId)])
      toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsStatusUpdating(false)
      setUpdatingId(null)
    }
  }, [fetchPerformance, fetchTimeline])

  // ── Add progress note ─────────────────────────────────────────────────────

  const handleAddNote = async (e: React.FormEvent, referralId: string) => {
    e.preventDefault()
    if (!noteText.trim()) return
    setIsSubmittingNote(true)
    try {
      await api.post(`/referrals/claimed/${referralId}/notes`, {
        note_text: noteText,
        is_internal: isInternal,
      })
      toast.success('Note added successfully')
      setNoteText('')
      setIsInternal(false)
      await fetchTimeline(referralId)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsSubmittingNote(false)
    }
  }

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchWallet()
    fetchAvailable()
    fetchClaimed()
    fetchPerformance()
    fetchNotifications()
  }, [fetchWallet, fetchAvailable, fetchClaimed, fetchPerformance, fetchNotifications])

  // ── 30-second polling ─────────────────────────────────────────────────────

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchAvailable(true)
      fetchWallet()
      fetchNotifications(true)
    }, 30_000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [fetchAvailable, fetchWallet, fetchNotifications])

  // Clear notification dot when user visits available tab
  useEffect(() => {
    if (activeTab === 'available') {
      setHasNewReferrals(false)
    }
  }, [activeTab])

  // ── Notifications Tab ─────────────────────────────────────────────────────

  useEffect(() => {
    if (activeSection === 'notifications' && !notifsFetched) {
      fetchNotifications()
    }
  }, [activeSection, notifsFetched, fetchNotifications])

  const markNotifRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/practitioners/me/notifications/${id}/read`)
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch {
      // non-critical
    }
  }, [])

  const markAllNotifsRead = useCallback(async () => {
    try {
      await api.patch('/practitioners/me/notifications/read-all')
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      // non-critical
    }
  }, [])

  // ── Modal view trigger ────────────────────────────────────────────────────

  const handleOpenDetails = (ref: AvailableReferral | ClaimedReferral) => {
    setSelectedReferral(ref)
    setTimeline(null)
    setNoteText('')
    setIsInternal(false)
    setModalTab('notes')
    
    // Check if it's a claimed referral to load timeline/notes
    if ('referral_id' in ref) {
      fetchTimeline(ref.referral_id)
    }
  }

  // ── Timeline merger ───────────────────────────────────────────────────────

  const getMergedTimeline = () => {
    if (!timeline) return []
    const items: { date: string; type: string; title: string; desc?: string | null }[] = []

    const statusHistory = timeline.status_history || []
    statusHistory.forEach((sh) => {
      if (!sh) return
      const oldStatusLabel = sh.old_status ? sh.old_status.replace(/_/g, ' ') : 'Initial'
      const newStatusLabel = sh.new_status ? sh.new_status.replace(/_/g, ' ') : 'Unknown'
      items.push({
        date: sh.changed_at || new Date().toISOString(),
        type: 'status',
        title: `Status: ${oldStatusLabel} → ${newStatusLabel}`,
        desc: sh.notes ? `Note: ${sh.notes}` : null,
      })
    })

    const activityLogs = timeline.activity_logs || []
    activityLogs.forEach((al) => {
      if (!al || !al.event_type) return
      let title = al.event_type.replace(/_/g, ' ')
      title = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase()

      let desc = null
      if (al.metadata) {
        try {
          const meta = typeof al.metadata === 'string' ? JSON.parse(al.metadata) : al.metadata
          if (meta && typeof meta === 'object') {
            if (meta.notes) {
              desc = meta.notes
            } else if (meta.response_time_sec != null) {
              desc = `Response Time: ${meta.response_time_sec}s`
            }
          }
        } catch {
          // ignore
        }
      }

      const isStatusTransitionLog = [
        'CLAIMED',
        'PATIENT_CONTACTED',
        'APPOINTMENT_BOOKED',
        'TREATMENT_IN_PROGRESS',
        'COMPLETED',
        'CLOSED',
      ].includes(al.event_type)
      if (isStatusTransitionLog) {
        title = `Status updated to ${al.event_type.replace(/_/g, ' ')}`
      }

      items.push({
        date: al.occurred_at || new Date().toISOString(),
        type: 'activity',
        title,
        desc,
      })
    })

    return items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }

  const unreadCount = notifs.filter((n) => !n.is_read).length

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      {activeSection === 'dashboard' && (
        <>
          {/* Page Title Row */}
          <div className="row toprow pt-4">
            <div className="col-md-6">
              <div className="page-title">
                <h1>Practitioner Dashboard</h1>
                <p>Overview of your export partnerships.</p>
              </div>
            </div>
            <div className="col-md-6 text-end">
              <button
                onClick={() => (activeTab === 'available' ? fetchAvailable() : fetchClaimed())}
                disabled={isLoadingAvailable || isLoadingClaimed}
                className="btn btn-info"
                style={{ padding: '8px 16px', fontSize: '14px' }}
              >
                <RefreshCw className={`w-4 h-4 d-inline-block align-middle me-1 ${isLoadingAvailable || isLoadingClaimed ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Performance Widgets Row */}
          <div className="row">
            <div className="col-md-12">
              <ul className="dashboardcard-list">
                <li>
                  <div className="dashboard-card dashboard-card1">
                    <div className="dashboard-card-icon">
                      <img src="/assets/images/dashboard-card1.svg" className="img-fluid" alt="" />
                    </div>
                    <h4>Available Referrals</h4>
                    <h3>{availableReferrals.length}</h3>
                    <p className="dashboard-success">NEW REFERRALS</p>
                  </div>
                </li>
                <li>
                  <div className="dashboard-card dashboard-card2">
                    <div className="dashboard-card-icon">
                      <img src="/assets/images/dashboard-card2.svg" className="img-fluid" alt="" />
                    </div>
                    <h4>Claimed Referrals</h4>
                    <h3>{claimedReferrals.length}</h3>
                    <p>ACTIVE CASES</p>
                  </div>
                </li>
                <li>
                  <div className="dashboard-card dashboard-card3">
                    <div className="dashboard-card-icon">
                      <img src="/assets/images/dashboard-card3.svg" className="img-fluid" alt="" />
                    </div>
                    <h4>Notifications</h4>
                    <h3>{unreadCount}</h3>
                    <p>UNREAD MESSAGES</p>
                  </div>
                </li>
                <li>
                  <div className="dashboard-card dashboard-card4">
                    <div className="dashboard-card-icon">
                      <img src="/assets/images/dashboard-card4.svg" className="img-fluid" alt="" />
                    </div>
                    <h4>Performance Summary</h4>
                    <h3>
                      {performance?.quality_score?.composite_score != null
                        ? `${performance.quality_score.composite_score.toFixed(0)}%`
                        : '85%'}
                    </h3>
                    <p>SCORE</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Available / Claimed Referral Tabs Layout */}
          <div className="row">
            <div className="col-md-12">
              <div className="carddesign">
                {/* Custom Tab Header */}
                <div className="cardheading align-items-center">
                  <div className="d-flex gap-2">
                    <button
                      onClick={() => setActiveTab('available')}
                      className={`btn pb-2 px-3 fw-semibold shadow-none border-0 ${
                        activeTab === 'available' ? 'text-primary border-bottom border-primary border-2' : 'text-secondary'
                      }`}
                      style={{ borderRadius: 0, fontSize: '16px' }}
                    >
                      Available Referrals ({availableReferrals.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('claimed')}
                      className={`btn pb-2 px-3 fw-semibold shadow-none border-0 ${
                        activeTab === 'claimed' ? 'text-primary border-bottom border-primary border-2' : 'text-secondary'
                      }`}
                      style={{ borderRadius: 0, fontSize: '16px' }}
                    >
                      My Claimed Referrals ({claimedReferrals.length})
                    </button>
                  </div>
                </div>

                <div className="cardbody">
                  {/* AVAILABLE REFERRALS TAB CONTENT */}
                  {activeTab === 'available' && (
                    <div className="tabledesign filterno whitebg">
                      {isLoadingAvailable && availableReferrals.length === 0 ? (
                        <div className="text-center py-5">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                          <p className="mt-2 text-secondary">Loading available referrals...</p>
                        </div>
                      ) : availableReferrals.length === 0 ? (
                        <div className="text-center py-5 text-secondary">
                          <MapPin className="w-12 h-12 text-secondary-50 opacity-50 mx-auto mb-3" />
                          <h5 className="fw-semibold">No Referrals Available</h5>
                          <p className="text-sm">Check back later or expand your practice coverage radius.</p>
                        </div>
                      ) : (
                        <>
                          {/* DataTables Header Layout */}
                          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div className="dataTables_length">
                              <label className="d-flex align-items-center gap-2">
                                Show
                                <select
                                  value={availablePageSize}
                                  onChange={(e) => setAvailablePageSize(Number(e.target.value))}
                                  className="form-select form-select-sm"
                                  style={{ width: 'auto', display: 'inline-block' }}
                                >
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                                entries
                              </label>
                            </div>
                            <div className="dataTables_filter">
                              <label className="d-flex align-items-center gap-2">
                                Search:
                                <input
                                  type="search"
                                  value={availableSearch}
                                  onChange={(e) => setAvailableSearch(e.target.value)}
                                  className="form-control form-control-sm"
                                  style={{ display: 'inline-block' }}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="table-responsive">
                            <table className="table table-hover align-middle m-0">
                              <thead>
                                <tr>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('referral_number')}>
                                    Referral Number {renderSortIndicator('referral_number')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('location')}>
                                    Location {renderSortIndicator('location')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('distance')}>
                                    Distance {renderSortIndicator('distance')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('primary_complaint')}>
                                    Referral Type {renderSortIndicator('primary_complaint')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                                    Date Submitted {renderSortIndicator('date')}
                                  </th>
                                  <th className="text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedAvailable.map((ref) => (
                                  <tr key={ref.id}>
                                    <td className="fw-semibold text-primary">{ref.referral_number}</td>
                                    <td>
                                      {ref.city}, {ref.state}
                                    </td>
                                    <td>{ref.distance_km != null ? `${ref.distance_km.toFixed(1)} km` : 'N/A'}</td>
                                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ref.primary_complaint}
                                    </td>
                                    <td>{formatDate(ref.published_at || ref.created_at)}</td>
                                    <td className="text-center">
                                      <div className="tdaction">
                                        <button
                                          type="button"
                                          className="bg-transparent border-0 p-1 me-2"
                                          title="View Details"
                                          onClick={() => handleOpenDetails(ref)}
                                        >
                                          <img src="/assets/images/tdeye.svg" className="img-fluid" alt="View" />
                                        </button>
                                        <button
                                          type="button"
                                          className="bg-transparent border-0 p-1"
                                          title="Claim Referral"
                                          disabled={isClaimLoading}
                                          onClick={() => claimReferral(ref.id)}
                                        >
                                          {claimingId === ref.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-success" />
                                          ) : (
                                            <img src="/assets/images/tdreferral.svg" className="img-fluid" alt="Claim" />
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* DataTables Pagination & Info Footer */}
                          <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                            <div className="dataTables_info">
                              Showing {totalAvailableCount === 0 ? 0 : availableStartIndex + 1} to {Math.min(availableStartIndex + availablePageSize, totalAvailableCount)} of {totalAvailableCount} entries
                              {availableHasMore && (
                                <button
                                  onClick={loadMoreAvailable}
                                  disabled={isLoadingMore}
                                  className="btn btn-link btn-sm text-primary ms-3 p-0 border-0 align-baseline"
                                  style={{ fontSize: '13px' }}
                                >
                                  {isLoadingMore ? 'Loading older cases...' : 'Load more from server'}
                                </button>
                              )}
                            </div>
                            {totalAvailablePages > 1 && (
                              <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                                <button
                                  disabled={availableCurrentPage === 1}
                                  onClick={() => setAvailableCurrentPage(availableCurrentPage - 1)}
                                  className="paginate_button previous bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: availableCurrentPage === 1 ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: availableCurrentPage === 1 ? 0.5 : 1,
                                    fontSize: '13px',
                                    background: 'transparent'
                                  }}
                                >
                                  Previous
                                </button>
                                <span>
                                  {Array.from({ length: totalAvailablePages }, (_, i) => i + 1).map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => setAvailableCurrentPage(p)}
                                      className={`paginate_button ${availableCurrentPage === p ? 'current text-white' : 'bg-transparent'}`}
                                      style={{
                                        cursor: 'pointer',
                                        margin: '0 4px',
                                        border: availableCurrentPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                        borderRadius: '5px',
                                        backgroundColor: availableCurrentPage === p ? '#0068b9' : 'transparent',
                                        color: availableCurrentPage === p ? '#fff' : '#000',
                                        padding: '4px 10px',
                                        fontSize: '13px'
                                      }}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </span>
                                <button
                                  disabled={availableCurrentPage === totalAvailablePages}
                                  onClick={() => setAvailableCurrentPage(availableCurrentPage + 1)}
                                  className="paginate_button next bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: availableCurrentPage === totalAvailablePages ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: availableCurrentPage === totalAvailablePages ? 0.5 : 1,
                                    fontSize: '13px',
                                    background: 'transparent'
                                  }}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* CLAIMED REFERRALS TAB CONTENT */}
                  {activeTab === 'claimed' && (
                    <div className="tabledesign filterno whitebg">
                      {isLoadingClaimed && claimedReferrals.length === 0 ? (
                        <div className="text-center py-5">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                          <p className="mt-2 text-secondary">Loading claimed cases...</p>
                        </div>
                      ) : claimedReferrals.length === 0 ? (
                        <div className="text-center py-5 text-secondary">
                          <CheckCircle className="w-12 h-12 text-secondary-50 opacity-50 mx-auto mb-3" />
                          <h5 className="fw-semibold">No Claimed Referrals</h5>
                          <p className="text-sm">Claim available referrals from the Available tab to start treatment.</p>
                        </div>
                      ) : (
                        <>
                          {/* DataTables Header Layout */}
                          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div className="dataTables_length">
                              <label className="d-flex align-items-center gap-2">
                                Show
                                <select
                                  value={claimedPageSize}
                                  onChange={(e) => setClaimedPageSize(Number(e.target.value))}
                                  className="form-select form-select-sm"
                                  style={{ width: 'auto', display: 'inline-block' }}
                                >
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                                entries
                              </label>
                            </div>
                            <div className="dataTables_filter">
                              <label className="d-flex align-items-center gap-2">
                                Search:
                                <input
                                  type="search"
                                  value={claimedSearch}
                                  onChange={(e) => setClaimedSearch(e.target.value)}
                                  className="form-control form-control-sm"
                                  style={{ display: 'inline-block' }}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="table-responsive">
                            <table className="table table-hover align-middle m-0">
                              <thead>
                                <tr>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('referral_number')}>
                                    Referral Number {renderSortIndicator('referral_number')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('patient_name')}>
                                    Patient Name {renderSortIndicator('patient_name')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('location')}>
                                    Location {renderSortIndicator('location')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('primary_complaint')}>
                                    Complaint {renderSortIndicator('primary_complaint')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')}>
                                    Status {renderSortIndicator('status')}
                                  </th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                                    Date Claimed {renderSortIndicator('date')}
                                  </th>
                                  <th className="text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedClaimed.map((ref) => (
                                  <tr key={ref.referral_id}>
                                    <td className="fw-semibold text-primary">{ref.referral_number}</td>
                                    <td className="fw-semibold">
                                      {ref.patient.first_name} {ref.patient.last_name}
                                    </td>
                                    <td>
                                      {ref.patient.city}, {ref.patient.state}
                                    </td>
                                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ref.primary_complaint}
                                    </td>
                                    <td>
                                      <span className={`status-d ${STATUS_CLASSES[ref.status] || 'bg-light text-dark'}`}>
                                        {ref.status.replace(/_/g, ' ')}
                                      </span>
                                    </td>
                                    <td>{formatDate(ref.claimed_at)}</td>
                                    <td className="text-center">
                                      <div className="tdaction">
                                        <Link
                                          to={`/referrals/claimed/${ref.referral_id}`}
                                          className="p-1"
                                          title="View Details & Notes"
                                        >
                                          <img src="/assets/images/tdeye.svg" className="img-fluid" alt="View" />
                                        </Link>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* DataTables Pagination & Info Footer */}
                          <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                            <div className="dataTables_info">
                              Showing {totalClaimedCount === 0 ? 0 : claimedStartIndex + 1} to {Math.min(claimedStartIndex + claimedPageSize, totalClaimedCount)} of {totalClaimedCount} entries
                              {claimedHasMore && (
                                <button
                                  onClick={loadMoreClaimed}
                                  disabled={isLoadingMore}
                                  className="btn btn-link btn-sm text-primary ms-3 p-0 border-0 align-baseline"
                                  style={{ fontSize: '13px' }}
                                >
                                  {isLoadingMore ? 'Loading older cases...' : 'Load more from server'}
                                </button>
                              )}
                            </div>
                            {totalClaimedPages > 1 && (
                              <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                                <button
                                  disabled={claimedCurrentPage === 1}
                                  onClick={() => setClaimedCurrentPage(claimedCurrentPage - 1)}
                                  className="paginate_button previous bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: claimedCurrentPage === 1 ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: claimedCurrentPage === 1 ? 0.5 : 1,
                                    fontSize: '13px',
                                    background: 'transparent'
                                  }}
                                >
                                  Previous
                                </button>
                                <span>
                                  {Array.from({ length: totalClaimedPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => setClaimedCurrentPage(p)}
                                      className={`paginate_button ${claimedCurrentPage === p ? 'current text-white' : 'bg-transparent'}`}
                                      style={{
                                        cursor: 'pointer',
                                        margin: '0 4px',
                                        border: claimedCurrentPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                        borderRadius: '5px',
                                        backgroundColor: claimedCurrentPage === p ? '#0068b9' : 'transparent',
                                        color: claimedCurrentPage === p ? '#fff' : '#000',
                                        padding: '4px 10px',
                                        fontSize: '13px'
                                      }}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </span>
                                <button
                                  disabled={claimedCurrentPage === totalClaimedPages}
                                  onClick={() => setClaimedCurrentPage(claimedCurrentPage + 1)}
                                  className="paginate_button next bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: claimedCurrentPage === totalClaimedPages ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: claimedCurrentPage === totalClaimedPages ? 0.5 : 1,
                                    fontSize: '13px',
                                    background: 'transparent'
                                  }}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* NOTIFICATIONS TAB CONTENT */}
      {activeSection === 'notifications' && (
        <div className="row pt-4">
          <div className="col-md-8 offset-md-2">
            <div className="carddesign">
              <div className="cardheading align-items-center">
                <h2 className="m-0 font-bold" style={{ fontSize: '18px' }}>
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <button onClick={markAllNotifsRead} className="btn btn-link text-primary p-0 shadow-none border-0 text-sm fw-semibold">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="cardbody">
                {notifsLoading && (
                  <div className="text-center py-5">
                    <Loader2 className="w-7 h-7 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-secondary text-sm">Loading notifications...</p>
                  </div>
                )}
                {!notifsLoading && notifs.length === 0 && (
                  <div className="text-center py-5 text-secondary">
                    <Bell className="w-12 h-12 text-secondary-50 opacity-50 mx-auto mb-3" />
                    <p className="text-sm m-0">No notifications yet.</p>
                  </div>
                )}
                {!notifsLoading && notifs.length > 0 && (
                  <div className="space-y-3">
                    {notifs.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.is_read) markNotifRead(n.id)
                        }}
                        className={`p-3 rounded-3 border mb-2 cursor-pointer transition-colors ${
                          n.is_read ? 'bg-light border-light-subtle' : 'bg-white border-primary-subtle border-start border-4 border-start-primary'
                        }`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <h6 className="fw-bold mb-1 text-dark" style={{ fontSize: '14px' }}>
                            {n.title}
                          </h6>
                          <span className="text-secondary text-xs" style={{ fontSize: '11px' }}>
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="text-secondary m-0 text-sm" style={{ fontSize: '13px', lineHeight: '1.4' }}>
                          {n.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REFERRAL SPLIT DETAILS MODAL (referral-detail.html equivalent) */}
      {selectedReferral && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
          tabIndex={-1}
          onClick={() => setSelectedReferral(null)}
        >
          <div
            className="modal-dialog modal-xl modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0" style={{ borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
              {/* Header */}
              <div className="modal-header bg-white px-4 pt-4 pb-2 border-0 align-items-center justify-content-between">
                <h5 className="modal-title fw-bold" style={{ fontSize: '20px', color: '#1f244a' }}>
                  Referral Details: #{selectedReferral.referral_number}
                </h5>
                <button
                  type="button"
                  className="btn-close shadow-none"
                  style={{ width: '12px', height: '12px' }}
                  onClick={() => setSelectedReferral(null)}
                ></button>
              </div>

              {/* Body */}
              <div className="modal-body px-4 pb-4 pt-2">
                <div className="row">
                  {/* Left Column: Case Information */}
                  <div className="col-md-6 mb-3 mb-md-0">
                    <div className="carddesign h-100" style={{ marginBottom: 0 }}>
                      <div className="cardheading">
                        <h2 className="m-0" style={{ fontSize: '16px' }}>
                          Case Profile
                        </h2>
                      </div>
                      <div className="cardbody py-3">
                        <ul className="referral-info p-0 m-0">
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Status</strong>
                            <div className="referral-details">
                              <span
                                className={`status-d ${
                                  'referral_id' in selectedReferral
                                    ? STATUS_CLASSES[selectedReferral.status]
                                    : 'bg-primary-subtle text-primary'
                                }`}
                              >
                                {'referral_id' in selectedReferral ? selectedReferral.status.replace(/_/g, ' ') : 'Pending Claim'}
                              </span>
                            </div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Submit Date</strong>
                            <div className="referral-details">
                              {formatDate(selectedReferral.published_at || selectedReferral.created_at)}
                            </div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Service Radius</strong>
                            <div className="referral-details">{selectedReferral.distance_km != null ? `${selectedReferral.distance_km.toFixed(1)} km away` : 'N/A'}</div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Primary Complaint</strong>
                            <div className="referral-details">{selectedReferral.primary_complaint}</div>
                          </li>
                          {selectedReferral.symptoms && (
                            <li className="d-flex justify-content-between mb-2">
                              <strong>Symptoms</strong>
                              <div className="referral-details">{selectedReferral.symptoms}</div>
                            </li>
                          )}
                          {selectedReferral.duration_of_problem && (
                            <li className="d-flex justify-content-between mb-2">
                              <strong>Duration</strong>
                              <div className="referral-details">{selectedReferral.duration_of_problem}</div>
                            </li>
                          )}
                          {selectedReferral.patient_problems && selectedReferral.patient_problems.length > 0 && (
                            <li className="mb-2">
                              <strong className="d-block mb-1">Diagnosed Issues</strong>
                              <div className="d-flex flex-wrap gap-1 mt-1">
                                {selectedReferral.patient_problems.map((p) => (
                                  <span key={p} className="badge bg-light text-primary border border-primary-subtle px-2 py-1 text-xs">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </li>
                          )}
                        </ul>

                        {/* Unlocked Patient Information (Claimed State Only) */}
                        {'referral_id' in selectedReferral ? (
                          <div className="mt-4 p-3 bg-light rounded-3 border border-light-subtle">
                            <h6 className="fw-bold mb-2 text-dark" style={{ fontSize: '14px' }}>
                              Patient Contact Details
                            </h6>
                            <div className="space-y-2 text-sm text-secondary">
                              <p className="m-0 fw-semibold text-dark">
                                Name: {selectedReferral.patient.first_name} {selectedReferral.patient.last_name}
                              </p>
                              <p className="m-0 mt-1">
                                <Phone className="w-3.5 h-3.5 d-inline-block align-middle text-secondary me-1" />
                                <a href={`tel:${selectedReferral.patient.phone}`} className="text-decoration-none text-primary">
                                  {selectedReferral.patient.phone}
                                </a>
                              </p>
                              <p className="m-0 mt-1">
                                <Mail className="w-3.5 h-3.5 d-inline-block align-middle text-secondary me-1" />
                                <a href={`mailto:${selectedReferral.patient.email}`} className="text-decoration-none text-primary">
                                  {selectedReferral.patient.email}
                                </a>
                              </p>
                              <p className="m-0 mt-2">
                                <Home className="w-3.5 h-3.5 d-inline-block align-middle text-secondary me-1" />
                                <span className="align-middle">
                                  {selectedReferral.patient.street_address}, {selectedReferral.patient.city},{' '}
                                  {selectedReferral.patient.state} {selectedReferral.patient.zip_code}
                                </span>
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 p-3 bg-light rounded-3 text-center border border-dashed border-secondary-subtle">
                            <LockIcon className="w-8 h-8 text-secondary opacity-50 mb-2" />
                            <h6 className="fw-bold mb-1" style={{ fontSize: '14px' }}>
                              Patient Details Locked
                            </h6>
                            <p className="text-xs text-secondary mb-3">Claim this referral to unlock patient's phone, email, and exact address.</p>
                            <button
                              className="btn btn-info w-100"
                              disabled={isClaimLoading || (walletBalance !== null && walletBalance < 1)}
                              onClick={() => claimReferral(selectedReferral.id)}
                            >
                              {isClaimLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                              ) : (
                                `Claim Case (1 Care Token)`
                              )}
                            </button>
                            {walletBalance === 0 && (
                              <p className="text-[11px] text-danger mt-1">
                                Insufficient balance. <Link to="/wallet" className="text-primary font-semibold">Buy Care Tokens</Link>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Interactive Notes & History (Claimed State Only) */}
                  <div className="col-md-6">
                    {'referral_id' in selectedReferral ? (
                      <div className="carddesign h-100 d-flex flex-col" style={{ marginBottom: 0 }}>
                        {/* Tab header */}
                        <div className="cardheading" style={{ padding: '10px 15px' }}>
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className={`btn py-1 px-3 shadow-none border-0 text-sm fw-semibold ${
                                modalTab === 'notes' ? 'text-primary border-bottom border-primary border-2' : 'text-secondary'
                              }`}
                              style={{ borderRadius: 0 }}
                              onClick={() => setModalTab('notes')}
                            >
                              Notes
                            </button>
                            <button
                              type="button"
                              className={`btn py-1 px-3 shadow-none border-0 text-sm fw-semibold ${
                                modalTab === 'timeline' ? 'text-primary border-bottom border-primary border-2' : 'text-secondary'
                              }`}
                              style={{ borderRadius: 0 }}
                              onClick={() => setModalTab('timeline')}
                            >
                              Activity Timeline
                            </button>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="cardbody flex-grow-1 d-flex flex-col py-3">
                          {modalTab === 'notes' && (
                            <div className="d-flex flex-col h-100 justify-content-between" style={{ minHeight: '320px' }}>
                              <div className="overflow-y-auto mb-3 pr-1" style={{ maxHeight: '220px' }}>
                                {isLoadingTimeline && !timeline ? (
                                  <div className="text-center py-4 text-secondary text-xs">
                                    <Loader2 className="w-4 h-4 animate-spin d-inline-block me-1" /> Loading notes...
                                  </div>
                                ) : !timeline || !timeline.notes || timeline.notes.length === 0 ? (
                                  <p className="text-center text-secondary text-xs italic py-4">No progress notes added yet.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {timeline.notes.map((note) => (
                                      <div key={note.id} className="p-2 rounded bg-light border border-light-subtle">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                          <span className="fw-bold text-dark text-xs">{note.author_name}</span>
                                          <div className="d-flex align-items-center gap-1.5">
                                            <span className="text-[10px] text-secondary">{timeAgo(note.created_at)}</span>
                                            {note.is_internal ? (
                                              <span className="badge bg-warning-subtle text-warning" style={{ fontSize: '9px' }}>
                                                Internal
                                              </span>
                                            ) : (
                                              <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '9px' }}>
                                                Shared
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <p className="m-0 text-secondary text-xs" style={{ whiteSpace: 'pre-wrap' }}>
                                          {note.note_text}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <form onSubmit={(e) => handleAddNote(e, selectedReferral.referral_id)} className="border-top border-light-subtle pt-2">
                                <div className="form-group mb-2">
                                  <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder="Add progress note (diagnostic changes, clinical outcomes...)"
                                    rows={3}
                                    className="form-control text-xs"
                                    style={{ borderRadius: '8px', fontSize: '13px' }}
                                    required
                                  ></textarea>
                                </div>
                                <div className="d-flex align-items-center justify-content-between">
                                  <label className="form-check-label text-xs text-secondary" style={{ cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={isInternal}
                                      onChange={(e) => setIsInternal(e.target.checked)}
                                      className="form-check-input me-1"
                                    />
                                    Internal note (staff only)
                                  </label>
                                  <button
                                    type="submit"
                                    disabled={isSubmittingNote || !noteText.trim()}
                                    className="btn btn-info py-1 px-3 text-xs"
                                  >
                                    {isSubmittingNote ? 'Saving...' : 'Add Note'}
                                  </button>
                                </div>
                              </form>
                            </div>
                          )}

                          {modalTab === 'timeline' && (
                            <div className="overflow-y-auto" style={{ maxHeight: '320px', minHeight: '320px' }}>
                              {isLoadingTimeline && !timeline ? (
                                <div className="text-center py-4 text-secondary text-xs">
                                  <Loader2 className="w-4 h-4 animate-spin d-inline-block me-1" /> Loading timeline...
                                </div>
                              ) : !timeline || getMergedTimeline().length === 0 ? (
                                <p className="text-center text-secondary text-xs italic py-4">No activity history.</p>
                              ) : (
                                <ul className="activity-time list-unstyled m-0">
                                  {getMergedTimeline().map((item, idx) => (
                                    <li key={idx} className="position-relative pb-3">
                                      <span className="la la-check-circle text-primary"></span>
                                      <div className="fw-semibold text-dark text-xs">{item.title}</div>
                                      {item.desc && <div className="text-secondary text-xs mt-0.5 bg-light p-1 rounded">{item.desc}</div>}
                                      <span className="text-secondary text-[10px] d-block mt-0.5">{timeAgo(item.date)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Stepper Status Transition Actions */}
                        {selectedReferral.status !== 'COMPLETED' && selectedReferral.status !== 'CLOSED' && (
                          <div className="modal-footer border-0 p-3 bg-light border-top border-light-subtle">
                            {(() => {
                              const currentStatus = selectedReferral.status as ReferralStatus
                              const nextStatus = NEXT_STATUS_VALUE[currentStatus]
                              const nextLabel = NEXT_STATUS_LABEL[currentStatus]

                              if (nextStatus && nextLabel) {
                                return (
                                  <button
                                    type="button"
                                    className="btn btn-info w-100"
                                    disabled={isStatusUpdating}
                                    onClick={() => updateStatus(selectedReferral.referral_id, nextStatus)}
                                  >
                                    {updatingId === selectedReferral.referral_id ? (
                                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                                    ) : (
                                      nextLabel
                                    )}
                                  </button>
                                )
                              }
                              return null
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Placeholder Right Column for Available cases */
                      <div className="carddesign h-100 d-flex align-items-center justify-content-center border-0 text-center" style={{ minHeight: '350px', marginBottom: 0 }}>
                        <div className="p-4 text-secondary">
                          <Coins className="w-12 h-12 text-primary opacity-30 mx-auto mb-3" />
                          <h5 className="fw-semibold">Claim Referral to Unlock</h5>
                          <p className="text-xs max-w-xs mx-auto">Detailed notes, status updates, progress reporting, and full patient history will be enabled here upon claim.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

// Custom lock SVG icon to match style.css
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2005/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      style={{ display: 'inline-block' }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  )
}
