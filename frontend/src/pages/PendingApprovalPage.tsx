import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import LogoutButton from '@/components/LogoutButton'
import OnboardingSteps from '@/components/OnboardingSteps'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

export default function PendingApprovalPage() {
  useExternalStylesheet()
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const status = user?.practitioner_status
  const [isChecking, setIsChecking] = useState(false)

  async function handleCheckStatus() {
    setIsChecking(true)
    try {
      const updated = await refreshUser()
      const newStatus = updated?.practitioner_status
      if (newStatus === 'ACTIVE' || newStatus === 'SUSPENDED') {
        navigate('/dashboard', { replace: true })
      } else if (newStatus === 'PROFILE_COMPLETED') {
        navigate('/documents', { replace: true })
      } else if (newStatus === 'PENDING_PROFILE') {
        navigate('/profile', { replace: true })
      } else {
        toast.info('Your application is still under review.')
      }
    } catch {
      toast.error('Could not check status. Please try again.')
    } finally {
      setIsChecking(false)
    }
  }

  const config = {
    PROFILE_COMPLETED: {
      image: '/assets/images/checkedg.png',
      title: 'Profile Complete',
      subtitle: 'Your profile has been saved. The next step is to upload your verification documents.',
      alertClass: 'alert alert-info',
      bannerTitle: 'Status: Profile Completed',
      bannerBody: 'Please upload your License and Insurance documents to request verification.',
      showButton: true,
      buttonText: 'Upload Documents Now',
      buttonAction: () => navigate('/documents'),
    },
    PENDING_APPROVAL: {
      image: '/assets/images/underreview.png',
      title: 'Under Review',
      subtitle: 'Your application has been submitted. Our team reviews new applications within 1-2 business days.',
      alertClass: 'alert alert-warning underreview-alert',
      bannerTitle: 'Status: Pending Approval',
      bannerBody: "You'll receive an email once your application has been reviewed.",
      showButton: true,
      buttonText: 'Check Approval Status',
      buttonAction: handleCheckStatus,
    },
    REJECTED: {
      image: '/assets/images/underreview.png', // Or dynamic warning image
      title: 'Application Not Approved',
      subtitle: 'Your application was not approved. Please contact support if you believe this is a mistake.',
      alertClass: 'alert alert-danger',
      bannerTitle: 'Status: Rejected',
      bannerBody: 'Email support@Chiropractorreferral.com for further assistance.',
      showButton: false,
      buttonText: '',
      buttonAction: () => {},
    },
  }[status ?? 'PENDING_APPROVAL'] ?? {
    image: '/assets/images/underreview.png',
    title: 'Pending',
    subtitle: 'Your account is being processed.',
    alertClass: 'alert alert-warning',
    bannerTitle: 'Status: Pending',
    bannerBody: 'Please wait while your account is being set up.',
    showButton: true,
    buttonText: 'Check Status',
    buttonAction: handleCheckStatus,
  }

  return (
    <div className="min-h-screen bg-light">
      <header className="bg-white border-bottom border-gray-200 sticky-top z-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="container-md d-flex align-items-center justify-content-between" style={{ height: '56px' }}>
          <span className="fw-bold text-dark">Chiropractor Referral Network</span>
          <div className="d-flex align-items-center gap-3 text-sm">
            <span className="text-secondary">{user?.email}</span>
            <LogoutButton className="text-primary fw-medium bg-transparent border-0 p-0" />
          </div>
        </div>
      </header>

      <div className="signbg py-4">
        <section className="login-sec pending-approval-sec my-4">
          <div className="text-center mb-4">
            <Link to="#" className="loginlogo">
              <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
            </Link>
          </div>

          <div className="container">
            <div className="bg-white rounded-3 p-3 mb-4 shadow-sm">
              <OnboardingSteps status={user?.practitioner_status} />
            </div>

            <div className="login-bg shadow-sm">
              <div className="loginheading text-center" style={{ margin: 0 }}>
                <img src={config.image} className="img-fluid checkedg mb-3" alt="Status icon" />
                <h1>{config.title}</h1>
                <p className="mb-3">{config.subtitle}</p>

                <div className={config.alertClass} role="alert" style={{ textAlign: 'left' }}>
                  <strong>{config.bannerTitle}</strong>
                  <div className="mt-1">{config.bannerBody}</div>
                  {status === 'REJECTED' && user?.rejection_reason && (
                    <div className="mt-2 pt-2 border-top border-danger-subtle">
                      <strong>Reason:</strong> {user.rejection_reason}
                    </div>
                  )}
                </div>

                <p className="mt-3">
                  Signed in as <strong>{user?.email}</strong>
                </p>

                {config.showButton && (
                  <div className="text-center mt-4" style={{ paddingTop: '20px' }}>
                    <button
                      type="button"
                      onClick={config.buttonAction}
                      disabled={isChecking}
                      className="btn btn-info px-4"
                    >
                      {isChecking ? (
                        <Loader2 className="w-4 h-4 animate-spin d-inline-block mr-2" />
                      ) : null}
                      {config.buttonText}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
