import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Loader2,
  MapPin,
  Clock,
  Coins,
  AlertTriangle,
  Phone,
  Mail,
  Home,
} from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import DashboardShell from '@/components/DashboardShell'

interface AvailableReferral {
  id: string
  referral_number: string
  status: string
  primary_complaint: string
  symptoms: string | null
  duration_of_problem: string | null
  urgency_level: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  preferred_contact: string | null
  additional_notes: string | null
  city: string
  state: string
  zip_code: string
  distance_km: number | null
  priority_score: number
  published_at: string | null
  created_at: string
  patient_problems: string[]
}

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

const URGENCY_CLASSES = {
  LOW: 'bg-secondary-subtle text-secondary',
  NORMAL: 'bg-primary-subtle text-primary',
  HIGH: 'bg-warning-subtle text-warning',
  URGENT: 'bg-danger-subtle text-danger',
}

export default function MarketplacePage() {
  const { user, walletBalance, refreshWallet } = useAuth()
  const navigate = useNavigate()

  const [referrals, setReferrals] = useState<AvailableReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [urgency, setUrgency] = useState<string>('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [isClaimLoading, setIsClaimLoading] = useState(false)

  // Modal State
  const [selectedReferral, setSelectedReferral] = useState<AvailableReferral | null>(null)

  const loadReferrals = useCallback(async (selectedUrgency: string, currentCursor?: string) => {
    try {
      const params: Record<string, string> = { limit: '15' }
      if (selectedUrgency) params.urgency = selectedUrgency
      if (currentCursor) params.cursor = currentCursor

      const { data } = await api.get<{ data: AvailableReferral[]; pagination: { cursor: string | null } }>(
        '/referrals/available',
        { params }
      )

      if (currentCursor) {
        setReferrals((prev) => [...prev, ...data.data])
      } else {
        setReferrals(data.data)
      }

      setCursor(data.pagination?.cursor || null)
      setHasMore((data.pagination?.cursor ?? null) !== null)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadReferrals(urgency)
  }, [urgency, loadReferrals])

  const handleClaim = async (referralId: string) => {
    if (walletBalance !== null && walletBalance < 1) {
      toast.error('You do not have enough Care Tokens to claim this referral.')
      return
    }

    if (!window.confirm('Are you sure you want to claim this referral? 1 Care Token will be deducted from your wallet.')) {
      return
    }

    setClaimingId(referralId)
    setIsClaimLoading(true)
    try {
      const idempotencyKey = crypto.randomUUID()
      await api.post(
        `/referrals/available/${referralId}/claim`,
        {},
        {
          headers: {
            'idempotency-key': idempotencyKey,
          },
        }
      )
      toast.success('Referral claimed successfully! Redirecting to Dashboard...')
      setSelectedReferral(null)
      await refreshWallet()
      setTimeout(() => {
        navigate('/dashboard')
      }, 1500)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setClaimingId(null)
      setIsClaimLoading(false)
    }
  }

  const handleLoadMore = () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    loadReferrals(urgency, cursor)
  }

  return (
    <DashboardShell>
      {/* Title block */}
      <div className="row toprow pt-4">
        <div className="col-md-12">
          <div className="page-title">
            <h1>Referral Marketplace</h1>
            <p>Explore patient referrals matching your services and claim cases.</p>
          </div>
        </div>
      </div>

      {/* Wallet Balance Hero Banner */}
      <div
        className="p-4 rounded-3 border border-primary-subtle d-flex flex-col flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4"
        style={{ background: 'linear-gradient(to bottom right, #f0f9ff, #ffffff)' }}
      >
        <div>
          <span className="badge bg-primary-subtle text-primary px-2.5 py-1 text-xs fw-semibold mb-2">
            Chiropractor Wallet
          </span>
          <h3 className="fw-bold mt-1 text-dark m-0" style={{ fontSize: '24px' }}>
            {walletBalance !== null ? `${walletBalance} Care Tokens Available` : '0 Care Tokens'}
          </h3>
          <p className="text-secondary text-xs m-0">Claiming any referral costs exactly 1 Care Token.</p>
        </div>
        <Link to="/wallet" className="btn btn-info px-4">
          Buy Care Tokens
        </Link>
      </div>

      {/* Filters */}
      <div className="carddesign mb-4">
        <div className="cardbody">
          <div className="row filterrow">
            <div className="col-md-4">
              <h2>Filter by Urgency</h2>
            </div>
            <div className="col-md-8">
              <ul className="filterlist mb-0">
                {['', 'LOW', 'NORMAL', 'HIGH', 'URGENT'].map((level) => (
                  <li key={level}>
                    <button
                      type="button"
                      onClick={() => setUrgency(level)}
                      className={`btn btn-info ${urgency === level ? 'active' : ''}`}
                    >
                      {level === '' ? 'All Urgencies' : level.charAt(0) + level.slice(1).toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Marketplace list table */}
      <div className="carddesign">
        <div className="cardbody">
          {loading ? (
            <div className="text-center py-5 text-secondary">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
              <p className="text-sm">Searching matching cases...</p>
            </div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-5 text-secondary">
              <AlertTriangle className="w-12 h-12 text-secondary-50 opacity-50 mx-auto mb-3" />
              <h5 className="fw-semibold">No Referrals Found</h5>
              <p className="text-sm">There are no referrals currently available matching your criteria.</p>
            </div>
          ) : (
            <div className="tabledesign filterno whitebg">
              <div className="table-responsive">
                <table className="table dt-responsive categories_table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '70px' }}>REFERRAL #</th>
                      <th style={{ minWidth: '100px' }}>GENERAL AREA</th>
                      <th style={{ minWidth: '70px' }}>DISTANCE</th>
                      <th style={{ minWidth: '100px' }}>URGENCY</th>
                      <th style={{ minWidth: '150px' }}>SYMPTOMS / COMPLAINT</th>
                      <th style={{ minWidth: '100px' }}>REFERRAL AGE</th>
                      <th style={{ minWidth: '100px' }}>SUBMISSION DATE</th>
                      <th style={{ minWidth: '60px' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((ref) => (
                      <tr key={ref.id}>
                        <td>{ref.referral_number}</td>
                        <td>
                          {ref.city}, {ref.state}
                        </td>
                        <td>{ref.distance_km != null ? `${ref.distance_km.toFixed(1)} km` : 'N/A'}</td>
                        <td>
                          <span className={`status-d ${URGENCY_CLASSES[ref.urgency_level]}`}>
                            {ref.urgency_level}
                          </span>
                        </td>
                        <td style={{ maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ref.symptoms || ref.primary_complaint}
                        </td>
                        <td>{timeAgo(ref.published_at || ref.created_at)}</td>
                        <td>{formatDate(ref.published_at || ref.created_at)}</td>
                        <td className="tdaction">
                          <button
                            type="button"
                            className="bg-transparent border-0 p-0"
                            title="View details & claim"
                            onClick={() => setSelectedReferral(ref)}
                          >
                            <img src="/assets/images/tdeye.svg" className="img-fluid" alt="View" />
                          </button>
                            <button
                              type="button"
                              className="btn btn-outline-info btn-sm ms-2 d-flex align-items-center"
                              title="View matching profiles"
                              onClick={() => navigate(`/matches/${ref.id}`)}
                            >
                              <img src="/assets/images/match.svg" className="img-fluid me-1" alt="Match" style={{ width: '20px', height: '20px' }} />
                              <span className="small">View matching profiles</span>
                            </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hasMore && (
                  <div className="text-center py-3">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="btn btn-secondary px-4 py-2"
                    >
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details Split Modal */}
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
                  Marketplace Case: #{selectedReferral.referral_number}
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
                  {/* Left Column: Details */}
                  <div className="col-md-6 mb-3 mb-md-0">
                    <div className="carddesign h-100" style={{ marginBottom: 0 }}>
                      <div className="cardheading">
                        <h2 className="m-0" style={{ fontSize: '16px' }}>
                          Case Information
                        </h2>
                      </div>
                      <div className="cardbody py-3">
                        <ul className="referral-info p-0 m-0">
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Urgency</strong>
                            <div className="referral-details">
                              <span className={`status-d ${URGENCY_CLASSES[selectedReferral.urgency_level]}`}>
                                {selectedReferral.urgency_level}
                              </span>
                            </div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Location</strong>
                            <div className="referral-details">
                              {selectedReferral.city}, {selectedReferral.state}
                            </div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Distance</strong>
                            <div className="referral-details">
                              {selectedReferral.distance_km != null ? `${selectedReferral.distance_km.toFixed(1)} km away` : 'N/A'}
                            </div>
                          </li>
                          <li className="d-flex justify-content-between mb-2">
                            <strong>Date Submitted</strong>
                            <div className="referral-details">
                              {formatDate(selectedReferral.published_at || selectedReferral.created_at)}
                            </div>
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
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Claim Action (Locked Patient Info) */}
                  <div className="col-md-6">
                    <div className="carddesign h-100 d-flex align-items-center justify-content-center border-0 text-center" style={{ minHeight: '320px', marginBottom: 0 }}>
                      <div className="p-4 bg-light rounded-3 border border-dashed border-secondary-subtle w-100 h-100 d-flex flex-col justify-content-center">
                        <LockIcon className="w-10 h-10 text-secondary opacity-40 mx-auto mb-3" />
                        <h5 className="fw-bold mb-1 text-dark" style={{ fontSize: '16px' }}>
                          Patient Details Locked
                        </h5>
                        <p className="text-xs text-secondary mb-4 max-w-xs mx-auto">
                          Claim this case using exactly 1 Care Token to unlock phone, email, and treatment location.
                        </p>
                        <button
                          className="btn btn-info w-100 py-2.5"
                          disabled={isClaimLoading || (walletBalance !== null && walletBalance < 1)}
                          onClick={() => handleClaim(selectedReferral.id)}
                        >
                          {isClaimLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                          ) : (
                            'Claim Case (1 Care Token)'
                          )}
                        </button>
                        {walletBalance === 0 && (
                          <p className="text-[11px] text-danger mt-2 font-medium">
                            Insufficient balance.{' '}
                            <Link to="/wallet" className="text-primary fw-semibold">
                              Buy Care Tokens
                            </Link>
                          </p>
                        )}
                      </div>
                    </div>
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
