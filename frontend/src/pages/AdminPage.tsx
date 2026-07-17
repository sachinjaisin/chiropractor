import { useEffect, useState, useCallback, Fragment } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  CheckCircle, XCircle, Loader2, Users, RefreshCw,
  ChevronDown, ChevronUp, ExternalLink,
  BarChart2, Users2, UserCheck, ClipboardList, TrendingUp, Search,
  ShieldAlert, Sliders,
  ArrowUpCircle, ArrowDownCircle, Coins, History, CreditCard,
  Plus, Trash2, Edit,
} from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

// ─── Password Schema ──────────────────────────────────────────────────────────

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string().min(8, 'Confirm password is required'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})

function ChangePasswordForm() {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(passwordSchema)
  })

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await api.post('/auth/change-password', data)
      toast.success('Password updated successfully')
      reset()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm font-medium text-gray-700">Current Password</label>
        <input type="password" {...register('current_password')} className="form-control" />
        {errors.current_password && <p className="text-xs text-red-500 mt-1">{errors.current_password.message as string}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">New Password</label>
        <input type="password" {...register('new_password')} className="form-control" />
        {errors.new_password && <p className="text-xs text-red-500 mt-1">{errors.new_password.message as string}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
        <input type="password" {...register('confirm_password')} className="form-control" />
        {errors.confirm_password && <p className="text-xs text-red-500 mt-1">{errors.confirm_password.message as string}</p>}
      </div>
      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? <Loader2 className="animate-spin" /> : 'Update Password'}
      </button>
    </form>
  )
}

// ─── Practitioner types ───────────────────────────────────────────────────────

interface Practitioner {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  status: string
  practice_name: string | null
  city: string | null
  state?: string | null
  created_at: string
  is_flagged?: boolean
}

interface PractitionerDocument {
  id: string
  document_type: string
  original_filename: string
  verified_at: string | null
  created_at: string
}

interface PractitionerDetail {
  practitioner: {
    practice_name: string | null
    city: string | null
    state: string | null
    zip_code?: string | null
    practice_phone?: string | null
    practice_email?: string | null
    website?: string | null
    years_experience?: number | string | null
    service_radius_km?: number | string | null
    warning_count?: number | null
    [key: string]: unknown
  }
  documents: PractitionerDocument[]
  stats: any
  warnings: any[]
  wallet?: any
  subscription?: any
  plans?: any
}

const DOC_TYPE_LABELS: Record<string, string> = {
  LICENSE: 'License',
  INSURANCE: 'Insurance Certificate',
  CERTIFICATION: 'Certification',
  TRAINING: 'Training Verification',
  SUPPORTING: 'Supporting Documents',
}

const PRACTITIONER_STATUSES = [
  'ALL',
  'PENDING_PROFILE',
  'PROFILE_COMPLETED',
  'PENDING_APPROVAL',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED',
]

// ─── User types ───────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
  phone?: string | null
}

// ─── Referral types ───────────────────────────────────────────────────────────

interface Referral {
  id: string
  referral_number: string
  status: string
  primary_complaint: string
  urgency_level: string
  city: string | null
  state: string | null
  claimed_by_name: string | null
  created_at: string
  patient_problems?: string[]
}

interface ReferralDetail {
  id: string;
  referral_number: string;
  status: string;
  primary_complaint: string;
  urgency_level: string;
  city: string | null;
  state: string | null;
  claimed_by_name: string | null;
  created_at: string;
  patient?: {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string | null;
    street_address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  };
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  patient_address?: string;
  duration?: string;
  notes?: string;
  symptoms?: string;
  duration_of_problem?: string;
  additional_notes?: string;
  patient_problems?: string[];
  [key: string]: any;
}



const REFERRAL_STATUSES = [
  'ALL',
  'NEW',
  'OPEN',
  'CLAIMED',
  'PATIENT_CONTACTED',
  'APPOINTMENT_BOOKED',
  'TREATMENT_IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
]

