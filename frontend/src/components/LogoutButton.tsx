import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface Props {
  className?: string
  label?: string
}

export default function LogoutButton({ className = 'btn-secondary', label = 'Sign out' }: Props) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleConfirm() {
    setIsLoading(true)
    try {
      await logout();
      toast.success('Signed out successfully');
      setShowConfirm(false);
      navigate('/login', { replace: true });
      window.location.reload();
    } catch {
      toast.error('Sign out failed. Please try again.')
      setIsLoading(false)
      setShowConfirm(false)
    }
  }

  return (
    <>
      <button onClick={() => setShowConfirm(true)} className={`${className} flex items-center gap-2`}>
        <LogOut className="w-4 h-4" />
        {label}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Sign out?</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to sign out of your account?</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? 'Signing out…' : 'Yes, sign out'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isLoading}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
