import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { toast } from 'sonner'

interface Notification {
  id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export default function DashboardShell({
  children,
  useStyle2 = false,
  useStyle3 = false,
}: {
  children: React.ReactNode
  useStyle2?: boolean
  useStyle3?: boolean
}) {
  const customStylesheets = useStyle3
    ? [
        '/assets/css/bootstrap.min.css',
        '/assets/css/font-awesome.min.css',
        '/assets/css/line-awesome.min.css',
        '/assets/css/style 3.css',
        '/assets/css/responsive.css',
      ]
    : useStyle2
    ? [
        '/assets/css/bootstrap.min.css',
        '/assets/css/font-awesome.min.css',
        '/assets/css/line-awesome.min.css',
        '/assets/css/style2.css',
        '/assets/css/responsive.css',
      ]
    : undefined
  useExternalStylesheet(customStylesheets)
  const { user, logout, walletBalance, refreshWallet, systemConfig } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifsDropdownOpen, setNotifsDropdownOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  // Fetch notifications
  useEffect(() => {
    if (user) {
      api.get<{ data: Notification[] }>('/practitioners/me/notifications?limit=5')
        .then(({ data }) => {
          setNotifs(data.data ?? [])
        })
        .catch(() => {})
      
      // Also refresh wallet balance
      refreshWallet().catch(() => {})
    }
  }, [user])

  useEffect(() => {
    // Set class and id on document.body to match chiropractor stylesheets
    document.body.classList.add('dashbody')
    document.body.id = 'addclass'

    const handleClose = () => {
      setNotifsDropdownOpen(false)
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

  // Handle mobile menu drawer toggle
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

  const unreadNotifsCount = notifs.filter((n) => !n.is_read).length

  const isActive = (path: string) => {
    return location.pathname === path
  }

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-5 col-5">
              <div className="sidebar-logo">
                <Link to="/dashboard">
                  <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
                </Link>
              </div>
            </div>
            <div className="col-md-7 col-7">
              <div className="topbar-right">
                <div className="header-right navbar">
                  <div className="mobile-logo">
                    <Link to="/dashboard">
                      <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
                    </Link>
                  </div>
                  <ul className="navbar-nav ms-auto flex-row align-items-center">
                    <li className="nav-item upgrade-nav">
                      {systemConfig.token_buying_disabled ? (
                        <span className="nav-link" style={{ cursor: 'default' }}>
                          <i className="la la-star"></i>
                          {walletBalance !== null ? `${walletBalance} Tokens` : '0 Tokens'}
                        </span>
                      ) : (
                        <Link className="nav-link" to="/wallet">
                          <i className="la la-star"></i>
                          {walletBalance !== null ? `${walletBalance} Tokens` : '0 Tokens'}
                        </Link>
                      )}
                    </li>
                    <li
                      className={`nav-item dropdown notifications ${notifsDropdownOpen ? 'show' : ''}`}
                      style={{ position: 'relative' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="nav-link dropdown-toggle bg-transparent border-0 p-0 position-relative"
                        onClick={() => {
                          setNotifsDropdownOpen(!notifsDropdownOpen)
                          setProfileDropdownOpen(false)
                        }}
                      >
                        <img src="/assets/images/notifications.svg" className="img-fluid" alt="Notifications" />
                        {unreadNotifsCount > 0 && (
                          <span
                            className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle"
                            style={{ width: '8px', height: '8px' }}
                          ></span>
                        )}
                      </button>
                      <ul
                        className={`dropdown-menu dropdown-menu-end ${notifsDropdownOpen ? 'show' : ''}`}
                        style={{ position: 'absolute', right: 0, top: '100%', margin: '15px 0 0' }}
                      >
                        {notifs.length === 0 ? (
                          <li>
                            <span className="dropdown-item text-secondary py-2 text-center" style={{ fontSize: '13px' }}>
                              No notifications
                            </span>
                          </li>
                        ) : (
                          notifs.map((n) => (
                            <li key={n.id}>
                              <Link
                                className="dropdown-item py-2"
                                to="/dashboard"
                                style={{ whiteSpace: 'normal', maxWidth: '280px' }}
                                onClick={() => setNotifsDropdownOpen(false)}
                              >
                                <div className="fw-semibold text-dark" style={{ fontSize: '13px' }}>
                                  {n.title}
                                </div>
                                <div className="text-secondary mt-0.5" style={{ fontSize: '11px', lineHeight: '1.3' }}>
                                  {n.body}
                                </div>
                              </Link>
                            </li>
                          ))
                        )}
                      </ul>
                    </li>
                    <li
                      className={`nav-item dropdown profiledrop ${profileDropdownOpen ? 'show' : ''}`}
                      style={{ position: 'relative' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="nav-link dropdown-toggle bg-transparent border-0 p-0"
                        onClick={() => {
                          setProfileDropdownOpen(!profileDropdownOpen)
                          setNotifsDropdownOpen(false)
                        }}
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
                          <Link className="dropdown-item" to="/profile" onClick={() => setProfileDropdownOpen(false)}>
                            <img src="/assets/images/profile.svg" className="img-fluid" style={{ marginRight: '10px' }} alt="" />
                            Profile
                          </Link>
                        </li>
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
                            <img src="/assets/images/logout.svg" className="img-fluid" alt="Logout" />
                            Logout
                          </a>
                        </li>
                      </ul>
                    </li>
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

      {/* Sidebar */}
      <div className="sidebar">
        {/* Profile section at top of sidebar */}
        <div style={{ padding: '20px 16px 16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <Link to="/profile" onClick={() => setIsMobileNavOpen(false)} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <img
              src={user?.profile_pic_url || '/assets/images/user.png'}
              className="img-fluid rounded-circle"
              alt="Profile"
              style={{ width: '60px', height: '60px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }}
            />
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: '500', lineHeight: 1.2 }}>
              {user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'Profile'}
            </span>
          </Link>
        </div>
        <ul>
          <li className={isActive('/dashboard') && !location.search.includes('section=notifications') ? 'active' : ''}>
            <Link to="/dashboard" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/dashboard.svg" className="img-fluid" alt="" />
              </span>
              Dashboard
            </Link>
          </li>
          <li className={isActive('/dashboard') && location.search.includes('section=notifications') ? 'active' : ''}>
            <Link to="/dashboard?section=notifications" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/notifications.svg" className="img-fluid" alt="" />
              </span>
              Notifications
            </Link>
          </li>
          <li className={isActive('/documents') ? 'active' : ''}>
            <Link to="/documents" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/documents.svg" className="img-fluid" alt="" />
              </span>
              Documents
            </Link>
          </li>
          <li className={isActive('/marketplace') ? 'active' : ''}>
            <Link to="/marketplace" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/marketplace.svg" className="img-fluid" alt="" />
              </span>
              Marketplace
            </Link>
          </li>
          {!systemConfig.token_buying_disabled && (
            <li className={isActive('/wallet') ? 'active' : ''}>
              <Link to="/wallet" onClick={() => setIsMobileNavOpen(false)}>
                <span>
                  <img src="/assets/images/tokenwallet.svg" className="img-fluid" alt="" />
                </span>
                Token Wallet
              </Link>
            </li>
          )}
          {!systemConfig.subscription_system_disabled && (
            <li className={isActive('/subscription') ? 'active' : ''}>
              <Link to="/subscription" onClick={() => setIsMobileNavOpen(false)}>
                <span>
                  <img src="/assets/images/subscription.svg" className="img-fluid" alt="" />
                </span>
                Subscription
              </Link>
            </li>
          )}
          <li className={isActive('/feedback') ? 'active' : ''}>
            <Link to="/feedback" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
              </span>
              Feedback
            </Link>
          </li>
          <li className={isActive('/support') ? 'active' : ''}>
            <Link to="/support" onClick={() => setIsMobileNavOpen(false)}>
              <span>
                <img src="/assets/images/feedback.svg" className="img-fluid" alt="" />
              </span>
              Support
            </Link>
          </li>
        </ul>
      </div>

      {/* Mainbody wrapper */}
      <div className="mainbody">
        <div className="container-fluid">{children}</div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-6">
              <div className="copyright-left">
                <p>© {new Date().getFullYear()} Chiropractor. All rights reserved.</p>
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
