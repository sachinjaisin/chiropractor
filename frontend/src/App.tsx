import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import RegisterPage from '@/pages/RegisterPage'
import SubscriptionPage from '@/pages/SubscriptionPage'
import FeedbackPage from '@/pages/FeedbackPage'
import LoginPage from '@/pages/LoginPage'
import ProfilePage from '@/pages/ProfilePage'
import PendingApprovalPage from '@/pages/PendingApprovalPage'
import AdminPage from '@/pages/AdminPage'
import DocumentsPage from '@/pages/DocumentsPage'
import DashboardPage from '@/pages/DashboardPage'
import WalletPage from '@/pages/WalletPage'
import MarketplacePage from '@/pages/MarketplacePage'
import PublicReferralPage from '@/pages/PublicReferralPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import ClaimReferralDetailPage from '@/pages/ClaimReferralDetailPage'
import MatchesPage from '@/pages/MatchesPage'
import SupportPage from '@/pages/SupportPage'

import { Loader2 } from 'lucide-react'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  )
}

function homeFor(user: { role: string; practitioner_status?: string }) {
  if (user.role === 'admin') return '/admin'
  if (user.practitioner_status === 'REJECTED') return '/pending'
  if (user.practitioner_status === 'PROFILE_COMPLETED') return '/documents'
  if (user.practitioner_status === 'ACTIVE' || user.practitioner_status === 'SUSPENDED') return '/dashboard'
  if (user.practitioner_status === 'PENDING_APPROVAL') return '/pending'
  return '/profile' // PENDING_PROFILE or undefined
}

/** Admin route guard — only admin users can access /admin.
 *  Everyone logs in via /login; homeFor() routes admins here automatically. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user || user.role !== 'admin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Profile page — simplified: redirect ACTIVE/SUSPENDED to /dashboard, REJECTED to /pending, otherwise allow */
function ProfileRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  if (user.practitioner_status === 'REJECTED') return <Navigate to="/pending" replace />
  if (user.practitioner_status === 'PENDING_APPROVAL') return <Navigate to="/pending" replace />
  return <>{children}</>
}

/** Pending page — REJECTED and PENDING_APPROVAL; all others go to their proper home */
function PendingRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  if (
    user.practitioner_status !== 'REJECTED' &&
    user.practitioner_status !== 'PENDING_APPROVAL'
  ) return <Navigate to={homeFor(user)} replace />
  return <>{children}</>
}

/** Documents page — requires PROFILE_COMPLETED status */
function DocumentsRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  
  const allowedStatuses = ['PROFILE_COMPLETED', 'ACTIVE', 'SUSPENDED']
  if (!allowedStatuses.includes(user.practitioner_status ?? '')) {
    return <Navigate to={homeFor(user)} replace />
  }
  return <>{children}</>
}

/** Dashboard page — requires ACTIVE or SUSPENDED status */
function DashboardRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  if (user.practitioner_status !== 'ACTIVE' && user.practitioner_status !== 'SUSPENDED') return <Navigate to={homeFor(user)} replace />
  return <>{children}</>
}

/** Wallet page — requires ACTIVE or SUSPENDED status */
function WalletRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  if (user.practitioner_status !== 'ACTIVE' && user.practitioner_status !== 'SUSPENDED') return <Navigate to={homeFor(user)} replace />
  return <>{children}</>
}

/** Redirects logged-in users to their home based on role/status */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <>{children}</>
  return <Navigate to={homeFor(user)} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password"  element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />

      <Route path="/pending"   element={<PendingRoute><PendingApprovalPage /></PendingRoute>} />
      <Route path="/admin"     element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/profile"   element={<ProfileRoute><ProfilePage /></ProfileRoute>} />
      <Route path="/documents" element={<DocumentsRoute><DocumentsPage /></DocumentsRoute>} />
      <Route path="/dashboard" element={<DashboardRoute><DashboardPage /></DashboardRoute>} />
      <Route path="/wallet"    element={<WalletRoute><WalletPage /></WalletRoute>} />
      <Route path="/subscription" element={<DashboardRoute><SubscriptionPage /></DashboardRoute>} />
      <Route path="/marketplace" element={<DashboardRoute><MarketplacePage /></DashboardRoute>} />
      <Route path="/feedback" element={<DashboardRoute><FeedbackPage /></DashboardRoute>} />
      <Route path="/support"  element={<DashboardRoute><SupportPage /></DashboardRoute>} />
      <Route path="/referrals/claimed/:referralId" element={<DashboardRoute><ClaimReferralDetailPage /></DashboardRoute>} />

      <Route path="/referral" element={<PublicReferralPage />} />
      <Route path="/feedback/:referralId" element={<FeedbackPage />} />

      <Route path="/matches/:referralId" element={<AdminRoute><MatchesPage /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/register" replace />
  return <Navigate to={homeFor(user)} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
