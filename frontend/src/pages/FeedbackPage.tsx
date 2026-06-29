import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { Star, Loader2, CheckCircle, Smile, MessageSquare, Heart } from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import DashboardShell from '@/components/DashboardShell'

interface RatingItemProps {
  label: string
  description: string
  value: number
  onChange: (val: number) => void
}

function StarRating({ label, description, value, onChange }: RatingItemProps) {
  const [hover, setHover] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      <div className="d-flex justify-content-between align-items-baseline">
        <label className="text-sm font-semibold text-dark">{label}</label>
        <span className="text-xs text-secondary">{description}</span>
      </div>
      <div className="d-flex align-items-center gap-1.5 bg-light p-2 rounded-3 border border-light-subtle mt-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= (hover ?? value)
          return (
            <button
              key={star}
              type="button"
              className="p-1 bg-transparent border-0 focus:outline-none transition-transform hover:scale-110"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
            >
              <Star
                className={`w-6 h-6 transition-colors ${
                  isActive ? 'fill-warning text-warning' : 'text-secondary-subtle'
                }`}
                style={{ fill: isActive ? '#ffc107' : 'none', stroke: isActive ? '#ffc107' : '#ced4da' }}
              />
            </button>
          )
        })}
        <span className="ms-3 text-sm font-bold text-secondary">
          {value > 0 ? `${value} / 5` : 'Select rating'}
        </span>
      </div>
    </div>
  )
}

interface FeedbackEntry {
  rating_overall: number
  rating_communication: number
  rating_professionalism: number
  rating_service: number
  comments: string | null
  submitted_at: string
}

