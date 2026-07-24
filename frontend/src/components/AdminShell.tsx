import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'
import { toast } from 'sonner'
import { getApiError } from '@/lib/utils'

interface AdminShellProps {
  children: React.ReactNode
  activeTab?: string
  setActiveTab?: (tab: any) => void
}

/**
 * AdminShell — wraps the Admin panel in the same platform UI shell
 * (topbar, sidebar, footer) as DashboardShell, using the platform's
 * CSS assets from /public/assets/.
 */
export default function AdminShell({ children, activeTab, setActiveTab }: AdminShellProps) {
  // Load the same platform stylesheets used by DashboardShell
  useExternalStylesheet()

  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  // Apply body classes that the platform CSS targets
  useEffect(() => {
    document.body.classList.add('dashbody')
    document.body.id = 'addclass'

    const handleClose = () => {
      setProfileDropdownOpen(false)
    }
    window.addEventListener('click', handleClose)

    return () => {
      document.body.classList.remove('dashbody')
      document.body.removeAttribute('id')
      document.body.classList.remove('opennav')
      window.removeEventListener('click', handleClose)
    }
  }, [])

  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.classList.add('opennav')
    } else {
      document.body.classList.remove('opennav')
    }
  }, [isMobileNavOpen])

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Logged out successfully.')
      navigate('/login')
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  return (
    <div>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-5 col-5">
              <div className="sidebar-logo">
                <Link to="/admin">
                  <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
                </Link>
              </div>
            </div>
            <div className="col-md-7 col-7">
              <div className="topbar-right">
                <div className="header-right navbar">
                  {/* Mobile logo */}
                  <div className="mobile-logo">
                    <Link to="/admin">
                      <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
                    </Link>
                  </div>

                  <ul className="navbar-nav ms-auto flex-row align-items-center">
                    {/* Admin badge */}
                    <li className="nav-item upgrade-nav">
                      <span
                        className="nav-link"
                        style={{ cursor: 'default', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="la la-shield" />
                        Admin Panel
                      </span>
                    </li>

                    {/* Profile dropdown */}
                    <li
                      className={`nav-item dropdown profiledrop ${profileDropdownOpen ? 'show' : ''}`}
                      style={{ position: 'relative' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="nav-link dropdown-toggle bg-transparent border-0 p-0"
                        onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                      >
                        <img
                          src="/assets/images/user.png"
                          className="img-fluid rounded-circle"
                          alt="User"
                          style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                        />
                      </button>
                      <ul
                        className={`dropdown-menu dropdown-menu-end ${profileDropdownOpen ? 'show' : ''}`}
                        style={{ position: 'absolute', right: 0, top: '100%', margin: '15px 0 0' }}
                      >
                        <li>
                          <span
                            className="dropdown-item py-2 fw-semibold"
                            style={{ fontSize: '13px', cursor: 'default', color: '#1f244a' }}
                          >
                            {user?.email}
                          </span>
                        </li>
                        <li><hr className="dropdown-divider my-1" /></li>
                        <li>
                          <a
                            href="#"
                            className="dropdown-item"
                            onClick={(e) => {
                              e.preventDefault()
                              setProfileDropdownOpen(false)
                              handleLogout()
                            }}
                          >
                            <img
                              src="/assets/images/logout.svg"
                              className="img-fluid"
                              alt="Logout"
                              style={{ marginRight: '10px' }}
                            />
                            Logout
                          </a>
                        </li>
                      </ul>
                    </li>

                    {/* Mobile hamburger */}
                    <li className="menuicon" id="menuicon" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}>
                        <img src="/assets/images/Menu.svg" className="img-fluid" alt="Menu" />
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div className="sidebar">
        <ul>
          {setActiveTab && activeTab ? (
            <>
              <li className={activeTab === 'dashboard' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('dashboard')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/dashboard.svg" className="img-fluid" alt="" />
                  </span>
                  Dashboard
                </a>
              </li>
              <li className={activeTab === 'practitioners' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('practitioners')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/profile.svg" className="img-fluid" alt="" />
                  </span>
                  Chiropractors
                </a>
              </li>
              <li className={activeTab === 'users' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('users')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/notifications.svg" className="img-fluid" alt="" />
                  </span>
                  Users
                </a>
              </li>
              <li className={activeTab === 'referrals' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('referrals')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/referrals.svg" className="img-fluid" alt="" />
                  </span>
                  Referrals
                </a>
              </li>
              <li className={activeTab === 'feedback' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('feedback')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
                  </span>
                  Feedback & Compliance
                </a>
              </li>
              <li className={activeTab === 'plans' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('plans')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/subscription.svg" className="img-fluid" alt="" />
                  </span>
                  Subscription Plans
                </a>
              </li>
              <li className={activeTab === 'packages' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('packages')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/tokenwallet.svg" className="img-fluid" alt="" />
                  </span>
                  Care Tokens Packages
                </a>
              </li>
              <li className={activeTab === 'settings' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('settings')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/settings.svg" className="img-fluid" alt="" />
                  </span>
                  Settings
                </a>
              </li>
              <li className={activeTab === 'audit-logs' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('audit-logs')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/documents.svg" className="img-fluid" alt="" />
                  </span>
                  Audit Logs
                </a>
              </li>
              <li className={activeTab === 'transactions' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('transactions')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/transaction-history.svg" className="img-fluid" alt="" />
                  </span>
                  Transactions
                </a>
              </li>
              <li className={activeTab === 'enquiries' ? 'active' : ''}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setActiveTab('enquiries')
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>
                    <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
                  </span>
                  Enquiries
                </a>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link to="/admin" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/dashboard.svg" className="img-fluid" alt="" />
                  </span>
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/admin#practitioners" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/profile.svg" className="img-fluid" alt="" />
                  </span>
                  Chiropractors
                </Link>
              </li>
              <li>
                <Link to="/admin#users" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/notifications.svg" className="img-fluid" alt="" />
                  </span>
                  Users
                </Link>
              </li>
              <li>
                <Link to="/admin#referrals" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/tdreferral.svg" className="img-fluid" alt="" />
                  </span>
                  Referrals
                </Link>
              </li>
              <li>
                <Link to="/admin#feedback" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
                  </span>
                  Feedback
                </Link>
              </li>
              <li>
                <Link to="/admin#plans" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/subscription.svg" className="img-fluid" alt="" />
                  </span>
                  Subscription Plans
                </Link>
              </li>
              <li>
                <Link to="/admin#packages" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/tokenwallet.svg" className="img-fluid" alt="" />
                  </span>
                  Care Tokens Packages
                </Link>
              </li>
              <li>
                <Link to="/admin#transactions" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/token.svg" className="img-fluid" alt="" />
                  </span>
                  Transactions
                </Link>
              </li>
              <li>
                <Link to="/admin#settings" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/settings.svg" className="img-fluid" alt="" />
                  </span>
                  Settings
                </Link>
              </li>
              <li>
                <Link to="/admin#enquiries" onClick={() => setIsMobileNavOpen(false)}>
                  <span>
                    <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
                  </span>
                  Enquiries
                </Link>
              </li>
            </>
          )}
          <li>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setIsMobileNavOpen(false)
                handleLogout()
              }}
            >
              <span>
                <img src="/assets/images/logout.svg" className="img-fluid" alt="" />
              </span>
              Logout
            </a>
          </li>
        </ul>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="mainbody">
        <div className="container-fluid">{children}</div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="dashboard-footer">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-6">
              <div className="copyright-left">
                <p>© {new Date().getFullYear()} ChiroReferral. All rights reserved.</p>
              </div>
            </div>
            <div className="col-md-6">
              <div className="copyright-right">
                <ul>
                  <li>
                    <Link to="#">Terms of Use</Link>
                  </li>
                  <li>
                    <Link to="#">Privacy Policy</Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
