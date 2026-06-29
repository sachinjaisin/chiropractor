import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import DashboardShell from '@/components/DashboardShell'

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ClaimedReferral {
  id: string
  referral_id: string
  referral_number: string
  status: string
  primary_complaint: string
  symptoms: string | null
  duration_of_problem: string | null
  urgency_level: string
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
  claimed_at: string
  patient: PatientInfo
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

const STATUS_CLASSES: Record<string, string> = {
  CLAIMED: 'bg-primary-subtle text-primary',
  PATIENT_CONTACTED: 'bg-info-subtle text-info',
  APPOINTMENT_BOOKED: 'bg-warning-subtle text-warning',
  TREATMENT_IN_PROGRESS: 'bg-danger-subtle text-danger',
  COMPLETED: 'bg-success-subtle text-success',
  CLOSED: 'bg-secondary-subtle text-secondary',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ClaimReferralDetailPage() {
  const { referralId } = useParams<{ referralId: string }>()
  const [referral, setReferral] = useState<ClaimedReferral | null>(null)
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [caseNotes, setCaseNotes] = useState<string>('')

  const fetchData = useCallback(async () => {
    if (!referralId) return
    setIsLoading(true)
    setError(null)
    try {
      const [refRes, timelineRes] = await Promise.all([
        api.get<ClaimedReferral>(`/referrals/claimed/${referralId}`),
        api.get<TimelineData>(`/referrals/claimed/${referralId}/timeline`),
      ])
      setReferral(refRes.data)
      setTimeline(timelineRes.data)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setIsLoading(false)
    }
  }, [referralId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdate = async () => {
    if (!referralId || (!selectedStatus && !caseNotes.trim())) return
    setIsUpdating(true)
    try {
      if (selectedStatus) {
        // Update status API (accepts notes as well)
        await api.patch(`/referrals/claimed/${referralId}/status`, {
          status: selectedStatus,
          notes: caseNotes.trim() || undefined,
        })
        toast.success(`Case status updated successfully to ${selectedStatus.replace(/_/g, ' ')}`)
      } else {
        // Just post a case note
        await api.post(`/referrals/claimed/${referralId}/notes`, {
          note_text: caseNotes.trim(),
          is_internal: false,
        })
        toast.success('Case note added successfully.')
      }
      setCaseNotes('')
      setSelectedStatus('')
      // Reload both data feeds
      const [refRes, timelineRes] = await Promise.all([
        api.get<ClaimedReferral>(`/referrals/claimed/${referralId}`),
        api.get<TimelineData>(`/referrals/claimed/${referralId}/timeline`),
      ])
      setReferral(refRes.data)
      setTimeline(timelineRes.data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsUpdating(false)
    }
  }

  const getMergedTimeline = () => {
    if (!timeline) return []
    const items: { date: string; title: string; desc?: string | null }[] = []

    const statusHistory = timeline.status_history || []
    statusHistory.forEach((sh) => {
      if (!sh) return
      const oldStatusLabel = sh.old_status ? sh.old_status.replace(/_/g, ' ') : 'Initial'
      const newStatusLabel = sh.new_status ? sh.new_status.replace(/_/g, ' ') : 'Unknown'
      items.push({
        date: sh.changed_at || new Date().toISOString(),
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
        title,
        desc,
      })
    })

    return items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }

  if (isLoading) {
    return (
      <DashboardShell useStyle2={true}>
        <div className="text-center py-5">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-secondary">Loading case details...</p>
        </div>
      </DashboardShell>
    )
  }

  if (error || !referral) {
    return (
      <DashboardShell useStyle2={true}>
        <div className="text-center py-5 text-danger">
          <p className="fw-bold">{error || 'Referral not found or not claimed by you.'}</p>
          <Link to="/dashboard" className="btn btn-info mt-3">Back to Dashboard</Link>
        </div>
      </DashboardShell>
    )
  }

  const mergedTimeline = getMergedTimeline()

  return (
    <DashboardShell useStyle2={true}>
      <div className="row toprow">
        <div className="col-md-6 col-12">
          <div className="page-title">
            <h1>Claimed Referral Detail: #{referral.referral_number}</h1>
            <p>Review patient details and update the case status or notes.</p>
          </div>
        </div>
        <div className="col-md-6 col-12 text-md-end mt-2 mt-md-0">
          <div className="titleright-btn">
            <Link to="/dashboard" className="btn btn-info">Back to Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Patient Information Column */}
        <div className="col-md-6 col-12 mb-4">
          <div className="carddesign h-100">
            <div className="cardheading">
              <h2>Patient Information</h2>
            </div>
            <div className="cardbody">
              <ul className="referral-info">
                <li>
                  <strong>Name</strong>
                  <div className="referral-details">
                    {referral.patient.first_name} {referral.patient.last_name}
                  </div>
                </li>
                <li>
                  <strong>Contact</strong>
                  <div className="referral-details">
                    <a href={`tel:${referral.patient.phone}`} style={{ color: '#0068b9', textDecoration: 'none' }}>
                      {referral.patient.phone}
                    </a>
                  </div>
                </li>
                <li>
                  <strong>Email</strong>
                  <div className="referral-details">
                    <a href={`mailto:${referral.patient.email}`} style={{ color: '#0068b9', textDecoration: 'none' }}>
                      {referral.patient.email}
                    </a>
                  </div>
                </li>
                <li>
                  <strong>DOB</strong>
                  <div className="referral-details">N/A</div>
                </li>
                <li>
                  <strong>Address</strong>
                  <div className="referral-details">
                    {referral.patient.street_address}, {referral.patient.city}, {referral.patient.state} {referral.patient.zip_code}
                  </div>
                </li>
                <li>
                  <strong>Date Submitted</strong>
                  <div className="referral-details">{formatDate(referral.published_at || referral.created_at)}</div>
                </li>
                <li>
                  <strong>Referral Status</strong>
                  <div className="referral-details">
                    <span className={`status-d ${STATUS_CLASSES[referral.status] || 'bg-light text-dark'}`}>
                      {referral.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Activity History Column */}
        <div className="col-md-6 col-12 mb-4">
          <div className="carddesign h-100">
            <div className="cardheading">
              <h2>Activity History</h2>
            </div>
            <div className="cardbody" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {mergedTimeline.length === 0 ? (
                <p className="text-secondary italic">No history logged for this case.</p>
              ) : (
                <ul className="activity-time">
                  {mergedTimeline.map((item, idx) => (
                    <li key={idx}>
                      <span>
                        <i className="la la-clock"></i>
                      </span>
                      {formatDateTime(item.date)}
                      <strong>{item.title}</strong>
                      {item.desc && <div className="d-block text-secondary text-sm mt-1">{item.desc}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Status & Case Notes Card */}
        <div className="col-12 mb-4">
          <div className="carddesign">
            <div className="cardheading">
              <h2>Status & Case Notes</h2>
            </div>
            <div className="cardbody">
              <div className="formdesign">
                <div className="form-group mb-3">
                  <label className="form-label">Update Status</label>
                  <select
                    className="form-control form-select"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="">Select Status</option>
                    <option value="PATIENT_CONTACTED">Patient Contacted</option>
                    <option value="APPOINTMENT_BOOKED">Appointment Booked</option>
                    <option value="TREATMENT_IN_PROGRESS">Treatment In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Case Notes</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    id="comment"
                    name="text"
                    value={caseNotes}
                    onChange={(e) => setCaseNotes(e.target.value)}
                    placeholder="Enter case note text here..."
                  ></textarea>
                </div>
                <div className="btn-right text-end">
                  <button
                    type="button"
                    className="btn btn-info"
                    disabled={isUpdating || (!selectedStatus && !caseNotes.trim())}
                    onClick={handleUpdate}
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin d-inline-block me-2 align-middle" />
                        Updating...
                      </>
                    ) : (
                      'Update'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