export default function FeedbackPage() {
  const { referralId } = useParams<{ referralId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const { user } = useAuth()
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(true)

  const [ratings, setRatings] = useState({
    rating_communication: 0,
    rating_professionalism: 0,
    rating_service: 0,
    rating_overall: 0,
  })
  const [comments, setComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const loadFeedback = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: FeedbackEntry[] }>('/feedback/practitioner')
      setFeedbackList(data.data || [])
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setFeedbackLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadFeedback()
    }
  }, [user, loadFeedback])

  const handleRatingChange = (key: keyof typeof ratings, val: number) => {
    setRatings((prev) => ({ ...prev, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast.error('Feedback token is missing. Please use the link sent to your email.')
      return
    }

    const { rating_communication, rating_professionalism, rating_service, rating_overall } = ratings
    if (!rating_communication || !rating_professionalism || !rating_service || !rating_overall) {
      toast.error('Please provide all 4 rating categories before submitting.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post(
        `/feedback/${referralId}`,
        {
          rating_communication,
          rating_professionalism,
          rating_service,
          rating_overall,
          comments: comments.trim() || undefined,
        },
        {
          params: { token },
        }
      )
      setIsSuccess(true)
      toast.success('Feedback submitted successfully!')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- RENDER PRACTITIONER feedback list if user is logged in ---
  if (user) {
    const average = (key: keyof Omit<FeedbackEntry, 'comments' | 'submitted_at'>) => {
      if (feedbackList.length === 0) return 0
      const sum = feedbackList.reduce((acc, entry) => acc + entry[key], 0)
      return parseFloat((sum / feedbackList.length).toFixed(1))
    }

    return (
      <DashboardShell>
        {/* Title */}
        <div className="row toprow pt-4">
          <div className="col-md-12">
            <div className="page-title">
              <h1>Patient Feedback</h1>
              <p>Review submitted patient feedback and overall quality ratings.</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="row">
          <div className="col-md-12">
            {feedbackLoading ? (
              <div className="text-center py-5">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              </div>
            ) : feedbackList.length === 0 ? (
              <div className="carddesign">
                <div className="cardbody text-center py-5 text-secondary">
                  <MessageSquare className="w-12 h-12 text-secondary-50 opacity-50 mx-auto mb-3" />
                  <h5 className="fw-semibold">No Feedback Received</h5>
                  <p className="text-sm">Once patient reviews are submitted, they will appear here.</p>
                </div>
              </div>
            ) : (
              <>
                <ul className="dashboardcard-list">
                  <li>
                    <div className="dashboard-card dashboard-card1">
                      <div className="dashboard-card-icon">
                        <img src="/assets/images/feedback.svg" className="img-fluid" style={{ width: '22px' }} alt="" />
                      </div>
                      <h4>Overall Experience</h4>
                      <h3>{average('rating_overall')}</h3>
                      <p style={{ color: '#1A9E8A', fontWeight: '500' }}>OUT OF 5</p>
                    </div>
                  </li>
                  <li>
                    <div className="dashboard-card dashboard-card2">
                      <div className="dashboard-card-icon">
                        <img src="/assets/images/feedback.svg" className="img-fluid" style={{ width: '22px' }} alt="" />
                      </div>
                      <h4>Communication</h4>
                      <h3>{average('rating_communication')}</h3>
                      <p style={{ color: '#0068b9', fontWeight: '500' }}>OUT OF 5</p>
                    </div>
                  </li>
                  <li>
                    <div className="dashboard-card dashboard-card3">
                      <div className="dashboard-card-icon">
                        <img src="/assets/images/feedback.svg" className="img-fluid" style={{ width: '22px' }} alt="" />
                      </div>
                      <h4>Professionalism</h4>
                      <h3>{average('rating_professionalism')}</h3>
                      <p style={{ color: '#af950d', fontWeight: '500' }}>OUT OF 5</p>
                    </div>
                  </li>
                  <li>
                    <div className="dashboard-card dashboard-card4">
                      <div className="dashboard-card-icon">
                        <img src="/assets/images/feedback.svg" className="img-fluid" style={{ width: '22px' }} alt="" />
                      </div>
                      <h4>Service Quality</h4>
                      <h3>{average('rating_service')}</h3>
                      <p style={{ color: '#7b2cbf', fontWeight: '500' }}>OUT OF 5</p>
                    </div>
                  </li>
                </ul>

                {/* Reviews List */}
                <div className="carddesign mt-4">
                  <div className="cardheading">
                    <h2 className="m-0" style={{ fontSize: '18px' }}>
                      Recent Patient Reviews
                    </h2>
                  </div>
                  <div className="cardbody">
                    <div className="space-y-3">
                      {feedbackList.map((entry, idx) => (
                        <div
                          key={idx}
                          className="p-3 mb-3 border border-light-subtle rounded-3"
                          style={{ background: '#fafafa' }}
                        >
                          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-2">
                            <div className="d-flex align-items-center gap-3 flex-wrap">
                              <div className="d-flex align-items-center gap-1">
                                <span className="text-sm font-bold text-dark me-1">Overall:</span>
                                <div className="d-flex gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`w-3.5 h-3.5 ${
                                        star <= entry.rating_overall ? 'fill-warning text-warning' : 'text-secondary-subtle'
                                      }`}
                                      style={{
                                        fill: star <= entry.rating_overall ? '#ffc107' : 'none',
                                        stroke: star <= entry.rating_overall ? '#ffc107' : '#ced4da',
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <span className="text-secondary-subtle hidden sm:inline">|</span>
                              <span className="text-xs text-secondary font-medium">Comm: {entry.rating_communication}</span>
                              <span className="text-xs text-secondary font-medium">Prof: {entry.rating_professionalism}</span>
                              <span className="text-xs text-secondary font-medium">Service: {entry.rating_service}</span>
                            </div>
                            <span className="text-secondary text-xs">
                              Submitted {new Date(entry.submitted_at).toLocaleDateString()}
                            </span>
                          </div>

                          {entry.comments ? (
                            <p className="text-sm text-secondary m-0 bg-white p-3 rounded-2 border border-light italic">
                              "{entry.comments}"
                            </p>
                          ) : (
                            <p className="text-xs text-secondary-subtle italic m-0">No comment provided.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DashboardShell>
    )
  }

  // --- RENDER PATIENT REVIEW SUBMIT SCREEN (if not logged in) ---
  if (!token) {
    return (
      <div className="min-h-screen bg-light flex items-center justify-center p-4">
        <div
          className="max-w-md w-full bg-white rounded-3 border border-light-subtle p-5 text-center"
          style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}
        >
          <div
            className="w-16 h-16 bg-warning-subtle text-warning rounded-circle flex items-center justify-center mx-auto mb-4 border border-warning"
            style={{ width: '64px', height: '64px' }}
          >
            <MessageSquare className="w-8 h-8" />
          </div>
          <h4 className="fw-bold text-dark mb-2">Feedback Token Required</h4>
          <p className="text-secondary text-sm m-0">
            This review page is secure and requires a unique patient feedback token.
            If you are a practitioner, please log in to view submitted feedback details.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-bottom border-light-subtle sticky-top z-3">
        <div className="container-md d-flex align-items-center justify-content-between" style={{ height: '56px' }}>
          <span className="fw-bold text-dark">Chiropractor Referral Network</span>
          <span className="badge bg-primary-subtle text-primary px-2.5 py-1.5 text-xs">
            Patient Feedback
          </span>
        </div>
      </header>

      {/* Main container */}
      <main className="flex-grow-1 d-flex items-center justify-content-center py-5 px-3">
        <div
          className="max-w-xl w-full bg-white rounded-3 border border-light-subtle overflow-hidden"
          style={{ boxShadow: '0 10px 35px rgba(0,0,0,0.05)' }}
        >
          {isSuccess ? (
            <div className="p-5 text-center space-y-4">
              <div
                className="w-16 h-16 bg-success-subtle text-success rounded-circle flex items-center justify-center mx-auto border border-success"
                style={{ width: '64px', height: '64px' }}
              >
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="fw-bold text-dark mt-3" style={{ fontSize: '24px' }}>
                Thank you!
              </h2>
              <p className="text-secondary text-sm max-w-sm mx-auto m-0 mt-1">
                Your feedback has been successfully submitted and helps us maintain outstanding care quality.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 p-sm-5 space-y-6">
              <div>
                <h3 className="fw-bold text-dark m-0" style={{ fontSize: '22px' }}>
                  <Smile className="w-6 h-6 d-inline-block align-middle text-primary me-2" />
                  Rate Your Experience
                </h3>
                <p className="text-secondary text-xs mt-2 m-0" style={{ lineHeight: '1.4' }}>
                  Let us know how your clinical visit went. Feedback is fully anonymous and computes chiropractor match priority scores.
                </p>
              </div>

              <div className="space-y-4 pt-3 border-top border-light-subtle">
                <StarRating
                  label="Communication"
                  description="Did they explain adjustments and care plan clearly?"
                  value={ratings.rating_communication}
                  onChange={(val) => handleRatingChange('rating_communication', val)}
                />

                <StarRating
                  label="Professionalism"
                  description="Provider respectfulness, cleanliness, and clinical conduct"
                  value={ratings.rating_professionalism}
                  onChange={(val) => handleRatingChange('rating_professionalism', val)}
                />

                <StarRating
                  label="Service Quality"
                  description="Clinical quality of treatment, diagnosis, and adjustment"
                  value={ratings.rating_service}
                  onChange={(val) => handleRatingChange('rating_service', val)}
                />

                <StarRating
                  label="Overall Rating"
                  description="General satisfaction with this chiropractor match"
                  value={ratings.rating_overall}
                  onChange={(val) => handleRatingChange('rating_overall', val)}
                />

                <div className="form-group pt-2">
                  <label className="text-sm font-semibold text-dark d-flex align-items-center gap-1.5" htmlFor="comments">
                    <MessageSquare className="w-4 h-4 text-secondary opacity-50" />
                    Additional Comments
                  </label>
                  <textarea
                    id="comments"
                    rows={3}
                    placeholder="Enter any additional remarks..."
                    maxLength={1000}
                    className="form-control text-sm mt-2"
                    style={{ borderRadius: '8px' }}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                  <div className="text-end text-[10px] text-secondary mt-1">
                    {comments.length} / 1000 characters
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-info w-100 py-2.5 fw-bold text-sm mt-3"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-secondary border-top border-light-subtle bg-white">
        &copy; {new Date().getFullYear()} Chiropractor Referral Network. All rights reserved.
      </footer>
    </div>
  )
}