const REFERRAL_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  NEW: { badge: 'bg-gray-50 text-gray-700 border border-gray-200', dot: 'bg-gray-400' },
  OPEN: { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  CLAIMED: { badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200', dot: 'bg-indigo-500' },
  PATIENT_CONTACTED: { badge: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
  APPOINTMENT_BOOKED: { badge: 'bg-yellow-50 text-yellow-800 border border-yellow-200', dot: 'bg-yellow-500' },
  TREATMENT_IN_PROGRESS: { badge: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  COMPLETED: { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  CLOSED: { badge: 'bg-gray-100 text-gray-500 border border-gray-300', dot: 'bg-gray-400' },
}

const PRACTITIONER_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  PENDING_PROFILE: { badge: 'bg-gray-50 text-gray-700 border border-gray-200', dot: 'bg-gray-400' },
  PROFILE_COMPLETED: { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  PENDING_APPROVAL: { badge: 'bg-amber-50 text-amber-800 border border-amber-200', dot: 'bg-amber-500' },
  ACTIVE: { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { badge: 'bg-rose-50 text-rose-700 border border-rose-200', dot: 'bg-rose-500' },
  SUSPENDED: { badge: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
}

const getAuditActionStyles = (action: string) => {
  const normalized = action.toUpperCase();
  if (normalized.includes('REJECT') || normalized.includes('SUSPEND') || normalized.includes('FLAG') || normalized.includes('DELETE') || normalized.includes('BAN')) {
    return { badge: 'bg-rose-50 text-rose-700 border border-rose-200', dot: 'bg-rose-500' };
  }
  if (normalized.includes('APPROVE') || normalized.includes('ACTIVE') || normalized.includes('REACTIVATE') || normalized.includes('COMPLETE') || normalized.includes('REGISTER') || normalized.includes('SUCCESS')) {
    return { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' };
  }
  if (normalized.includes('INFO') || normalized.includes('REQUEST') || normalized.includes('CLAIM') || normalized.includes('OPEN') || normalized.includes('CREATE')) {
    return { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' };
  }
  if (normalized.includes('PENDING') || normalized.includes('WARN') || normalized.includes('UPDATE') || normalized.includes('CHANGE')) {
    return { badge: 'bg-amber-50 text-amber-800 border border-amber-200', dot: 'bg-amber-500' };
  }
  return { badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200', dot: 'bg-indigo-500' };
};




// ─── Statistics types ─────────────────────────────────────────────────────────

interface OverviewStats {
  practitioners?: {
    active?: number
    pending?: number
    pending_approval?: number
    suspended?: number
    [key: string]: unknown
  }
  referrals?: {
    open?: number
    claimed?: number
    completed?: number
    last_30_days?: number
    [key: string]: unknown
  }
  revenue?: {
    purchases?: number
    token_revenue_count?: number
    [key: string]: unknown
  }
  users?: {
    total?: number
  }
  [key: string]: unknown
}

interface DailyReferralEntry {
  date?: string
  day?: string
  [key: string]: unknown
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  useExternalStylesheet(['https://cdn.datatables.net/1.10.22/css/jquery.dataTables.min.css'])

  const [activeTab, setActiveTab] = useState<'dashboard' | 'practitioners' | 'users' | 'referrals' | 'feedback' | 'settings' | 'plans' | 'packages' | 'audit-logs' | 'transactions' | 'enquiries'>(
    (location.state as any)?.tab ?? 'dashboard'
  )

  // Dashboard pending practitioners
  const [dashboardPendingPractitioners, setDashboardPendingPractitioners] = useState<Practitioner[]>([])
  const [dashboardPendingLoading, setDashboardPendingLoading] = useState(false)

  // Modals & Forms States
  const [editUserTarget, setEditUserTarget] = useState<AdminUser | null>(null)
  const [editUserForm, setEditUserForm] = useState({ first_name: '', last_name: '', email: '', phone: '', role: '' })
  
  const [infoRequestTarget, setInfoRequestTarget] = useState<string | null>(null)
  const [infoRequestMessage, setInfoRequestMessage] = useState('')
  
  const [warningTarget, setWarningTarget] = useState<string | null>(null)
  const [warningReason, setWarningReason] = useState('')
  
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  
  const [reassignTarget, setReassignTarget] = useState<Referral | null>(null)
  const [reassignPractitionerId, setReassignPractitionerId] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [activePractitioners, setActivePractitioners] = useState<Practitioner[]>([])
  const [loadingPractitioners, setLoadingPractitioners] = useState(false)
  
  const [extendTarget, setExtendTarget] = useState<Referral | null>(null)
  const [extendHours, setExtendHours] = useState(24)

  // Other Tabs Data
  const [feedbackList, setFeedbackList] = useState<any[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackFilter, setFeedbackFilter] = useState<'ALL' | 'COMPLAINTS'>('ALL')
  
  const [settings, setSettings] = useState<Record<string, { value: any; description: string }>>({})
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // Settings sub-tabs and management states
  const [settingsSubTab, setSettingsSubTab] = useState<'system' | 'admin' | 'plans' | 'packages'>('system')

  // Plans Management
  const [plans, setPlans] = useState<any[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    monthly_price_cents: 0,
    included_tokens: 0,
    stripe_price_id: '',
    is_active: true,
    sort_order: 0,
  })

  // Packages Management
  const [packages, setPackages] = useState<any[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packageModalOpen, setPackageModalOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<any>(null)
  const [packageForm, setPackageForm] = useState({
    token_count: 0,
    price_cents: 0,
    stripe_price_id: '',
    is_active: true,
    sort_order: 0,
  })
  
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsSearch, setAuditLogsSearch] = useState('')


  // Wallet Adjust Modal States
  const [walletAdjustTarget, setWalletAdjustTarget] = useState<any | null>(null)
  const [walletAdjustAmount, setWalletAdjustAmount] = useState<number>(0)
  const [walletAdjustNotes, setWalletAdjustNotes] = useState<string>('')
  const [walletAdjustType, setWalletAdjustType] = useState<'ADJUSTMENT' | 'REFUND'>('ADJUSTMENT')

  // Subscription Manage Modal States
  const [subManageTarget, setSubManageTarget] = useState<any | null>(null)
  const [subManagePlanId, setSubManagePlanId] = useState<string>('')
  const [subManageAction, setSubManageAction] = useState<'SUBSCRIBE' | 'CANCEL' | 'CHANGE_PLAN' | 'ASSIGN_TRIAL'>('SUBSCRIBE')
  const [subManageTrialMonths, setSubManageTrialMonths] = useState<number>(1)

  // Enquiries Tab States
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [enquiriesLoading, setEnquiriesLoading] = useState(false)
  const [enquiriesPage, setEnquiriesPage] = useState(1)
  const [enquiriesTotalPages, setEnquiriesTotalPages] = useState(1)
  const [enquiriesTotal, setEnquiriesTotal] = useState(0)
  const ENQUIRIES_PAGE_SIZE = 20

  // Transactions Tab States & Loaders
  const [platformTxList, setPlatformTxList] = useState<any[]>([])
  const [platformTxLoading, setPlatformTxLoading] = useState(false)
  const [platformTxCursor, setPlatformTxCursor] = useState<string | null>(null)
  const [platformTxLoadingMore, setPlatformTxLoadingMore] = useState(false)
  const [platformTxHasMore, setPlatformTxHasMore] = useState(false)

  const loadPlatformTransactions = useCallback(async (cursor?: string) => {
    if (cursor) {
      setPlatformTxLoadingMore(true)
    } else {
      setPlatformTxLoading(true)
    }
    try {
      const params: Record<string, string> = { limit: '30' }
      if (cursor) params.cursor = cursor
      const { data } = await api.get('/admin/transactions', { params })
      if (cursor) {
        setPlatformTxList(prev => [...prev, ...data.data])
      } else {
        setPlatformTxList(data.data)
      }
      setPlatformTxCursor(data.pagination?.cursor || null)
      setPlatformTxHasMore(!!data.pagination?.cursor)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPlatformTxLoading(false)
      setPlatformTxLoadingMore(false)
    }
  }, [])

  const loadEnquiries = useCallback(async (page = 1) => {
    setEnquiriesLoading(true)
    try {
      const { data } = await api.get('/admin/contact-messages', { params: { page, page_size: ENQUIRIES_PAGE_SIZE } })
      setEnquiries(data.data)
      setEnquiriesPage(data.page)
      setEnquiriesTotalPages(data.total_pages)
      setEnquiriesTotal(data.total)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setEnquiriesLoading(false)
    }
  }, [])

  async function adjustPractitionerWallet() {
    if (!walletAdjustTarget || walletAdjustAmount === 0 || !walletAdjustNotes.trim()) return
    setActionLoading(walletAdjustTarget.id + ':wallet-adjust')
    try {
      const { data } = await api.post(`/admin/practitioners/${walletAdjustTarget.id}/wallet/adjust`, {
        amount: walletAdjustAmount,
        notes: walletAdjustNotes.trim(),
        type: walletAdjustType,
      })
      
      // Update detailCache for this practitioner
      setDetailCache(prev => {
        if (!prev[walletAdjustTarget.id]) return prev
        return {
          ...prev,
          [walletAdjustTarget.id]: {
            ...prev[walletAdjustTarget.id],
            wallet: {
              ...prev[walletAdjustTarget.id].wallet,
              balance: data.balance,
            }
          }
        }
      })
      toast.success('Wallet adjusted successfully')
      
      // Refetch practitioner details to ensure all totals are in sync
      const { data: updatedDetail } = await api.get(`/admin/practitioners/${walletAdjustTarget.id}`)
      setDetailCache(prev => ({ ...prev, [walletAdjustTarget.id]: updatedDetail }))
      
      setWalletAdjustTarget(null)
      setWalletAdjustAmount(0)
      setWalletAdjustNotes('')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function managePractitionerSubscription() {
    if (!subManageTarget) return
    setActionLoading(subManageTarget.id + ':sub-manage')
    try {
      await api.post(`/admin/practitioners/${subManageTarget.id}/subscription/manage`, {
        plan_id: subManagePlanId || null,
        action: subManageAction,
        trial_months: subManageAction === 'ASSIGN_TRIAL' ? subManageTrialMonths : null,
      })
      toast.success(`Subscription updated: ${subManageAction === 'ASSIGN_TRIAL' ? 'TRIAL ASSIGNED' : subManageAction}`)
      
      // Refetch practitioner details to get latest sub state
      const { data: updatedDetail } = await api.get(`/admin/practitioners/${subManageTarget.id}`)
      setDetailCache(prev => ({ ...prev, [subManageTarget.id]: updatedDetail }))
      
      setSubManageTarget(null)
      setSubManagePlanId('')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  // ── Tab 1: Practitioners ──────────────────────────────────────────────────

  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [practitionerStatus, setPractitionerStatus] = useState('PENDING_APPROVAL')
  const [practitionerSearch, setPractitionerSearch] = useState('')

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, PractitionerDetail>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null)

  const loadPractitioners = useCallback(async (status: string, search: string) => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      if (status !== 'ALL') params.status = status
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get('/admin/practitioners', { params })
      setPractitioners(data.data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load and on filter change
  useEffect(() => {
    if (activeTab === 'practitioners') {
      loadPractitioners(practitionerStatus, practitionerSearch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, practitionerStatus, practitionerSearch])

  // Fetch practitioner detail on expand
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return
    setDetailLoading(true)
    api.get(`/admin/practitioners/${selectedId}`)
      .then(({ data }) => {
        setDetailCache(prev => ({ ...prev, [selectedId]: data }))
      })
      .catch(err => {
        toast.error(getApiError(err))
        setSelectedId(null)
      })
      .finally(() => setDetailLoading(false))
  }, [selectedId, detailCache])

  function toggleDetail(id: string) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  async function downloadDocument(practitionerId: string, docId: string) {
    setDownloadLoading(docId)
    try {
      const { data } = await api.get(`/admin/practitioners/${practitionerId}/documents/${docId}/download`)
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setDownloadLoading(null)
    }
  }

  async function approve(id: string) {
    setActionLoading(id + ':approve')
    try {
      await api.post(`/admin/practitioners/${id}/approve`)
      setPractitioners(prev => prev.filter(p => p.id !== id))
      setDashboardPendingPractitioners(prev => prev.filter(p => p.id !== id))
      toast.success('Chiropractor approved')
      loadStats()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function reject() {
    if (!rejectTarget || !rejectReason.trim()) return
    setActionLoading(rejectTarget + ':reject')
    try {
      await api.post(`/admin/practitioners/${rejectTarget}/reject`, { reason: rejectReason })
      setPractitioners(prev => prev.filter(p => p.id !== rejectTarget))
      setDashboardPendingPractitioners(prev => prev.filter(p => p.id !== rejectTarget))
      setRejectTarget(null)
      setRejectReason('')
      toast.success('Application rejected')
      loadStats()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function suspendPractitioner() {
    if (!suspendTarget || !suspendReason.trim()) return
    setActionLoading(suspendTarget + ':suspend')
    try {
      await api.post(`/admin/practitioners/${suspendTarget}/suspend`, { reason: suspendReason })
      setPractitioners(prev => prev.map(p => p.id === suspendTarget ? { ...p, status: 'SUSPENDED' } : p))
      setDetailCache(prev => {
        if (!prev[suspendTarget]) return prev
        return {
          ...prev,
          [suspendTarget]: {
            ...prev[suspendTarget],
            practitioner: {
              ...prev[suspendTarget].practitioner,
              status: 'SUSPENDED'
            }
          }
        }
      })
      setSuspendTarget(null)
      setSuspendReason('')
      toast.success('Chiropractor suspended')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function reactivatePractitioner(id: string) {
    setActionLoading(id + ':reactivate')
    try {
      await api.post(`/admin/practitioners/${id}/reactivate`)
      setPractitioners(prev => prev.map(p => p.id === id ? { ...p, status: 'ACTIVE' } : p))
      setDetailCache(prev => {
        if (!prev[id]) return prev
        return {
          ...prev,
          [id]: {
            ...prev[id],
            practitioner: {
              ...prev[id].practitioner,
              status: 'ACTIVE'
            }
          }
        }
      })
      toast.success('Chiropractor reactivated')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function togglePractitionerFlag(pObj: Practitioner & { is_flagged?: boolean }) {
    setActionLoading(pObj.id + ':flag')
    try {
      const { data } = await api.post(`/admin/practitioners/${pObj.id}/flag`)
      setPractitioners(prev => prev.map(p => p.id === pObj.id ? { ...p, is_flagged: data.is_flagged } : p))
      setDetailCache(prev => {
        if (!prev[pObj.id]) return prev
        return {
          ...prev,
          [pObj.id]: {
            ...prev[pObj.id],
            practitioner: {
              ...prev[pObj.id].practitioner,
              is_flagged: data.is_flagged
            }
          }
        }
      })
      toast.success(data.is_flagged ? 'Chiropractor flagged' : 'Chiropractor unflagged')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function requestInfo() {
    if (!infoRequestTarget || !infoRequestMessage.trim()) return
    setActionLoading(infoRequestTarget + ':request-info')
    try {
      await api.post(`/admin/practitioners/${infoRequestTarget}/request-info`, { message: infoRequestMessage })
      const { data } = await api.get(`/admin/practitioners/${infoRequestTarget}`)
      setDetailCache(prev => ({ ...prev, [infoRequestTarget]: data }))
      setInfoRequestTarget(null)
      setInfoRequestMessage('')
      toast.success('Information request email sent to chiropractor')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function issueWarning() {
    if (!warningTarget || !warningReason.trim()) return
    setActionLoading(warningTarget + ':warn')
    try {
      await api.post(`/admin/practitioners/${warningTarget}/warn`, { reason: warningReason })
      const { data } = await api.get(`/admin/practitioners/${warningTarget}`)
      setDetailCache(prev => ({ ...prev, [warningTarget]: data }))
      setWarningTarget(null)
      setWarningReason('')
      toast.success('Compliance warning issued successfully')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  // ── Tab 2: Users ──────────────────────────────────────────────────────────

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersSearch, setUsersSearch] = useState('')
  const [usersPage, setUsersPage] = useState(1)
  const [usersPageSize, setUsersPageSize] = useState(10)

  useEffect(() => {
    setUsersPage(1)
  }, [usersSearch, usersPageSize])

  const loadUsers = useCallback(async (search: string) => {
    setUsersLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get('/admin/users', { params })
      setUsers(data.data ?? data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers(usersSearch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, usersSearch])

  async function toggleUserActive(u: AdminUser) {
    const endpoint = u.is_active
      ? `/admin/users/${u.id}/disable`
      : `/admin/users/${u.id}/reactivate`
    try {
      await api.post(endpoint)
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x))
      toast.success(u.is_active ? 'User disabled' : 'User enabled')
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  async function editUser() {
    if (!editUserTarget) return
    setActionLoading(editUserTarget.id + ':edit')
    try {
      await api.patch(`/admin/users/${editUserTarget.id}`, editUserForm)
      setUsers(prev => prev.map(u => u.id === editUserTarget.id ? { ...u, ...editUserForm } : u))
      setEditUserTarget(null)
      toast.success('User details updated successfully')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  // ── Tab 3: Referrals ──────────────────────────────────────────────────────

  const [referrals, setReferrals] = useState<Referral[]>([])
  const [referralsLoading, setReferralsLoading] = useState(false)
  const [referralStatus, setReferralStatus] = useState('ALL')
  const [expandedReferralId, setExpandedReferralId] = useState<string | null>(null)
  const [referralDetail, setReferralDetail] = useState<Record<string, ReferralDetail>>({})
  // New state to store matching practitioners per referral

  // ── Pagination and Search States for Admin Tables ───────────────────────────
  // 0. Dashboard Quick-Review Table
  const [pendingSearch, setPendingSearch] = useState('')
  const [pendingPageSize, setPendingPageSize] = useState(5)
  const [pendingPage, setPendingPage] = useState(1)

  useEffect(() => {
    setPendingPage(1)
  }, [pendingSearch, pendingPageSize])

  // 1. Chiropractors Tab
  const [practitionerPageSize, setPractitionerPageSize] = useState(10)
  const [practitionerPage, setPractitionerPage] = useState(1)

  useEffect(() => {
    setPractitionerPage(1)
  }, [practitionerSearch, practitionerStatus, practitionerPageSize])

  // 2. Referrals Tab
  const [referralSearch, setReferralSearch] = useState('')
  const [referralPageSize, setReferralPageSize] = useState(10)
  const [referralPage, setReferralPage] = useState(1)

  useEffect(() => {
    setReferralPage(1)
  }, [referralStatus, referralSearch, referralPageSize])

  // 3. Subscription Plans Tab
  const [planSearch, setPlanSearch] = useState('')
  const [planPageSize, setPlanPageSize] = useState(10)
  const [planPage, setPlanPage] = useState(1)

  useEffect(() => {
    setPlanPage(1)
  }, [planSearch, planPageSize])

  // 4. Token Packages Tab
  const [packageSearch, setPackageSearch] = useState('')
  const [packagePageSize, setPackagePageSize] = useState(10)
  const [packagePage, setPackagePage] = useState(1)

  useEffect(() => {
    setPackagePage(1)
  }, [packageSearch, packagePageSize])

  // 5. Audit Logs Tab
  const [auditLogsPageSize, setAuditLogsPageSize] = useState(10)
  const [auditLogsPage, setAuditLogsPage] = useState(1)

  useEffect(() => {
    setAuditLogsPage(1)
  }, [auditLogsSearch, auditLogsPageSize])

  // 6. Transactions Tab
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionPageSize, setTransactionPageSize] = useState(10)
  const [transactionPage, setTransactionPage] = useState(1)

  useEffect(() => {
    setTransactionPage(1)
  }, [transactionSearch, transactionPageSize])

  const loadReferrals = useCallback(async (status: string) => {
    setReferralsLoading(true)
    try {
      const params: Record<string, string> = { limit: '30' }
      if (status !== 'ALL') params.status = status
      const { data } = await api.get('/admin/referrals', { params })
      setReferrals(data.data ?? data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setReferralsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'referrals') {
      loadReferrals(referralStatus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, referralStatus])

  function toggleReferral(id: string) {
    setExpandedReferralId(prev => (prev === id ? null : id))
    // Fetch detail if not cached
    if (!referralDetail[id]) {
      api.get(`/admin/referrals/${id}`)
        .then(({ data }) => {
          setReferralDetail(prev => ({ ...prev, [id]: data.data ?? data }))
        })
        .catch(err => toast.error(getApiError(err)))
    }
  }

  async function closeReferral(id: string) {
    try {
      await api.post(`/admin/referrals/${id}/close`)
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, status: 'CLOSED' } : r))
      setReferralDetail(prev => prev[id] ? { ...prev, [id]: { ...prev[id], status: 'CLOSED' } } : prev)
      toast.success('Referral closed')
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  const loadActivePractitioners = useCallback(async () => {
    setLoadingPractitioners(true)
    try {
      const { data } = await api.get('/admin/practitioners', { params: { status: 'ACTIVE', limit: '100' } })
      setActivePractitioners(data.data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setLoadingPractitioners(false)
    }
  }, [])

  async function reassignReferral() {
    if (!reassignTarget || !reassignPractitionerId || !reassignReason.trim()) return
    setActionLoading(reassignTarget.id + ':reassign')
    try {
      await api.post(`/admin/referrals/${reassignTarget.id}/reassign`, {
        practitioner_id: reassignPractitionerId,
        reason: reassignReason
      })
      const updatedName = activePractitioners.find(p => p.id === reassignPractitionerId)
        ? `${activePractitioners.find(p => p.id === reassignPractitionerId)?.first_name} ${activePractitioners.find(p => p.id === reassignPractitionerId)?.last_name}`
        : 'Reassigned'
      setReferrals(prev => prev.map(r => r.id === reassignTarget.id ? { ...r, status: 'CLAIMED', claimed_by_name: updatedName } : r))
      setReferralDetail(prev => {
        if (!prev[reassignTarget.id]) return prev
        return {
          ...prev,
          [reassignTarget.id]: {
            ...prev[reassignTarget.id],
            status: 'CLAIMED',
            claimed_by_name: updatedName
          }
        }
      })
      setReassignTarget(null)
      setReassignPractitionerId('')
      setReassignReason('')
      toast.success('Referral reassigned successfully')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function extendReferral() {
    if (!extendTarget) return
    setActionLoading(extendTarget.id + ':extend')
    try {
      await api.post(`/admin/referrals/${extendTarget.id}/extend`, { hours: extendHours })
      setReferrals(prev => prev.map(r => r.id === extendTarget.id && r.status === 'CLOSED' ? { ...r, status: 'OPEN' } : r))
      setReferralDetail(prev => {
        if (!prev[extendTarget.id]) return prev
        return {
          ...prev,
          [extendTarget.id]: {
            ...prev[extendTarget.id],
            status: prev[extendTarget.id].status === 'CLOSED' ? 'OPEN' : prev[extendTarget.id].status
          }
        }
      })
      setExtendTarget(null)
      toast.success(`Referral visibility extended by ${extendHours} hours`)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setActionLoading(null)
    }
  }

  // ── Tab 4: Statistics ─────────────────────────────────────────────────────

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [dailyReferrals, setDailyReferrals] = useState<DailyReferralEntry[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const [overviewRes, referralsRes] = await Promise.all([
        api.get('/admin/analytics/overview'),
        api.get('/admin/analytics/referrals', { params: { days: 30 } }),
      ])
      setOverview(overviewRes.data.data ?? overviewRes.data)
      const raw: DailyReferralEntry[] = referralsRes.data.data ?? referralsRes.data ?? []
      setDailyReferrals(raw)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const loadDashboardPendingPractitioners = useCallback(async () => {
    setDashboardPendingLoading(true)
    try {
      const { data } = await api.get('/admin/practitioners', { params: { status: 'PENDING_APPROVAL', limit: '5' } })
      setDashboardPendingPractitioners(data.data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setDashboardPendingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadStats()
      loadDashboardPendingPractitioners()
    }
  }, [activeTab, loadStats, loadDashboardPendingPractitioners])

  // ─── Tab configuration ──────────────────────────────────────────────────────

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', Icon: BarChart2 },
    { key: 'practitioners', label: 'Chiropractors', Icon: Users2 },
    { key: 'users', label: 'Users', Icon: UserCheck },
    { key: 'referrals', label: 'Referrals', Icon: ClipboardList },
    { key: 'feedback', label: 'Feedback & Compliance', Icon: ShieldAlert },
    { key: 'plans', label: 'Subscription Plans', Icon: CreditCard },
    { key: 'packages', label: 'Token Packages', Icon: Coins },
    { key: 'settings', label: 'Settings', Icon: Sliders },
    { key: 'audit-logs', label: 'Audit Logs', Icon: ClipboardList },
    { key: 'transactions', label: 'Transactions', Icon: Coins },
  ] as const

  const loadFeedback = useCallback(async (filter: 'ALL' | 'COMPLAINTS') => {
    setFeedbackLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      const { data } = await api.get('/admin/feedback', { params })
      setFeedbackList(data.data || data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setFeedbackLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const { data } = await api.get('/admin/settings')
      setSettings(data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  async function saveSettings(updates: Record<string, any>) {
    setSavingSettings(true)
    try {
      await api.patch('/admin/settings', updates)
      toast.success('System settings updated successfully')
      await loadSettings()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setSavingSettings(false)
    }
  }

  const loadPlans = useCallback(async () => {
    setPlansLoading(true)
    try {
      const { data } = await api.get('/admin/plans')
      setPlans(data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPlansLoading(false)
    }
  }, [])

  const loadPackages = useCallback(async () => {
    setPackagesLoading(true)
    try {
      const { data } = await api.get('/admin/packages')
      setPackages(data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPackagesLoading(false)
    }
  }, [])

  async function handleSavePlan() {
    if (!planForm.name || planForm.monthly_price_cents < 0 || planForm.included_tokens < 0 || !planForm.stripe_price_id) {
      toast.error('Please fill in all required fields correctly.')
      return
    }
    setPlansLoading(true)
    try {
      if (selectedPlan) {
        await api.patch(`/admin/plans/${selectedPlan.id}`, planForm)
        toast.success('Subscription plan updated successfully.')
      } else {
        await api.post('/admin/plans', planForm)
        toast.success('Subscription plan created successfully.')
      }
      setPlanModalOpen(false)
      loadPlans()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPlansLoading(false)
    }
  }

  async function handleSavePackage() {
    if (packageForm.token_count <= 0 || packageForm.price_cents <= 0 || !packageForm.stripe_price_id) {
      toast.error('Please fill in all required fields correctly.')
      return
    }
    setPackagesLoading(true)
    try {
      if (selectedPackage) {
        await api.patch(`/admin/packages/${selectedPackage.id}`, packageForm)
        toast.success('Token package updated successfully.')
      } else {
        await api.post('/admin/packages', packageForm)
        toast.success('Token package created successfully.')
      }
      setPackageModalOpen(false)
      loadPackages()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPackagesLoading(false)
    }
  }

  const loadAuditLogs = useCallback(async (search: string) => {
    setAuditLogsLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      if (search.trim()) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.trim())
        if (isUuid) {
          params.entity_id = search.trim()
        } else {
          params.entity_type = search.trim()
        }
      }
      const { data } = await api.get('/admin/audit-logs', { params })
      setAuditLogs(data.data || data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setAuditLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'feedback') {
      loadFeedback(feedbackFilter)
    } else if (activeTab === 'settings') {
      loadSettings()
    } else if (activeTab === 'plans') {
      loadPlans()
    } else if (activeTab === 'packages') {
      loadPackages()
    } else if (activeTab === 'audit-logs') {
      loadAuditLogs(auditLogsSearch)
    } else if (activeTab === 'transactions') {
      loadPlatformTransactions()
    } else if (activeTab === 'enquiries') {
      loadEnquiries(1)
    }
  }, [activeTab, feedbackFilter, auditLogsSearch, loadFeedback, loadSettings, loadAuditLogs, loadPlatformTransactions, loadPlans, loadPackages, loadEnquiries])

  const chartData = (() => {
    const dayMap: Record<string, number> = {}
    
    // 1. Initialize the last 15 days in local date strings (YYYY-MM-DD)
    for (let i = 0; i < 15; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const date = String(d.getDate()).padStart(2, '0')
      const key = `${year}-${month}-${date}`
      dayMap[key] = 0
    }
    
    // 2. Add volume from actual dailyReferrals data if available
    if (dailyReferrals && dailyReferrals.length > 0) {
      for (const entry of dailyReferrals) {
        const rawKey = (entry.date ?? entry.day ?? '') as string
        if (!rawKey) continue
        
        // Convert to local date YYYY-MM-DD
        const localDate = new Date(rawKey)
        const year = localDate.getFullYear()
        const month = String(localDate.getMonth() + 1).padStart(2, '0')
        const date = String(localDate.getDate()).padStart(2, '0')
        const key = `${year}-${month}-${date}`
        
        const countVal = typeof entry.count === 'number'
          ? entry.count
          : typeof entry.count === 'string'
          ? parseInt(entry.count, 10)
          : Number(entry.count || 0)
          
        if (!isNaN(countVal)) {
          if (dayMap[key] !== undefined) {
            dayMap[key] = dayMap[key] + countVal
          }
        }
      }
    }
    
    // Sort in descending order (newest to oldest)
    const sorted = Object.entries(dayMap).sort(([a], [b]) => b.localeCompare(a))
    return sorted
  })()

  function formatLocalDateStr(dateStr: string) {
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthIdx = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return `${months[monthIdx]} ${day}`
  }

  const chartMax = chartData.reduce((m, [, v]) => Math.max(m, v), 1)

  // 0. Dashboard Pending Quick-Review
  const filteredPending = dashboardPendingPractitioners.filter((p) => {
    const term = pendingSearch.toLowerCase()
    if (!term) return true
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase()
    const practiceName = (p.practice_name || '').toLowerCase()
    const location = `${p.city || ''} ${p.state || ''}`.toLowerCase()
    const contact = `${p.email || ''} ${p.phone || ''}`.toLowerCase()
    return (
      fullName.includes(term) ||
      practiceName.includes(term) ||
      location.includes(term) ||
      contact.includes(term)
    )
  })
  const totalPendingCount = filteredPending.length
  const totalPendingPages = Math.ceil(totalPendingCount / pendingPageSize) || 1
  const startPendingIndex = totalPendingCount === 0 ? 0 : (pendingPage - 1) * pendingPageSize + 1
  const endPendingIndex = Math.min(pendingPage * pendingPageSize, totalPendingCount)
  const paginatedPendingPractitioners = filteredPending.slice(
    (pendingPage - 1) * pendingPageSize,
    (pendingPage - 1) * pendingPageSize + pendingPageSize
  )

  const totalUsersEntries = users.length
  const totalUsersPages = Math.ceil(totalUsersEntries / usersPageSize) || 1
  const startUsersIndex = totalUsersEntries === 0 ? 0 : (usersPage - 1) * usersPageSize + 1
  const endUsersIndex = Math.min(usersPage * usersPageSize, totalUsersEntries)
  const paginatedUsers = users.slice(
    (usersPage - 1) * usersPageSize,
    usersPage * usersPageSize
  )

  // 1. Chiropractors
  const totalPractitionersCount = practitioners.length
  const totalPractitionersPages = Math.ceil(totalPractitionersCount / practitionerPageSize) || 1
  const startPractitionersIndex = totalPractitionersCount === 0 ? 0 : (practitionerPage - 1) * practitionerPageSize + 1
  const endPractitionersIndex = Math.min(practitionerPage * practitionerPageSize, totalPractitionersCount)
  const paginatedPractitioners = practitioners.slice(
    (practitionerPage - 1) * practitionerPageSize,
    (practitionerPage - 1) * practitionerPageSize + practitionerPageSize
  )

  // 2. Referrals
  const filteredReferrals = referrals.filter((r) => {
    const term = referralSearch.toLowerCase()
    if (!term) return true
    const refNum = (r.referral_number || '').toLowerCase()
    const complaint = (r.primary_complaint || '').toLowerCase()
    const location = `${r.city || ''}, ${r.state || ''}`.toLowerCase()
    const doc = (r.claimed_by_name || 'unassigned').toLowerCase()
    const status = (r.status || '').toLowerCase()
    return (
      refNum.includes(term) ||
      complaint.includes(term) ||
      location.includes(term) ||
      doc.includes(term) ||
      status.includes(term)
    )
  })
  const totalReferralsCount = filteredReferrals.length
  const totalReferralsPages = Math.ceil(totalReferralsCount / referralPageSize) || 1
  const startReferralsIndex = totalReferralsCount === 0 ? 0 : (referralPage - 1) * referralPageSize + 1
  const endReferralsIndex = Math.min(referralPage * referralPageSize, totalReferralsCount)
  const paginatedReferrals = filteredReferrals.slice(
    (referralPage - 1) * referralPageSize,
    (referralPage - 1) * referralPageSize + referralPageSize
  )

  // 3. Subscription Plans
  const filteredPlans = plans.filter((p: any) => {
    const term = planSearch.toLowerCase()
    if (!term) return true
    const name = (p.name || '').toLowerCase()
    const desc = (p.description || '').toLowerCase()
    const stripeId = (p.stripe_price_id || '').toLowerCase()
    return name.includes(term) || desc.includes(term) || stripeId.includes(term)
  })
  const totalPlansCount = filteredPlans.length
  const totalPlansPages = Math.ceil(totalPlansCount / planPageSize) || 1
  const startPlansIndex = totalPlansCount === 0 ? 0 : (planPage - 1) * planPageSize + 1
  const endPlansIndex = Math.min(planPage * planPageSize, totalPlansCount)
  const paginatedPlans = filteredPlans.slice(
    (planPage - 1) * planPageSize,
    (planPage - 1) * planPageSize + planPageSize
  )

  // 4. Token Packages
  const filteredPackages = packages.filter((pkg: any) => {
    const term = packageSearch.toLowerCase()
    if (!term) return true
    const stripeId = (pkg.stripe_price_id || '').toLowerCase()
    const tokenCount = `${pkg.token_count} tokens`.toLowerCase()
    return stripeId.includes(term) || tokenCount.includes(term)
  })
  const totalPackagesCount = filteredPackages.length
  const totalPackagesPages = Math.ceil(totalPackagesCount / packagePageSize) || 1
  const startPackagesIndex = totalPackagesCount === 0 ? 0 : (packagePage - 1) * packagePageSize + 1
  const endPackagesIndex = Math.min(packagePage * packagePageSize, totalPackagesCount)
  const paginatedPackages = filteredPackages.slice(
    (packagePage - 1) * packagePageSize,
    (packagePage - 1) * packagePageSize + packagePageSize
  )

  // 5. Audit Logs
  const totalAuditLogsCount = auditLogs.length
  const totalAuditLogsPages = Math.ceil(totalAuditLogsCount / auditLogsPageSize) || 1
  const startAuditLogsIndex = totalAuditLogsCount === 0 ? 0 : (auditLogsPage - 1) * auditLogsPageSize + 1
  const endAuditLogsIndex = Math.min(auditLogsPage * auditLogsPageSize, totalAuditLogsCount)
  const paginatedAuditLogs = auditLogs.slice(
    (auditLogsPage - 1) * auditLogsPageSize,
    (auditLogsPage - 1) * auditLogsPageSize + auditLogsPageSize
  )

  // 6. Transactions
  const filteredTransactions = platformTxList.filter((tx: any) => {
    const term = transactionSearch.toLowerCase()
    if (!term) return true
    const name = `${tx.first_name || ''} ${tx.last_name || ''}`.toLowerCase()
    const type = (tx.transaction_type || '').toLowerCase()
    const notes = (tx.notes || '').toLowerCase()
    return name.includes(term) || type.includes(term) || notes.includes(term)
  })
  const totalTransactionsCount = filteredTransactions.length
  const totalTransactionsPages = Math.ceil(totalTransactionsCount / transactionPageSize) || 1
  const startTransactionsIndex = totalTransactionsCount === 0 ? 0 : (transactionPage - 1) * transactionPageSize + 1
  const endTransactionsIndex = Math.min(transactionPage * transactionPageSize, totalTransactionsCount)
  const paginatedTransactions = filteredTransactions.slice(
    (transactionPage - 1) * transactionPageSize,
    (transactionPage - 1) * transactionPageSize + transactionPageSize
  )

  return (
    <AdminShell activeTab={activeTab} setActiveTab={setActiveTab}>

      {/* ── TAB 0: Dashboard ─────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Operational Dashboard</h2>
              <p className="text-sm text-gray-500 mt-0.5">Real-time platform metrics and oversight.</p>
            </div>
          </div>

          {statsLoading && !overview ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <>
              {/* Overview widgets */}
              <div className="row mb-4">
                <div className="col-md-12">
                  <ul className="dashboardcard-list">
                    {/* Card 1: Pending Approvals */}
                    {(() => {
                      const pendingCount = overview?.practitioners?.pending_approval ?? overview?.practitioners?.pending ?? 0
                      return (
                        <li>
                          <div
                            className="dashboard-card dashboard-card3"
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setPractitionerStatus('PENDING_APPROVAL'); setActiveTab('practitioners') }}
                          >
                            <div className="dashboard-card-icon">
                              <img src="/assets/images/dashboard-card3.svg" className="img-fluid" alt="" />
                            </div>
                            <h4>Pending Approvals</h4>
                            <h3>{pendingCount}</h3>
                            <p>REQUIRES REVIEW</p>
                          </div>
                        </li>
                      )
                    })()}

                    {/* Card 2: Active Chiropractors */}
                    <li>
                      <div
                        className="dashboard-card dashboard-card1"
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setPractitionerStatus('ACTIVE'); setActiveTab('practitioners') }}
                      >
                        <div className="dashboard-card-icon">
                          <img src="/assets/images/dashboard-card1.svg" className="img-fluid" alt="" />
                        </div>
                        <h4>Active Chiropractors</h4>
                        <h3>{overview?.practitioners?.active ?? 0}</h3>
                        <p className="dashboard-success">VERIFIED & ACTIVE</p>
                      </div>
                    </li>

                    {/* Card 3: Total Accounts */}
                    <li>
                      <div
                        className="dashboard-card dashboard-card4"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('users')}
                      >
                        <div className="dashboard-card-icon">
                          <img src="/assets/images/dashboard-card4.svg" className="img-fluid" alt="" />
                        </div>
                        <h4>Total Accounts</h4>
                        <h3>{overview?.users?.total ?? 0}</h3>
                        <p>MANAGE USERS</p>
                      </div>
                    </li>

                    {/* Card 4: Referral Activity */}
                    <li>
                      <div
                        className="dashboard-card dashboard-card2"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('referrals')}
                      >
                        <div className="dashboard-card-icon">
                          <img src="/assets/images/dashboard-card2.svg" className="img-fluid" alt="" />
                        </div>
                        <h4>Referral Activity</h4>
                        <h3>{overview?.referrals?.open ?? 0}</h3>
                        <p>OPEN REFERRALS</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Grid Column Layout for Pending and Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left side: Practitioner applications */}
                <div className="lg:col-span-2">
                  <div className="carddesign">
                    <div className="cardheading align-items-center">
                      <h2>
                        Pending Applications Quick-Review
                      </h2>
                    </div>
                    <div className="cardbody">
                      {dashboardPendingLoading && dashboardPendingPractitioners.length === 0 ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin text-primary-600 mr-2" />
                          <span className="text-sm text-gray-500">Loading pending applications…</span>
                        </div>
                      ) : dashboardPendingPractitioners.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3">
                            <CheckCircle className="w-6 h-6" />
                          </div>
                          <h4 className="text-base font-semibold text-gray-900">All caught up!</h4>
                          <p className="text-xs text-gray-500 mt-1 max-w-xs">
                            There are no chiropractor applications awaiting review at this time.
                          </p>
                        </div>
                      ) : (
                        <div className="tabledesign filterno whitebg">
                          {/* DataTables Header Controls */}
                          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div className="dataTables_length">
                              <label className="d-flex align-items-center gap-2">
                                Show
                                <select
                                  value={pendingPageSize}
                                  onChange={(e) => { setPendingPageSize(Number(e.target.value)); setPendingPage(1); }}
                                  className="form-select form-select-sm"
                                  style={{ width: 'auto', display: 'inline-block' }}
                                >
                                  <option value={5}>5</option>
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                </select>
                                entries
                              </label>
                            </div>
                            <div className="dataTables_filter d-flex align-items-center gap-2">
                              <label className="d-flex align-items-center gap-2 mb-0">
                                Search:
                                <input
                                  type="search"
                                  value={pendingSearch}
                                  onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }}
                                  className="form-control form-control-sm"
                                  placeholder="Search..."
                                  style={{ width: 'auto', display: 'inline-block' }}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="table-responsive">
                            <table className="table dt-responsive categories_table dataTable no-footer">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Practice / Location</th>
                                  <th>Contact</th>
                                  <th>Registered</th>
                                  <th style={{ textAlign: 'right', minWidth: '140px' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedPendingPractitioners.map(p => {
                                  const isExpanded = selectedId === p.id
                                  const detail = detailCache[p.id]

                                  return (
                                    <Fragment key={p.id}>
                                      <tr>
                                        <td>
                                          <div className="font-semibold text-gray-900">
                                            {p.first_name} {p.last_name}
                                          </div>
                                        </td>
                                        <td>
                                          <div className="text-gray-700 font-medium">{p.practice_name || '—'}</div>
                                          {p.city && <div className="text-xs text-gray-500">{p.city}</div>}
                                        </td>
                                        <td>
                                          <div className="text-xs text-gray-700 font-medium">{p.email}</div>
                                          {p.phone && <div className="text-xs text-gray-400 font-mono">{p.phone}</div>}
                                        </td>
                                        <td>
                                          <span className="text-xs text-gray-500">{fmtDate(p.created_at)}</span>
                                        </td>
                                        <td>
                                          <div className="flex gap-2 justify-end">
                                            <button
                                              onClick={() => toggleDetail(p.id)}
                                              className="btn-details"
                                            >
                                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                              {isExpanded ? 'Hide' : 'Review'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>

                                      {isExpanded && (
                                        <tr>
                                          <td colSpan={5} className="bg-gray-50 p-4 border-t border-gray-100">
                                            {detailLoading && !detail ? (
                                              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                Loading documents…
                                              </div>
                                            ) : detail ? (
                                              <div className="space-y-3 text-xs">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                  <div>
                                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Practice Details</p>
                                                    <p className="text-gray-800 font-semibold">{detail.practitioner.practice_name || '—'}</p>
                                                    {(detail.practitioner.city || detail.practitioner.state) && (
                                                      <p className="text-gray-500">
                                                        {[detail.practitioner.city, detail.practitioner.state, detail.practitioner.zip_code].filter(Boolean).join(', ')}
                                                      </p>
                                                    )}
                                                    {detail.practitioner.years_experience && (
                                                      <p className="text-gray-500 mt-1">
                                                        <strong>Experience:</strong> {detail.practitioner.years_experience} years
                                                      </p>
                                                    )}
                                                  </div>
                                                  <div>
                                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Contact Info</p>
                                                    <p className="text-gray-600 mb-0.5"><strong>Phone:</strong> {detail.practitioner.practice_phone || '—'}</p>
                                                    <p className="text-gray-600"><strong>Email:</strong> {detail.practitioner.practice_email || '—'}</p>
                                                    {detail.practitioner.website && (
                                                      <a href={detail.practitioner.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline block mt-0.5">
                                                        {detail.practitioner.website}
                                                      </a>
                                                    )}
                                                  </div>
                                                </div>

                                                <div>
                                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Verification Documents</p>
                                                  {detail.documents.length === 0 ? (
                                                    <p className="text-gray-400 italic">No documents uploaded</p>
                                                  ) : (
                                                    <ul className="space-y-1">
                                                      {detail.documents.map(doc => (
                                                        <li key={doc.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-gray-100">
                                                          <span className="text-gray-700 font-medium">
                                                            {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                                                            <span className="text-gray-400 text-[10px] font-normal ml-1">({doc.original_filename})</span>
                                                          </span>
                                                          <button
                                                            onClick={() => downloadDocument(p.id, doc.id)}
                                                            disabled={downloadLoading === doc.id}
                                                            className="btn btn-secondary text-xs py-1 px-2 !inline-flex !items-center !justify-center gap-1.5 whitespace-nowrap"
                                                          >
                                                            {downloadLoading === doc.id ? (
                                                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                            ) : (
                                                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                                            )}
                                                            Download
                                                          </button>
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  )}
                                                </div>

                                                <div className="flex gap-2 pt-3 border-t border-gray-200/60">
                                                  <button
                                                    onClick={() => approve(p.id)}
                                                    disabled={!!actionLoading}
                                                    className="btn btn-success py-1.5 px-3 text-xs"
                                                  >
                                                    Approve
                                                  </button>
                                                  <button
                                                    onClick={() => { setRejectTarget(p.id); setRejectReason('') }}
                                                    disabled={!!actionLoading}
                                                    className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50 py-1.5 px-3 text-xs"
                                                  >
                                                    Reject
                                                  </button>
                                                  <button
                                                    onClick={() => { setInfoRequestTarget(p.id); setInfoRequestMessage('') }}
                                                    disabled={!!actionLoading}
                                                    className="btn btn-secondary py-1.5 px-3 text-xs"
                                                  >
                                                    Request Information
                                                  </button>
                                                </div>
                                              </div>
                                            ) : null}
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* DataTables Pagination & Info Footer */}
                          <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                            <div className="dataTables_info">
                              Showing {startPendingIndex} to {endPendingIndex} of {totalPendingCount} entries
                            </div>
                            {totalPendingPages > 1 && (
                              <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                                <button
                                  disabled={pendingPage === 1}
                                  onClick={() => setPendingPage(pendingPage - 1)}
                                  className="paginate_button previous bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: pendingPage === 1 ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: pendingPage === 1 ? 0.5 : 1,
                                    fontSize: '13px',
                                  }}
                                >
                                  Previous
                                </button>
                                <span>
                                  {Array.from({ length: totalPendingPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => setPendingPage(p)}
                                      className={`paginate_button ${pendingPage === p ? 'current text-white' : 'bg-transparent'}`}
                                      style={{
                                        cursor: 'pointer',
                                        margin: '0 4px',
                                        border: pendingPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                        borderRadius: '5px',
                                        backgroundColor: pendingPage === p ? '#0068b9' : 'transparent',
                                        color: pendingPage === p ? '#fff' : '#000',
                                        padding: '4px 10px',
                                        fontSize: '13px'
                                      }}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </span>
                                <button
                                  disabled={pendingPage === totalPendingPages}
                                  onClick={() => setPendingPage(pendingPage + 1)}
                                  className="paginate_button next bg-transparent px-2.5 py-1"
                                  style={{
                                    cursor: pendingPage === totalPendingPages ? 'not-allowed' : 'pointer',
                                    border: '1px solid #cedcef',
                                    borderRadius: '5px',
                                    opacity: pendingPage === totalPendingPages ? 0.5 : 1,
                                    fontSize: '13px',
                                  }}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>

                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Referral activity chart */}
                <div>
                  <div className="carddesign">
                    <div className="cardheading align-items-center">
                      <h2>Referral Volume</h2>
                    </div>
                    <div className="cardbody">
{(() => {
                        const openCount = overview?.referrals?.open ?? 0
                        const claimedCount = overview?.referrals?.claimed ?? 0
                        const completedCount = overview?.referrals?.completed ?? 0
                        const totalCount = openCount + claimedCount + completedCount

                        const openPct = totalCount > 0 ? (openCount / totalCount) * 100 : 0
                        const claimedPct = totalCount > 0 ? (claimedCount / totalCount) * 100 : 0
                        const completedPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

                        const segments = [
                          { label: 'Open', count: openCount, pct: openPct, color: '#3b82f6', bgClass: 'bg-blue-500' },
                          { label: 'Claimed', count: claimedCount, pct: claimedPct, color: '#6366f1', bgClass: 'bg-indigo-500' },
                          { label: 'Completed', count: completedCount, pct: completedPct, color: '#10b981', bgClass: 'bg-emerald-500' },
                        ]

                        let accumulated = 0

                        return (
                          <div className="flex flex-col items-center py-4">
                            <div className="relative w-40 h-40">
                              <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
                                {/* Base track circle */}
                                <circle
                                  cx="21"
                                  cy="21"
                                  r="15.91549430918954"
                                  fill="transparent"
                                  stroke="#f1f5f9"
                                  strokeWidth="4.2"
                                />

                                {/* Segment circles */}
                                {segments.map(seg => {
                                  if (seg.pct === 0) return null
                                  const offset = 100 - accumulated
                                  accumulated += seg.pct
                                  return (
                                    <circle
                                      key={seg.label}
                                      cx="21"
                                      cy="21"
                                      r="15.91549430918954"
                                      fill="transparent"
                                      stroke={seg.color}
                                      strokeWidth="4.2"
                                      strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                                      strokeDashoffset={offset}
                                      className="transition-all duration-300 hover:stroke-[5] cursor-pointer"
                                    />
                                  )
                                })}
                              </svg>

                              {/* Center text overlay */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">
                                  {totalCount}
                                </span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                  Total
                                </span>
                              </div>
                            </div>

                            {/* Legend section */}
                            <div className="w-full mt-6 space-y-2">
                              {segments.map(seg => (
                                <div
                                  key={seg.label}
                                  className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-gray-50/80 transition-colors duration-150 border border-transparent hover:border-gray-100"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${seg.bgClass}`} />
                                    <span className="font-semibold text-gray-700">{seg.label}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-bold text-gray-900">{seg.count}</span>
                                    <span className="text-gray-500 text-[10px] bg-gray-100 px-2 py-0.5 rounded font-semibold min-w-[36px] text-center">
                                      {seg.pct.toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 1: Practitioners ─────────────────────────────────────────────── */}
      {activeTab === 'practitioners' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                {practitionerStatus === 'PENDING_APPROVAL' ? 'Pending Applications' : 'Chiropractors'}
                <span>
                  {practitionerStatus === 'PENDING_APPROVAL'
                    ? 'Review and approve or reject new chiropractor accounts'
                    : `Showing chiropractors with status: ${practitionerStatus === 'ALL' ? 'All' : practitionerStatus.replace(/_/g, ' ')}`}
                </span>
              </h2>
              <div>
                <select
                  className="form-control form-select w-auto"
                  value={practitionerStatus}
                  onChange={e => setPractitionerStatus(e.target.value)}
                >
                  {PRACTITIONER_STATUSES.map(s => (
                    <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cardbody">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : practitioners.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No chiropractors found</p>
                  <p className="text-sm text-gray-400 mt-1">Try adjusting your filters.</p>
                </div>
              ) : (
                <div className="tabledesign filterno whitebg">
                  {/* DataTables Header Layout */}
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="dataTables_length">
                      <label className="d-flex align-items-center gap-2">
                        Show
                        <select
                          value={practitionerPageSize}
                          onChange={(e) => setPractitionerPageSize(Number(e.target.value))}
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
                          value={practitionerSearch}
                          onChange={(e) => setPractitionerSearch(e.target.value)}
                          className="form-control form-control-sm"
                          style={{ display: 'inline-block' }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table dt-responsive categories_table dataTable no-footer">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Practice Name</th>
                          <th>Location</th>
                          <th>Contact</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th>Registered</th>
                          <th style={{ textAlign: 'right', minWidth: '160px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPractitioners.map(p => {
                          const isExpanded = selectedId === p.id
                          const detail = detailCache[p.id]

                          return (
                            <Fragment key={p.id}>
                              <tr>
                                <td>
                                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                                    {p.first_name} {p.last_name}
                                    {p.is_flagged && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium border border-red-200">
                                        <ShieldAlert className="w-2.5 h-2.5" />
                                        Flagged
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="text-gray-700">{p.practice_name || '—'}</span>
                                </td>
                                <td>
                                  <span className="text-gray-600">{p.city || '—'}</span>
                                </td>
                                <td>
                                  <p className="text-xs text-gray-700 font-medium mb-0.5">{p.email}</p>
                                  {p.phone && <p className="text-xs text-gray-400 font-mono">{p.phone}</p>}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-44 rounded-full whitespace-nowrap capitalize ${(PRACTITIONER_STATUS_STYLES[p.status] || PRACTITIONER_STATUS_STYLES.PENDING_PROFILE).badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${(PRACTITIONER_STATUS_STYLES[p.status] || PRACTITIONER_STATUS_STYLES.PENDING_PROFILE).dot}`} />
                                    {p.status.replace(/_/g, ' ').toLowerCase()}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-xs text-gray-500">{fmtDate(p.created_at)}</span>
                                </td>
                                <td>
                                  <div className="flex gap-2 justify-end">
                                    <span
                                      onClick={() => toggleDetail(p.id)}
                                      className="cursor-pointer"
                                      aria-label="Toggle details"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="bg-gray-50 p-4 border-t border-gray-100">
                                    {detailLoading && !detail ? (
                                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading details…
                                      </div>
                                    ) : detail ? (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Practice</p>
                                            <p className="text-sm text-gray-800 font-semibold">
                                              {detail.practitioner.practice_name ?? <span className="text-gray-400 italic">Not provided</span>}
                                            </p>
                                            {(detail.practitioner.city || detail.practitioner.state) && (
                                              <p className="text-sm text-gray-500">
                                                {[detail.practitioner.city, detail.practitioner.state, detail.practitioner.zip_code].filter(Boolean).join(', ')}
                                              </p>
                                            )}
                                            <p className="text-sm text-gray-500 mt-1">
                                              <strong>Phone: </strong>{detail.practitioner.practice_phone || '—'}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                              <strong>Email: </strong>{detail.practitioner.practice_email || '—'}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                              <strong>Website: </strong>{detail.practitioner.website || '—'}
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                              <strong>Experience: </strong>{detail.practitioner.years_experience ? `${detail.practitioner.years_experience} years` : '—'}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                              <strong>Radius: </strong>{detail.practitioner.service_radius_km ? `${detail.practitioner.service_radius_km} km` : '—'}
                                            </p>
                                          </div>

                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Performance Stats</p>
                                            <div className="space-y-1 text-sm text-gray-700">
                                              <p><strong>Total Claims:</strong> {(detail.stats as any)?.total_claims ?? 0}</p>
                                              <p><strong>Total Completions:</strong> {(detail.stats as any)?.total_completions ?? 0}</p>
                                              <p><strong>Avg Patient Rating:</strong> {(detail.stats as any)?.avg_rating ? `${Number((detail.stats as any).avg_rating).toFixed(1)} / 5.0` : 'No reviews yet'}</p>
                                              <p className="text-red-600 font-semibold"><strong>Warning Count:</strong> {detail.practitioner.warning_count ?? 0}</p>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Wallet & Subscription Panel */}
                                        <div className="border border-gray-200 bg-white rounded-xl p-4 mt-2">
                                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                            <Coins className="w-4 h-4 text-primary-500" />
                                            Wallet & Subscription Management
                                          </h4>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Wallet Info & Adjust Buttons */}
                                            <div className="space-y-3">
                                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Token Wallet</p>
                                              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                  <span className="text-gray-400">Balance:</span>
                                                  <p className="text-base font-bold text-gray-900">{(detail as any).wallet?.balance ?? 0} tokens</p>
                                                </div>
                                                <div>
                                                  <span className="text-gray-400">Total Purchased:</span>
                                                  <p className="text-sm font-semibold text-gray-800">{(detail as any).wallet?.total_purchased ?? 0}</p>
                                                </div>
                                                <div className="mt-1">
                                                  <span className="text-gray-400">Total Allocated:</span>
                                                  <p className="text-sm font-semibold text-gray-800">{(detail as any).wallet?.total_allocated ?? 0}</p>
                                                </div>
                                                <div className="mt-1">
                                                  <span className="text-gray-400">Total Used:</span>
                                                  <p className="text-sm font-semibold text-gray-800">{(detail as any).wallet?.total_used ?? 0}</p>
                                                </div>
                                              </div>
                                              <button
                                                onClick={() => {
                                                  setWalletAdjustTarget(p)
                                                  setWalletAdjustAmount(0)
                                                  setWalletAdjustNotes('')
                                                  setWalletAdjustType('ADJUSTMENT')
                                                }}
                                                className="btn btn-secondary text-xs w-full py-1.5 flex items-center justify-center gap-1"
                                              >
                                                Adjust Token Balance
                                              </button>
                                            </div>

                                            {/* Subscription Info & Manage Buttons */}
                                            <div className="space-y-3">
                                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Subscription Status</p>
                                              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                                                <div className="flex justify-between">
                                                  <span className="text-gray-400">Plan:</span>
                                                  <span className="font-semibold text-gray-800">
                                                    {(detail as any).subscription?.plan_name || 'No Active Plan'}
                                                  </span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span className="text-gray-400">Status:</span>
                                                  <span className={`font-bold uppercase ${
                                                    (detail as any).subscription?.status === 'ACTIVE'
                                                      ? 'text-green-600'
                                                      : 'text-gray-400'
                                                  }`}>
                                                    {(detail as any).subscription?.status || 'NONE'}
                                                  </span>
                                                </div>
                                                {(detail as any).subscription?.current_period_end && (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-400">Current Period End:</span>
                                                    <span className="text-gray-600">
                                                      {fmtDate((detail as any).subscription.current_period_end)}
                                                    </span>
                                                  </div>
                                                )}
                                                {(detail as any).subscription?.cancelled_at && (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-400">Cancelled At:</span>
                                                    <span className="text-red-500 font-semibold">
                                                      {fmtDate((detail as any).subscription.cancelled_at)}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => {
                                                  setSubManageTarget(p)
                                                  setSubManageAction((detail as any).subscription?.status === 'ACTIVE' ? 'CHANGE_PLAN' : 'SUBSCRIBE')
                                                  setSubManagePlanId((detail as any).subscription?.plan_id || '')
                                                }}
                                                className="btn btn-secondary text-xs w-full py-1.5 flex items-center justify-center gap-1"
                                              >
                                                Manage Subscription
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        <div>
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Documents</p>
                                          {detail.documents.length === 0 ? (
                                            <p className="text-sm text-gray-400 italic">No documents uploaded yet</p>
                                          ) : (
                                            <ul className="space-y-1.5">
                                              {detail.documents.map(doc => (
                                                <li key={doc.id} className="flex items-center justify-between gap-3 text-sm bg-white p-2 rounded border">
                                                  <span className="text-gray-700">
                                                    {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type} — <span className="text-xs text-gray-400">{doc.original_filename}</span>
                                                  </span>
                                                  <button
                                                    onClick={() => downloadDocument(p.id, doc.id)}
                                                    disabled={downloadLoading === doc.id}
                                                    className="btn btn-secondary text-xs py-1 px-2 !inline-flex !items-center !justify-center gap-1.5 whitespace-nowrap"
                                                  >
                                                    {downloadLoading === doc.id
                                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                      : <ExternalLink className="w-3.5 h-3.5 shrink-0" />}
                                                    Download
                                                  </button>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>

                                        {detail.warnings && detail.warnings.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-red-600">Warning History</p>
                                            <ul className="space-y-1 text-xs bg-red-50 p-2 rounded border border-red-200">
                                              {detail.warnings.map((w: any, idx: number) => (
                                                <li key={idx} className="text-red-800">
                                                  <strong>{fmtDate(w.issued_at)}:</strong> {w.reason}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {/* Additional Action Buttons */}
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                                          {p.status === 'PENDING_APPROVAL' && (
                                            <>
                                              <button
                                                onClick={() => approve(p.id)}
                                                disabled={!!actionLoading}
                                                className="btn btn-success flex items-center gap-1 text-xs py-1.5 px-3"
                                              >
                                                Approve Application
                                              </button>
                                              <button
                                                onClick={() => { setRejectTarget(p.id); setRejectReason('') }}
                                                disabled={!!actionLoading}
                                                className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-xs py-1.5 px-3"
                                              >
                                                Reject Application
                                              </button>
                                            </>
                                          )}
                                          {p.status === 'REJECTED' && (
                                            <button
                                              onClick={() => approve(p.id)}
                                              disabled={!!actionLoading}
                                              className="btn btn-success flex items-center gap-1 text-xs py-1.5 px-3"
                                            >
                                              {actionLoading === p.id + ':approve'
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <CheckCircle className="w-3.5 h-3.5" />}
                                              Re-approve Application
                                            </button>
                                          )}
                                          {(p.status === 'PENDING_APPROVAL' || p.status === 'PROFILE_COMPLETED') && (
                                            <button
                                              onClick={() => { setInfoRequestTarget(p.id); setInfoRequestMessage('') }}
                                              disabled={!!actionLoading}
                                              className="btn btn-secondary text-xs py-1.5 px-3"
                                            >
                                              Request Additional Info
                                            </button>
                                          )}
                                          {p.status === 'ACTIVE' && (
                                            <>
                                              <button
                                                onClick={() => { setSuspendTarget(p.id); setSuspendReason('') }}
                                                disabled={!!actionLoading}
                                                className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-xs py-1.5 px-3"
                                              >
                                                Suspend Chiropractor
                                              </button>
                                              <button
                                                onClick={() => { setWarningTarget(p.id); setWarningReason('') }}
                                                disabled={!!actionLoading}
                                                className="btn btn-secondary text-xs py-1.5 px-3"
                                              >
                                                Issue Warning
                                              </button>
                                            </>
                                          )}
                                          {p.status === 'SUSPENDED' && (
                                            <button
                                              onClick={() => reactivatePractitioner(p.id)}
                                              disabled={!!actionLoading}
                                              className="btn btn-success text-xs py-1.5 px-3"
                                            >
                                              Reactivate Chiropractor
                                            </button>
                                          )}
                                          {(p.status === 'ACTIVE' || p.status === 'SUSPENDED') && (
                                            <button
                                              onClick={() => togglePractitionerFlag(p)}
                                              disabled={!!actionLoading}
                                              className={`btn btn-secondary text-xs py-1.5 px-3 ${p.is_flagged ? 'text-red-700 bg-red-50 border-red-300' : ''}`}
                                            >
                                              {p.is_flagged ? 'Remove Flag' : 'Flag Chiropractor'}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* DataTables Pagination & Info Footer */}
                  <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div className="dataTables_info">
                      Showing {startPractitionersIndex} to {endPractitionersIndex} of {totalPractitionersCount} entries
                    </div>
                    {totalPractitionersPages > 1 && (
                      <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                        <button
                          disabled={practitionerPage === 1}
                          onClick={() => setPractitionerPage(practitionerPage - 1)}
                          className="paginate_button previous bg-transparent px-2.5 py-1"
                          style={{
                            cursor: practitionerPage === 1 ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: practitionerPage === 1 ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Previous
                        </button>
                        <span>
                          {Array.from({ length: totalPractitionersPages }, (_, i) => i + 1).map((p) => (
                            <button
                              key={p}
                              onClick={() => setPractitionerPage(p)}
                              className={`paginate_button ${practitionerPage === p ? 'current text-white' : 'bg-transparent'}`}
                              style={{
                                cursor: 'pointer',
                                margin: '0 4px',
                                border: practitionerPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                borderRadius: '5px',
                                backgroundColor: practitionerPage === p ? '#0068b9' : 'transparent',
                                color: practitionerPage === p ? '#fff' : '#000',
                                padding: '4px 10px',
                                fontSize: '13px'
                              }}
                            >
                              {p}
                            </button>
                          ))}
                        </span>
                        <button
                          disabled={practitionerPage === totalPractitionersPages}
                          onClick={() => setPractitionerPage(practitionerPage + 1)}
                          className="paginate_button next bg-transparent px-2.5 py-1"
                          style={{
                            cursor: practitionerPage === totalPractitionersPages ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: practitionerPage === totalPractitionersPages ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Users ─────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                User Accounts
                <span>Manage users, view login history, and control status.</span>
              </h2>
            </div>

            <div className="cardbody">
                <div className="tabledesign filterno whitebg">
                  {/* DataTables Header Layout */}
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="dataTables_length">
                      <label className="d-flex align-items-center gap-2">
                        Show
                        <select
                          value={usersPageSize}
                          onChange={(e) => setUsersPageSize(Number(e.target.value))}
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
                          value={usersSearch}
                          onChange={(e) => setUsersSearch(e.target.value)}
                          className="form-control form-control-sm"
                          style={{ display: 'inline-block' }}
                        />
                      </label>
                    </div>
                  </div>

                  {usersLoading ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                    </div>
                  ) : users.length === 0 ? (
                    <div className="text-center py-12">
                      <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">No users found</p>
                    </div>
                  ) : (
                    <>
                      <div className="table-responsive">
                        <table className="table dt-responsive categories_table dataTable no-footer">
                          <thead>
                            <tr>
                              <th>User Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th style={{ textAlign: 'center' }}>Status</th>
                              <th>Last Login</th>
                              <th>Joined</th>
                              <th style={{ textAlign: 'center', minWidth: '220px' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedUsers.map((u) => (
                              <tr key={u.id}>
                                <td>
                                  <div className="font-semibold text-gray-900">
                                    {u.first_name} {u.last_name}
                                  </div>
                                </td>
                                <td>
                                  <span className="text-gray-600">{u.email}</span>
                                </td>
                                <td>
                                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium capitalize">
                                    {u.role}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-28 rounded-full whitespace-nowrap border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    {u.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-xs text-gray-500">{fmtDateTime(u.last_login_at)}</span>
                                </td>
                                <td>
                                  <span className="text-xs text-gray-500">{fmtDate(u.created_at)}</span>
                                </td>
                                <td>
                                  <div className="tdaction flex gap-3 justify-center items-center">
                                    <button
                                      onClick={() => {
                                        setAuditLogsSearch(u.id)
                                        setActiveTab('audit-logs')
                                      }}
                                      className="bg-transparent border-0 p-1 hover:opacity-80 transition-opacity"
                                      title="View Audit Logs"
                                    >
                                      <i className="la la-history text-lg text-primary" style={{ color: '#0068b9' }} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditUserTarget(u)
                                        setEditUserForm({
                                          first_name: u.first_name,
                                          last_name: u.last_name,
                                          email: u.email,
                                          phone: u.phone || '',
                                          role: u.role,
                                        })
                                      }}
                                      className="bg-transparent border-0 p-1 hover:opacity-80 transition-opacity"
                                      title="Edit User"
                                    >
                                      <i className="la la-edit text-lg text-primary" style={{ color: '#0068b9' }} />
                                    </button>
                                    <button
                                      onClick={() => toggleUserActive(u)}
                                      className="bg-transparent border-0 p-1 hover:opacity-80 transition-opacity"
                                      title={u.is_active ? 'Disable User' : 'Enable User'}
                                    >
                                      {u.is_active ? (
                                        <i className="la la-ban text-lg text-danger" style={{ color: '#dc2626' }} />
                                      ) : (
                                        <i className="la la-check-circle text-lg text-success" style={{ color: '#16a34a' }} />
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
                          Showing {startUsersIndex} to {endUsersIndex} of {totalUsersEntries} entries
                        </div>
                        {totalUsersPages > 1 && (
                          <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                            <button
                              disabled={usersPage === 1}
                              onClick={() => setUsersPage(usersPage - 1)}
                              className="paginate_button previous bg-transparent px-2.5 py-1"
                              style={{
                                cursor: usersPage === 1 ? 'not-allowed' : 'pointer',
                                border: '1px solid #cedcef',
                                borderRadius: '5px',
                                opacity: usersPage === 1 ? 0.5 : 1,
                                fontSize: '13px',
                              }}
                            >
                              Previous
                            </button>
                            <span>
                              {Array.from({ length: totalUsersPages }, (_, i) => i + 1).map((page) => (
                                <button
                                  key={page}
                                  onClick={() => setUsersPage(page)}
                                  className={`paginate_button ${usersPage === page ? 'current text-white' : 'bg-transparent'}`}
                                  style={{
                                    cursor: 'pointer',
                                    margin: '0 4px',
                                    border: usersPage === page ? '1px solid #0068b9' : '1px solid #cedcef',
                                    borderRadius: '5px',
                                    backgroundColor: usersPage === page ? '#0068b9' : 'transparent',
                                    color: usersPage === page ? '#fff' : '#000',
                                    padding: '4px 10px',
                                    fontSize: '13px'
                                  }}
                                >
                                  {page}
                                </button>
                              ))}
                            </span>
                            <button
                              disabled={usersPage === totalUsersPages}
                              onClick={() => setUsersPage(usersPage + 1)}
                              className="paginate_button next bg-transparent px-2.5 py-1"
                              style={{
                                cursor: usersPage === totalUsersPages ? 'not-allowed' : 'pointer',
                                border: '1px solid #cedcef',
                                borderRadius: '5px',
                                opacity: usersPage === totalUsersPages ? 0.5 : 1,
                                fontSize: '13px',
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
              </div>
            </div>
          </div>
        )}

      {/* ── TAB 3: Referrals ─────────────────────────────────────────────────── */}
      {activeTab === 'referrals' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                Referral Overview
                <span>Monitor and manage referral status and assignments.</span>
              </h2>
              <div>
                <select
                  className="form-control form-select w-auto"
                  value={referralStatus}
                  onChange={e => setReferralStatus(e.target.value)}
                >
                  {REFERRAL_STATUSES.map(s => (
                    <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cardbody">
              {referralsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No referrals found</p>
                </div>
              ) : (
                <div className="tabledesign filterno whitebg">
                  {/* DataTables Header Layout */}
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="dataTables_length">
                      <label className="d-flex align-items-center gap-2">
                        Show
                        <select
                          value={referralPageSize}
                          onChange={(e) => setReferralPageSize(Number(e.target.value))}
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
                          value={referralSearch}
                          onChange={(e) => setReferralSearch(e.target.value)}
                          className="form-control form-control-sm"
                          style={{ display: 'inline-block' }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table dt-responsive categories_table dataTable no-footer">
                      <thead>
                        <tr>
                          <th>Referral Number</th>
                          <th>Urgency</th>
                          <th>Complaint</th>
                          <th>Location</th>
                          <th>Assigned Chiropractor</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th>Created</th>
                          <th style={{ textAlign: 'right', minWidth: '120px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedReferrals.map(r => {
                          const isExpanded = expandedReferralId === r.id
                          const detail = referralDetail[r.id]
                          const statusStyle = REFERRAL_STATUS_STYLES[r.status] || REFERRAL_STATUS_STYLES.NEW

                          return (
                            <Fragment key={r.id}>
                              <tr>
                                <td>
                                  <span className="font-mono text-xs font-semibold text-gray-900">{r.referral_number}</span>
                                </td>
                                <td>
                                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                                    r.urgency_level === 'URGENT' ? 'bg-red-100 text-red-700' :
                                    r.urgency_level === 'HIGH' ? 'bg-yellow-100 text-yellow-700' :
                                    r.urgency_level === 'NORMAL' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {r.urgency_level}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-gray-900 font-semibold">{r.primary_complaint}</span>
                                </td>
                                <td>
                                  <span className="text-gray-600 text-xs">
                                    {[r.city, r.state].filter(Boolean).join(', ') || 'N/A'}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-gray-600 text-xs">{r.claimed_by_name || 'Unassigned'}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-48 rounded-full whitespace-nowrap capitalize ${statusStyle.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                    {r.status.replace(/_/g, ' ').toLowerCase()}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-xs text-gray-500">{fmtDate(r.created_at)}</span>
                                </td>
                                <td>
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => toggleReferral(r.id)}
                                      className="btn-details"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      {isExpanded ? 'Hide' : 'Details'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={8} className="bg-gray-50 p-4 border-t border-gray-100">
                                    {!detail ? (
                                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading details…
                                      </div>
                                    ) : (
                                      <div className="space-y-4 text-xs">
                                        {(detail.patient || detail.patient_name) && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Patient</p>
                                            <div className="flex flex-col gap-0 mt-0">
                                              {(detail.patient ? `${detail.patient.first_name} ${detail.patient.last_name}` : detail.patient_name) && (
                                                <p className="m-0 text-gray-800 font-medium">
                                                  {detail.patient ? `${detail.patient.first_name} ${detail.patient.last_name}` : detail.patient_name}
                                                </p>
                                              )}
                                              {(detail.patient?.phone || detail.patient_phone) && (
                                                <p className="m-0 text-gray-600">{detail.patient?.phone || detail.patient_phone}</p>
                                              )}
                                              {(detail.patient?.email || detail.patient_email) && (
                                                <p className="m-0 text-gray-600">{detail.patient?.email || detail.patient_email}</p>
                                              )}
                                              {(detail.patient ? [detail.patient.street_address, detail.patient.city, detail.patient.state, detail.patient.zip_code].filter(Boolean).join(', ') : detail.patient_address) && (
                                                <p className="m-0 text-gray-500">
                                                  {detail.patient ? [detail.patient.street_address, detail.patient.city, detail.patient.state, detail.patient.zip_code].filter(Boolean).join(', ') : detail.patient_address}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {detail.symptoms && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Symptoms</p>
                                            <p className="text-gray-700">{detail.symptoms}</p>
                                          </div>
                                        )}
                                        {(detail.duration_of_problem || detail.duration) && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Duration</p>
                                            <p className="text-gray-700">{detail.duration_of_problem || detail.duration}</p>
                                          </div>
                                        )}
                                        {detail.patient_problems && (detail.patient_problems as string[]).length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Problems Facing</p>
                                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                                              {(detail.patient_problems as string[]).map((prob) => (
                                                <span
                                                  key={prob}
                                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100"
                                                >
                                                  {prob}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {(detail.additional_notes || detail.notes) && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                                            <p className="text-gray-700">{detail.additional_notes || detail.notes}</p>
                                          </div>
                                        )}
                                        <div className="flex gap-2 pt-2 flex-wrap">
                                          <button type="button" className="btn btn-primary text-sm py-1.5 px-3" onClick={() => navigate(`/matches/${r.id}`)}>View matching profiles</button>
                                          {r.status !== 'CLOSED' && (
                                            <button
                                              onClick={() => closeReferral(r.id)}
                                              className="btn btn-secondary text-sm py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50"
                                            >
                                              Close Referral
                                            </button>
                                          )}
                                          {r.status === 'CLAIMED' && (
                                            <button
                                              onClick={() => {
                                                setReassignPractitionerId('')
                                                setReassignReason('')
                                                loadActivePractitioners()
                                              }}
                                              className="btn btn-secondary text-sm py-1.5 px-3"
                                            >
                                              Reassign Referral
                                            </button>
                                          )}
                                          {(r.status === 'OPEN' || r.status === 'CLOSED') && (
                                            <button
                                              onClick={() => {
                                                setExtendTarget(r)
                                                setExtendHours(24)
                                              }}
                                              className="btn btn-secondary text-sm py-1.5 px-3"
                                            >
                                              Extend Visibility
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* DataTables Pagination & Info Footer */}
                  <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div className="dataTables_info">
                      Showing {startReferralsIndex} to {endReferralsIndex} of {totalReferralsCount} entries
                    </div>
                    {totalReferralsPages > 1 && (
                      <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                        <button
                          disabled={referralPage === 1}
                          onClick={() => setReferralPage(referralPage - 1)}
                          className="paginate_button previous bg-transparent px-2.5 py-1"
                          style={{
                            cursor: referralPage === 1 ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: referralPage === 1 ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Previous
                        </button>
                        <span>
                          {Array.from({ length: totalReferralsPages }, (_, i) => i + 1).map((p) => (
                            <button
                              key={p}
                              onClick={() => setReferralPage(p)}
                              className={`paginate_button ${referralPage === p ? 'current text-white' : 'bg-transparent'}`}
                              style={{
                                cursor: 'pointer',
                                margin: '0 4px',
                                border: referralPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                borderRadius: '5px',
                                backgroundColor: referralPage === p ? '#0068b9' : 'transparent',
                                color: referralPage === p ? '#fff' : '#000',
                                padding: '4px 10px',
                                fontSize: '13px'
                              }}
                            >
                              {p}
                            </button>
                          ))}
                        </span>
                        <button
                          disabled={referralPage === totalReferralsPages}
                          onClick={() => setReferralPage(referralPage + 1)}
                          className="paginate_button next bg-transparent px-2.5 py-1"
                          style={{
                            cursor: referralPage === totalReferralsPages ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: referralPage === totalReferralsPages ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: Feedback & Compliance ──────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Feedback & Compliance</h2>
              <p className="text-sm text-gray-500 mt-0.5">Review patient reviews, ratings, and compliance reports.</p>
            </div>
            <div className="flex gap-2">
              <select
                className="form-control form-select w-auto text-sm"
                value={feedbackFilter}
                onChange={e => setFeedbackFilter(e.target.value as any)}
              >
                <option value="ALL">All Feedback</option>
                <option value="COMPLAINTS">Complaints (Rating ≤ 2)</option>
              </select>
            </div>
          </div>

          {feedbackLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : feedbackList.length === 0 ? (
            <div className="carddesign text-center py-12">
              <div className="cardbody">
                <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No feedback entries found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackList
                .filter(f => feedbackFilter === 'ALL' || f.rating_overall <= 2)
                .map((f: any) => (
                  <div key={f.id} className={`carddesign ${f.rating_overall <= 2 ? 'border-red-200 bg-red-50/20' : ''}`}>
                    <div className="cardbody">
                      <div className="flex justify-between items-start gap-4 mb-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            Referral #${f.referral_number} — Patient: ${f.patient_first_name} ${f.patient_last_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Practitioner: ${f.practitioner_first_name} ${f.practitioner_last_name} (${f.practice_name})
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-bold ${
                            f.rating_overall >= 4 ? 'bg-green-100 text-green-700' : f.rating_overall === 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            Overall: {f.rating_overall} / 5
                          </span>
                          <p className="text-[10px] text-gray-400 mt-1">{fmtDate(f.submitted_at)}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 py-2 border-y my-2 text-xs text-gray-600 bg-white p-2 rounded">
                        <div><strong>Comm:</strong> {f.rating_communication}/5</div>
                        <div><strong>Prof:</strong> {f.rating_professionalism}/5</div>
                        <div><strong>Service:</strong> {f.rating_service}/5</div>
                      </div>

                      {f.comments && (
                        <p className="text-sm text-gray-700 italic bg-gray-50 p-2.5 rounded border mt-2">
                          "{f.comments}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Enquiries ───────────────────────────────────────────────────── */}
      {activeTab === 'enquiries' && (
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Enquiries / Support Messages</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Contact messages submitted by chiropractors via the Support form. Total: {enquiriesTotal}
              </p>
            </div>
          </div>

          {enquiriesLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : enquiries.length === 0 ? (
            <div className="carddesign text-center py-12">
              <div className="cardbody">
                <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No enquiries yet</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {enquiries.map((msg: any) => (
                <div key={msg.id} className="carddesign">
                  <div className="cardbody">
                    <div className="flex justify-between items-start gap-4 mb-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{msg.name}</p>
                        <p className="text-xs text-gray-500">
                          <a href={`mailto:${msg.email}`} className="text-blue-600 hover:underline">{msg.email}</a>
                          {msg.phone && <span className="ml-2 text-gray-400">· {msg.phone}</span>}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDateTime(msg.created_at)}</p>
                    </div>
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border mt-2 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {enquiriesTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={enquiriesPage <= 1}
                    onClick={() => { const p = enquiriesPage - 1; setEnquiriesPage(p); loadEnquiries(p) }}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {enquiriesPage} of {enquiriesTotalPages}
                  </span>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={enquiriesPage >= enquiriesTotalPages}
                    onClick={() => { const p = enquiriesPage + 1; setEnquiriesPage(p); loadEnquiries(p) }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: Settings ──────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">System Settings</h2>
              <p className="text-sm text-gray-500 mt-0.5">Configure platform parameters and limits.</p>
            </div>
          </div>

          {settingsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="carddesign">
              <div className="cardbody space-y-4">
                {Object.entries(settings).map(([key, setting]) => (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4 last:border-b-0 last:pb-0 items-center">
                    <div>
                      <span className="font-mono text-sm font-semibold text-gray-800">{key}</span>
                      <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
                    </div>
                    <div className="md:col-span-2 flex items-center h-10">
                      {typeof setting.value === 'boolean' ? (
                        <input
                          type="checkbox"
                          className="form-check-input w-5 h-5 cursor-pointer"
                          style={{
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            border: '1px solid #cedcef'
                          }}
                          checked={setting.value}
                          onChange={e => {
                            const val = e.target.checked
                            setSettings(prev => ({
                              ...prev,
                              [key]: { ...prev[key], value: val }
                            }))
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          className="form-control text-sm w-full"
                          value={
                            typeof setting.value === 'object'
                              ? JSON.stringify(setting.value)
                              : setting.value ?? ''
                          }
                          onChange={e => {
                            let val: any = e.target.value
                            try {
                              if (val.startsWith('{') || val.startsWith('[')) {
                                val = JSON.parse(val)
                              }
                            } catch {}
                            setSettings(prev => ({
                              ...prev,
                              [key]: { ...prev[key], value: val }
                            }))
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => {
                      const updates = Object.fromEntries(
                        Object.entries(settings).map(([k, s]) => {
                          let val = s.value;
                          if (val === 'true') val = true;
                          if (val === 'false') val = false;
                          return [k, val];
                        })
                      )
                      saveSettings(updates)
                    }}
                    disabled={savingSettings}
                    className="btn btn-info flex items-center gap-2"
                  >
                    {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6a: Subscription Plans ────────────────────────────────────────── */}
      {activeTab === 'plans' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                Subscription Plans
                <span>Manage subscription products and pricing levels.</span>
              </h2>
              <button
                onClick={() => {
                  setSelectedPlan(null)
                  setPlanForm({
                    name: '',
                    description: '',
                    monthly_price_cents: 0,
                    included_tokens: 0,
                    stripe_price_id: '',
                    is_active: true,
                    sort_order: 0,
                  })
                  setPlanModalOpen(true)
                }}
                className="btn btn-info flex items-center"
              >
                <i className="la la-plus" style={{ marginRight: '6px' }}></i>
                Add Plan
              </button>
            </div>

            <div className="cardbody">
              {plansLoading && plans.length === 0 ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                  <div className="tabledesign filterno whitebg">
                    {/* DataTables Header Layout */}
                    <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                      <div className="dataTables_length">
                        <label className="d-flex align-items-center gap-2">
                          Show
                          <select
                            value={planPageSize}
                            onChange={(e) => setPlanPageSize(Number(e.target.value))}
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
                            value={planSearch}
                            onChange={(e) => setPlanSearch(e.target.value)}
                            className="form-control form-control-sm"
                            style={{ display: 'inline-block' }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table dt-responsive categories_table dataTable no-footer">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Monthly Price</th>
                            <th>Included Tokens</th>
                            <th>Stripe Price ID</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th>Order</th>
                            <th style={{ textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedPlans.map((p: any) => (
                            <tr key={p.id}>
                              <td>
                                <div className="font-semibold text-gray-900">{p.name}</div>
                                <div className="text-xs text-gray-500 max-w-xs truncate">{p.description || 'No description'}</div>
                              </td>
                              <td className="font-semibold text-gray-800">
                                ${(p.monthly_price_cents / 100).toFixed(2)}
                              </td>
                              <td className="font-medium text-gray-700">
                                {p.included_tokens} tokens
                              </td>
                              <td className="font-mono text-xs text-gray-400">
                                {p.stripe_price_id}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-28 rounded-full whitespace-nowrap border ${
                                  p.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  {p.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="text-gray-500 text-xs">{p.sort_order}</td>
                              <td>
                                <div className="tdaction flex gap-3 justify-center items-center">
                                  <button
                                    onClick={() => {
                                      setSelectedPlan(p)
                                      setPlanForm({
                                        name: p.name,
                                        description: p.description || '',
                                        monthly_price_cents: p.monthly_price_cents,
                                        included_tokens: p.included_tokens,
                                        stripe_price_id: p.stripe_price_id,
                                        is_active: p.is_active,
                                        sort_order: p.sort_order,
                                      })
                                      setPlanModalOpen(true)
                                    }}
                                    className="bg-transparent border-0 p-1 hover:opacity-80 transition-opacity"
                                    title="Edit Plan"
                                  >
                                    <i className="la la-edit text-lg text-primary" style={{ color: '#0068b9' }} />
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
                        Showing {startPlansIndex} to {endPlansIndex} of {totalPlansCount} entries
                      </div>
                      {totalPlansPages > 1 && (
                        <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                          <button
                            disabled={planPage === 1}
                            onClick={() => setPlanPage(planPage - 1)}
                            className="paginate_button previous bg-transparent px-2.5 py-1"
                            style={{
                              cursor: planPage === 1 ? 'not-allowed' : 'pointer',
                              border: '1px solid #cedcef',
                              borderRadius: '5px',
                              opacity: planPage === 1 ? 0.5 : 1,
                              fontSize: '13px',
                            }}
                          >
                            Previous
                          </button>
                          <span>
                            {Array.from({ length: totalPlansPages }, (_, i) => i + 1).map((p) => (
                              <button
                                key={p}
                                onClick={() => setPlanPage(p)}
                                className={`paginate_button ${planPage === p ? 'current text-white' : 'bg-transparent'}`}
                                style={{
                                  cursor: 'pointer',
                                  margin: '0 4px',
                                  border: planPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                  borderRadius: '5px',
                                  backgroundColor: planPage === p ? '#0068b9' : 'transparent',
                                  color: planPage === p ? '#fff' : '#000',
                                  padding: '4px 10px',
                                  fontSize: '13px'
                                }}
                              >
                                {p}
                              </button>
                            ))}
                          </span>
                          <button
                            disabled={planPage === totalPlansPages}
                            onClick={() => setPlanPage(planPage + 1)}
                            className="paginate_button next bg-transparent px-2.5 py-1"
                            style={{
                              cursor: planPage === totalPlansPages ? 'not-allowed' : 'pointer',
                              border: '1px solid #cedcef',
                              borderRadius: '5px',
                              opacity: planPage === totalPlansPages ? 0.5 : 1,
                              fontSize: '13px',
                            }}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* Add/Edit Subscription Plan Modal */}
          {planModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="carddesign w-full max-w-md">
                <div className="cardbody">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {selectedPlan ? 'Edit Subscription Plan' : 'Create New Subscription Plan'}
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Modify billing configurations. Stripe Price ID must align with Stripe dashboard definitions.
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Plan Name *</label>
                      <input
                        type="text"
                        className="form-control text-sm"
                        placeholder="e.g. Starter, Premium"
                        value={planForm.name}
                        disabled={selectedPlan?.name === 'Free'}
                        onChange={e => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                      <textarea
                        className="form-control text-sm h-16 resize-none"
                        placeholder="Plan features summary..."
                        value={planForm.description}
                        disabled={selectedPlan?.name === 'Free'}
                        onChange={e => setPlanForm(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Monthly Price ($) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control text-sm"
                          placeholder="49.00"
                          value={planForm.monthly_price_cents !== undefined && planForm.monthly_price_cents !== null ? planForm.monthly_price_cents / 100 : ''}
                          disabled={selectedPlan?.name === 'Free'}
                          onChange={e => {
                            const dollars = parseFloat(e.target.value) || 0;
                            setPlanForm(prev => ({ ...prev, monthly_price_cents: Math.round(dollars * 100) }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Included Tokens *</label>
                        <input
                          type="number"
                          min="0"
                          className="form-control text-sm"
                          placeholder="10"
                          value={planForm.included_tokens || ''}
                          onChange={e => setPlanForm(prev => ({ ...prev, included_tokens: parseInt(e.target.value, 10) || 0 }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Stripe Price ID *</label>
                      <input
                        type="text"
                        className="form-control text-sm font-mono"
                        placeholder="price_..."
                        value={planForm.stripe_price_id}
                        disabled={selectedPlan?.name === 'Free'}
                        onChange={e => setPlanForm(prev => ({ ...prev, stripe_price_id: e.target.value }))}
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        If running in mock mode, you can type any placeholder (e.g. price_starter_placeholder).
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className={`flex items-center gap-2 text-xs text-gray-700 ${selectedPlan?.name === 'Free' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                          checked={planForm.is_active}
                          disabled={selectedPlan?.name === 'Free'}
                          onChange={e => setPlanForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        />
                        Plan Active
                      </label>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Display Order</label>
                        <input
                          type="number"
                          className="form-control text-xs py-1"
                          value={planForm.sort_order}
                          disabled={selectedPlan?.name === 'Free'}
                          onChange={e => setPlanForm(prev => ({ ...prev, sort_order: parseInt(e.target.value, 10) || 0 }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={handleSavePlan}
                      disabled={plansLoading}
                      className="btn btn-info flex-1 flex items-center justify-center gap-2"
                    >
                      {plansLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Plan
                    </button>
                    <button
                      onClick={() => setPlanModalOpen(false)}
                      className="btn btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6b: Token Packages ────────────────────────────────────────────── */}
      {activeTab === 'packages' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                Token Packages
                <span>Manage standalone token packages available for purchase.</span>
              </h2>
              <button
                onClick={() => {
                  setSelectedPackage(null)
                  setPackageForm({
                    token_count: 0,
                    price_cents: 0,
                    stripe_price_id: '',
                    is_active: true,
                    sort_order: 0,
                  })
                  setPackageModalOpen(true)
                }}
                className="btn btn-info flex items-center"
              >
                <i className="la la-plus" style={{ marginRight: '6px' }}></i>
                Add Package
              </button>
            </div>

            <div className="cardbody">
              {packagesLoading && packages.length === 0 ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                  <div className="tabledesign filterno whitebg">
                    {/* DataTables Header Layout */}
                    <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                      <div className="dataTables_length">
                        <label className="d-flex align-items-center gap-2">
                          Show
                          <select
                            value={packagePageSize}
                            onChange={(e) => setPackagePageSize(Number(e.target.value))}
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
                            value={packageSearch}
                            onChange={(e) => setPackageSearch(e.target.value)}
                            className="form-control form-control-sm"
                            style={{ display: 'inline-block' }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table dt-responsive categories_table dataTable no-footer">
                        <thead>
                          <tr>
                            <th>Token Count</th>
                            <th>Price (USD)</th>
                            <th>Stripe Price ID</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th>Order</th>
                            <th style={{ textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedPackages.map((pkg: any) => (
                            <tr key={pkg.id}>
                              <td className="font-semibold text-gray-900">
                                {pkg.token_count} tokens
                              </td>
                              <td className="font-semibold text-gray-800">
                                ${(pkg.price_cents / 100).toFixed(2)}
                              </td>
                              <td className="font-mono text-xs text-gray-400">
                                {pkg.stripe_price_id}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-28 rounded-full whitespace-nowrap border ${
                                  pkg.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pkg.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  {pkg.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="text-gray-500 text-xs">{pkg.sort_order}</td>
                              <td>
                                <div className="tdaction flex gap-3 justify-center items-center">
                                  <button
                                    onClick={() => {
                                      setSelectedPackage(pkg)
                                      setPackageForm({
                                        token_count: pkg.token_count,
                                        price_cents: pkg.price_cents,
                                        stripe_price_id: pkg.stripe_price_id,
                                        is_active: pkg.is_active,
                                        sort_order: pkg.sort_order,
                                      })
                                      setPackageModalOpen(true)
                                    }}
                                    className="bg-transparent border-0 p-1 hover:opacity-80 transition-opacity"
                                    title="Edit Package"
                                  >
                                    <i className="la la-edit text-lg text-primary" style={{ color: '#0068b9' }} />
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
                        Showing {startPackagesIndex} to {endPackagesIndex} of {totalPackagesCount} entries
                      </div>
                      {totalPackagesPages > 1 && (
                        <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                          <button
                            disabled={packagePage === 1}
                            onClick={() => setPackagePage(packagePage - 1)}
                            className="paginate_button previous bg-transparent px-2.5 py-1"
                            style={{
                              cursor: packagePage === 1 ? 'not-allowed' : 'pointer',
                              border: '1px solid #cedcef',
                              borderRadius: '5px',
                              opacity: packagePage === 1 ? 0.5 : 1,
                              fontSize: '13px',
                            }}
                          >
                            Previous
                          </button>
                          <span>
                            {Array.from({ length: totalPackagesPages }, (_, i) => i + 1).map((p) => (
                              <button
                                key={p}
                                onClick={() => setPackagePage(p)}
                                className={`paginate_button ${packagePage === p ? 'current text-white' : 'bg-transparent'}`}
                                style={{
                                  cursor: 'pointer',
                                  margin: '0 4px',
                                  border: packagePage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                  borderRadius: '5px',
                                  backgroundColor: packagePage === p ? '#0068b9' : 'transparent',
                                  color: packagePage === p ? '#fff' : '#000',
                                  padding: '4px 10px',
                                  fontSize: '13px'
                                }}
                              >
                                {p}
                              </button>
                            ))}
                          </span>
                          <button
                            disabled={packagePage === totalPackagesPages}
                            onClick={() => setPackagePage(packagePage + 1)}
                            className="paginate_button next bg-transparent px-2.5 py-1"
                            style={{
                              cursor: packagePage === totalPackagesPages ? 'not-allowed' : 'pointer',
                              border: '1px solid #cedcef',
                              borderRadius: '5px',
                              opacity: packagePage === totalPackagesPages ? 0.5 : 1,
                              fontSize: '13px',
                            }}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* Add/Edit Token Package Modal */}
          {packageModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="carddesign w-full max-w-md">
                <div className="cardbody">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {selectedPackage ? 'Edit Token Package' : 'Create New Token Package'}
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Modify billing configurations for standalone token packages.
                  </p>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Token Count *</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control text-sm"
                          placeholder="10"
                          value={packageForm.token_count || ''}
                          onChange={e => setPackageForm(prev => ({ ...prev, token_count: parseInt(e.target.value, 10) || 0 }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Price (USD) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control text-sm"
                          placeholder="15.00"
                          value={packageForm.price_cents ? packageForm.price_cents / 100 : ''}
                          onChange={e => {
                            const dollars = parseFloat(e.target.value) || 0;
                            setPackageForm(prev => ({ ...prev, price_cents: Math.round(dollars * 100) }));
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Stripe Price ID *</label>
                      <input
                        type="text"
                        className="form-control text-sm font-mono"
                        placeholder="price_..."
                        value={packageForm.stripe_price_id}
                        onChange={e => setPackageForm(prev => ({ ...prev, stripe_price_id: e.target.value }))}
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        If running in mock mode, you can type any placeholder (e.g. price_tokens_10_placeholder).
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={packageForm.is_active}
                          onChange={e => setPackageForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        />
                        Package Active
                      </label>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Display Order</label>
                        <input
                          type="number"
                          className="form-control text-xs py-1"
                          value={packageForm.sort_order}
                          onChange={e => setPackageForm(prev => ({ ...prev, sort_order: parseInt(e.target.value, 10) || 0 }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={handleSavePackage}
                      disabled={packagesLoading}
                      className="btn btn-info flex-1 flex items-center justify-center gap-2"
                    >
                      {packagesLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Package
                    </button>
                    <button
                      onClick={() => setPackageModalOpen(false)}
                      className="btn btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 7: Audit Logs ────────────────────────────────────────────────── */}
      {activeTab === 'audit-logs' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                Audit Logs
                <span>Tamper-evident log of administrative and platform actions.</span>
              </h2>
            </div>

            <div className="cardbody">
              {auditLogsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No audit logs found</p>
                </div>
              ) : (
                <div className="tabledesign filterno whitebg">
                  {/* DataTables Header Layout */}
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="dataTables_length">
                      <label className="d-flex align-items-center gap-2">
                        Show
                        <select
                          value={auditLogsPageSize}
                          onChange={(e) => setAuditLogsPageSize(Number(e.target.value))}
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
                          value={auditLogsSearch}
                          onChange={(e) => setAuditLogsSearch(e.target.value)}
                          className="form-control form-control-sm"
                          style={{ display: 'inline-block' }}
                          placeholder="Search logs..."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table dt-responsive categories_table dataTable no-footer">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                          <th>User ID</th>
                          <th>Resource Type</th>
                          <th>Resource ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedAuditLogs.map((log: any) => {
                          const styles = getAuditActionStyles(log.action);
                          return (
                            <tr key={log.id}>
                              <td><span className="font-medium text-gray-900">{fmtDateTime(log.occurred_at)}</span></td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-52 rounded-full whitespace-nowrap border capitalize ${styles.badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                                  {log.action.replace(/_/g, ' ').toLowerCase()}
                                </span>
                              </td>
                              <td><span className="font-mono text-xs text-gray-400">{log.user_id || 'system'}</span></td>
                              <td><span className="text-gray-600 font-medium capitalize">{log.entity_type}</span></td>
                              <td><span className="font-mono text-xs text-gray-400">{log.entity_id || '—'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* DataTables Pagination & Info Footer */}
                  <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div className="dataTables_info">
                      Showing {startAuditLogsIndex} to {endAuditLogsIndex} of {totalAuditLogsCount} entries
                    </div>
                    {totalAuditLogsPages > 1 && (
                      <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                        <button
                          disabled={auditLogsPage === 1}
                          onClick={() => setAuditLogsPage(auditLogsPage - 1)}
                          className="paginate_button previous bg-transparent px-2.5 py-1"
                          style={{
                            cursor: auditLogsPage === 1 ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: auditLogsPage === 1 ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Previous
                        </button>
                        <span>
                          {Array.from({ length: totalAuditLogsPages }, (_, i) => i + 1).map((p) => (
                            <button
                              key={p}
                              onClick={() => setAuditLogsPage(p)}
                              className={`paginate_button ${auditLogsPage === p ? 'current text-white' : 'bg-transparent'}`}
                              style={{
                                cursor: 'pointer',
                                margin: '0 4px',
                                border: auditLogsPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                                borderRadius: '5px',
                                backgroundColor: auditLogsPage === p ? '#0068b9' : 'transparent',
                                color: auditLogsPage === p ? '#fff' : '#000',
                                padding: '4px 10px',
                                fontSize: '13px'
                              }}
                            >
                              {p}
                            </button>
                          ))}
                        </span>
                        <button
                          disabled={auditLogsPage === totalAuditLogsPages}
                          onClick={() => setAuditLogsPage(auditLogsPage + 1)}
                          className="paginate_button next bg-transparent px-2.5 py-1"
                          style={{
                            cursor: auditLogsPage === totalAuditLogsPages ? 'not-allowed' : 'pointer',
                            border: '1px solid #cedcef',
                            borderRadius: '5px',
                            opacity: auditLogsPage === totalAuditLogsPages ? 0.5 : 1,
                            fontSize: '13px',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 8: Transactions ──────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="max-w-5xl mx-auto">
          <div className="carddesign">
            <div className="cardheading align-items-center">
              <h2>
                Platform Transactions
                <span>Live token transactions ledger across all practitioner accounts.</span>
              </h2>
            </div>

            <div className="cardbody">
              {platformTxLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : platformTxList.length === 0 ? (
                <div className="text-center py-12">
                  <Coins className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No transactions found</p>
                </div>
              ) : (
                <div className="tabledesign filterno whitebg">
                  {/* DataTables Header Layout */}
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="dataTables_length">
                      <label className="d-flex align-items-center gap-2">
                        Show
                        <select
                          value={transactionPageSize}
                          onChange={(e) => setTransactionPageSize(Number(e.target.value))}
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
                          value={transactionSearch}
                          onChange={(e) => setTransactionSearch(e.target.value)}
                          className="form-control form-control-sm"
                          style={{ display: 'inline-block' }}
                          placeholder="Search transactions..."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table dt-responsive categories_table dataTable no-footer">
                      <thead>
                        <tr>
                          <th className="px-2 py-1">Date & Time</th>
                          <th className="px-2 py-1">Chiropractor</th>
                          <th className="px-2 py-1">Type</th>
                          <th className="px-2 py-1" style={{ textAlign: 'right' }}>Amount</th>
                          <th className="px-2 py-1" style={{ textAlign: 'right' }}>Balance After</th>
                          <th className="px-2 py-1">Notes</th>
                        </tr>
                      </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedTransactions.map((tx: any) => {
                      const isPositive = tx.amount > 0
                      const TYPE_LABELS: Record<string, string> = {
                        PURCHASE: 'Token Purchase',
                        MONTHLY_ALLOCATION: 'Monthly Allocation',
                        REFERRAL_CLAIM: 'Referral Claim',
                        REFUND: 'Refund',
                        ADJUSTMENT: 'Adjustment',
                        EXPIRY: 'Token Expiry',
                      }
                      return (
                        <tr key={tx.id}>
                          <td className="px-2 py-1 whitespace-nowrap">
                            <span className="font-medium text-gray-900 whitespace-nowrap">
                              {fmtDateTime(tx.created_at)}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <p className="font-semibold text-gray-900 mb-0.5">
                              {tx.first_name} {tx.last_name}
                            </p>
                          </td>
                          <td>
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${
                              tx.transaction_type === 'PURCHASE'
                                ? 'bg-green-100 text-green-700'
                                : tx.transaction_type === 'REFERRAL_CLAIM'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
                            </span>
                          </td>
                          <td className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{tx.amount}
                          </td>
                          <td className="text-right font-medium text-gray-700">
                            {tx.balance_after}
                          </td>
                          <td className="text-gray-500 text-xs max-w-xs truncate">
                            {tx.notes || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* DataTables Pagination & Info Footer */}
              <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                <div className="dataTables_info">
                  Showing {startTransactionsIndex} to {endTransactionsIndex} of {totalTransactionsCount} entries
                  {platformTxHasMore && (
                    <button
                      onClick={() => loadPlatformTransactions(platformTxCursor || undefined)}
                      disabled={platformTxLoadingMore}
                      className="btn btn-link btn-sm text-primary ms-3 p-0 border-0 align-baseline"
                      style={{ fontSize: '13px' }}
                    >
                      {platformTxLoadingMore ? 'Loading older transactions...' : 'Load more from server'}
                    </button>
                  )}
                </div>
                {totalTransactionsPages > 1 && (
                  <div className="dataTables_paginate paging_simple_numbers d-flex align-items-center gap-1">
                    <button
                      disabled={transactionPage === 1}
                      onClick={() => setTransactionPage(transactionPage - 1)}
                      className="paginate_button previous bg-transparent px-2.5 py-1"
                      style={{
                        cursor: transactionPage === 1 ? 'not-allowed' : 'pointer',
                        border: '1px solid #cedcef',
                        borderRadius: '5px',
                        opacity: transactionPage === 1 ? 0.5 : 1,
                        fontSize: '13px',
                      }}
                    >
                      Previous
                    </button>
                    <span>
                      {Array.from({ length: totalTransactionsPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setTransactionPage(p)}
                          className={`paginate_button ${transactionPage === p ? 'current text-white' : 'bg-transparent'}`}
                          style={{
                            cursor: 'pointer',
                            margin: '0 4px',
                            border: transactionPage === p ? '1px solid #0068b9' : '1px solid #cedcef',
                            borderRadius: '5px',
                            backgroundColor: transactionPage === p ? '#0068b9' : 'transparent',
                            color: transactionPage === p ? '#fff' : '#000',
                            padding: '4px 10px',
                            fontSize: '13px'
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </span>
                    <button
                      disabled={transactionPage === totalTransactionsPages}
                      onClick={() => setTransactionPage(transactionPage + 1)}
                      className="paginate_button next bg-transparent px-2.5 py-1"
                      style={{
                        cursor: transactionPage === totalTransactionsPages ? 'not-allowed' : 'pointer',
                        border: '1px solid #cedcef',
                        borderRadius: '5px',
                        opacity: transactionPage === totalTransactionsPages ? 0.5 : 1,
                        fontSize: '13px',
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Reject Application</h3>
              <p className="text-sm text-gray-500 mb-4">Provide a reason — this will be sent to the applicant.</p>
              <textarea
                className="form-control h-24 resize-none"
                placeholder="e.g. Missing license documentation, incomplete information…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={reject}
                  disabled={!rejectReason.trim() || !!actionLoading}
                  className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':reject') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Reject
                </button>
                <button
                  onClick={() => setRejectTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Edit User Profile</h3>
              <p className="text-sm text-gray-500 mb-4">Modify the user details below.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">First Name</label>
                  <input
                    type="text"
                    className="form-control text-sm"
                    value={editUserForm.first_name}
                    onChange={e => setEditUserForm(prev => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    className="form-control text-sm"
                    value={editUserForm.last_name}
                    onChange={e => setEditUserForm(prev => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    className="form-control text-sm"
                    value={editUserForm.email}
                    onChange={e => setEditUserForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Phone Number</label>
                  <input
                    type="text"
                    className="form-control text-sm"
                    value={editUserForm.phone}
                    onChange={e => setEditUserForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
                  <select
                    className="form-control text-sm"
                    value={editUserForm.role}
                    onChange={e => setEditUserForm(prev => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="chiropractor">Chiropractor</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={editUser}
                  disabled={!editUserForm.first_name || !editUserForm.last_name || !editUserForm.email || !!actionLoading}
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':edit') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
                <button
                  onClick={() => setEditUserTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Info Modal */}
      {infoRequestTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Request Additional Information</h3>
              <p className="text-sm text-gray-500 mb-4">Send a message to the chiropractor requesting info or updates.</p>
              <textarea
                className="form-control h-24 resize-none"
                placeholder="Please specify which documents or fields need correction..."
                value={infoRequestMessage}
                onChange={e => setInfoRequestMessage(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={requestInfo}
                  disabled={!infoRequestMessage.trim() || !!actionLoading}
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':request-info') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send Request
                </button>
                <button
                  onClick={() => setInfoRequestTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue Warning Modal */}
      {warningTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Issue Compliance Warning</h3>
              <p className="text-sm text-gray-500 mb-4">Record a formal warning with the reason.</p>
              <textarea
                className="form-control h-24 resize-none text-sm"
                placeholder="Specify the reason for issuing the warning..."
                value={warningReason}
                onChange={e => setWarningReason(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={issueWarning}
                  disabled={!warningReason.trim() || !!actionLoading}
                  className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':warn') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Issue Warning
                </button>
                <button
                  onClick={() => setWarningTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-red-600 mb-1">Suspend Chiropractor</h3>
              <p className="text-sm text-gray-500 mb-4">Enter the reason for suspension. The chiropractor will lose access to new referrals immediately.</p>
              <textarea
                className="form-control h-24 resize-none text-sm"
                placeholder="Specify suspension reason..."
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={suspendPractitioner}
                  disabled={!suspendReason.trim() || !!actionLoading}
                  className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':suspend') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Suspend
                </button>
                <button
                  onClick={() => setSuspendTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Referral Modal */}
      {reassignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Reassign Referral</h3>
              <p className="text-sm text-gray-500 mb-4">Select an active chiropractor to reassign Referral #{reassignTarget.referral_number} to.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">New Assignee (Active Chiropractor)</label>
                  {loadingPractitioners ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading practitioners...
                    </div>
                  ) : (
                    <select
                      className="form-control text-sm"
                      value={reassignPractitionerId}
                      onChange={e => setReassignPractitionerId(e.target.value)}
                    >
                      <option value="">-- Select Chiropractor --</option>
                      {activePractitioners.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.first_name} {p.last_name} ({p.practice_name || p.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Reassignment Reason</label>
                  <textarea
                    className="form-control h-20 resize-none text-sm"
                    placeholder="Specify the reason..."
                    value={reassignReason}
                    onChange={e => setReassignReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={reassignReferral}
                  disabled={!reassignPractitionerId || !reassignReason.trim() || !!actionLoading}
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':reassign') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Reassign
                </button>
                <button
                  onClick={() => setReassignTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extend Expiry Modal */}
      {extendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-sm">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Extend Referral Visibility</h3>
              <p className="text-sm text-gray-500 mb-4">Extend visibility for Referral #{extendTarget.referral_number}.</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Extend By (Hours)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  className="form-control text-sm"
                  value={extendHours}
                  onChange={e => setExtendHours(Math.max(1, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={extendReferral}
                  disabled={!!actionLoading}
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':extend') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Extend Expiry
                </button>
                <button
                  onClick={() => setExtendTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Adjust Modal */}
      {walletAdjustTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Adjust Chiropractor Token Balance</h3>
              <p className="text-sm text-gray-500 mb-4">
                Manually add or deduct tokens for {walletAdjustTarget.first_name} {walletAdjustTarget.last_name}.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Adjustment Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="wallet-adjust-type"
                        checked={walletAdjustType === 'ADJUSTMENT'}
                        onChange={() => setWalletAdjustType('ADJUSTMENT')}
                      />
                      Manual Adjustment
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="wallet-adjust-type"
                        checked={walletAdjustType === 'REFUND'}
                        onChange={() => setWalletAdjustType('REFUND')}
                      />
                      Token Refund
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Amount (Use positive number to add, negative to deduct)
                  </label>
                  <input
                    type="number"
                    className="form-control text-sm"
                    placeholder="e.g. 10 or -5"
                    value={walletAdjustAmount || ''}
                    onChange={e => setWalletAdjustAmount(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Notes / Reason</label>
                  <textarea
                    className="form-control h-20 resize-none text-sm"
                    placeholder="Reason for balance update..."
                    value={walletAdjustNotes}
                    onChange={e => setWalletAdjustNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={adjustPractitionerWallet}
                  disabled={walletAdjustAmount === 0 || !walletAdjustNotes.trim() || !!actionLoading}
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':wallet-adjust') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Adjust
                </button>
                <button
                  onClick={() => setWalletAdjustTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Manage Modal */}
      {subManageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="carddesign w-full max-w-md">
            <div className="cardbody">
              <h3 className="font-semibold text-gray-900 mb-1">Manage Subscription</h3>
              <p className="text-sm text-gray-500 mb-4">
                Manage subscription state for {subManageTarget.first_name} {subManageTarget.last_name}.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Action</label>
                  <select
                    className="form-control text-sm"
                    value={subManageAction}
                    onChange={e => {
                      const act = e.target.value as any
                      setSubManageAction(act)
                      if (act === 'CANCEL') {
                        setSubManagePlanId('')
                      }
                    }}
                  >
                    {detailCache[subManageTarget.id]?.subscription?.status === 'ACTIVE' ? (
                      <>
                        <option value="CHANGE_PLAN">Change / Upgrade Plan</option>
                        <option value="ASSIGN_TRIAL">Give Free Trial</option>
                        <option value="CANCEL">Cancel Subscription</option>
                      </>
                    ) : (
                      <>
                        <option value="SUBSCRIBE">Manually Subscribe to Plan</option>
                        <option value="ASSIGN_TRIAL">Give Free Trial</option>
                      </>
                    )}
                  </select>
                </div>

                {subManageAction !== 'CANCEL' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Select Plan</label>
                    <select
                      className="form-control text-sm"
                      value={subManagePlanId}
                      onChange={e => setSubManagePlanId(e.target.value)}
                    >
                      <option value="">-- Select Plan --</option>
                      {detailCache[subManageTarget.id]?.plans?.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${(p.monthly_price_cents / 100).toFixed(2)}/mo — {p.included_tokens} tokens)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {subManageAction === 'ASSIGN_TRIAL' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Trial Duration (Months)</label>
                    <select
                      className="form-control text-sm"
                      value={subManageTrialMonths}
                      onChange={e => setSubManageTrialMonths(parseInt(e.target.value, 10))}
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>
                          {m} {m === 1 ? 'Month' : 'Months'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {subManageAction === 'ASSIGN_TRIAL' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-xs">
                    <strong>Free Trial Notice:</strong> Giving a free trial will immediately cancel any existing active subscription and set the plan validity period as requested.
                  </div>
                )}

                {subManageAction === 'CANCEL' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs">
                    <strong>Warning:</strong> This will cancel the practitioner's active subscription immediately.
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={managePractitionerSubscription}
                  disabled={
                    (subManageAction !== 'CANCEL' && !subManagePlanId) ||
                    !!actionLoading
                  }
                  className="btn btn-info flex-1 flex items-center justify-center gap-2"
                >
                  {actionLoading?.endsWith(':sub-manage') && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm
                </button>
                <button
                  onClick={() => setSubManageTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
