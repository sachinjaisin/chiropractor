import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

const schema = z
  .object({
    new_password: z.string().min(10, 'Password must be at least 10 characters'),
    confirm_password: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  useExternalStylesheet()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    if (!token) {
      toast.error('Reset token is missing from the URL.')
      return
    }
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: data.new_password,
      })
      setIsSuccess(true)
      toast.success('Password reset successfully.')
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  return (
    <div className="signbg">
      <section className="login-sec">
        <Link to="#" className="loginlogo">
          <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
        </Link>
        <div className="login-bg">
          <div className="loginheading">
            <h1>Reset Password</h1>
            {!token ? (
              <p>This password reset link is invalid or has expired.</p>
            ) : isSuccess ? (
              <p>Your password has been successfully reset.</p>
            ) : (
              <p>Enter your new password below.</p>
            )}
          </div>

          {!token ? (
            <div className="text-center py-3">
              <div className="alert alert-danger" role="alert" style={{ fontSize: '14px', textAlign: 'left' }}>
                <strong>Invalid Link</strong>
                <div className="mt-1">This password reset link is invalid or has expired. Please request a new link.</div>
              </div>
              <div className="dontaccountdiv mt-4">
                <p className="dontaccount">
                  <Link to="/forgot-password">Request Reset Link</Link>
                </p>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="text-center py-3">
              <div className="alert alert-success" role="alert" style={{ fontSize: '14px', textAlign: 'left' }}>
                <strong>Password Reset</strong>
                <div className="mt-1">Your password has been successfully reset. You can now log in using your new password.</div>
              </div>
              <div className="dontaccountdiv mt-4">
                <p className="dontaccount">
                  <Link to="/login">Go to Sign In</Link>
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
              <div className="form-group">
                <label htmlFor="new_password">New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    className={`form-control ${errors.new_password ? 'is-invalid' : ''}`}
                    style={{ paddingRight: '45px' }}
                    {...register('new_password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: '15px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0',
                      color: '#6c757d',
                    }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.new_password && (
                  <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                    {errors.new_password.message}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="confirm_password">Confirm New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    className={`form-control ${errors.confirm_password ? 'is-invalid' : ''}`}
                    style={{ paddingRight: '45px' }}
                    {...register('confirm_password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: '15px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0',
                      color: '#6c757d',
                    }}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirm_password && (
                  <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                    {errors.confirm_password.message}
                  </div>
                )}
              </div>

              <button type="submit" disabled={isSubmitting} className="btn btn-info w-100 mt-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2 d-inline-block" /> : null}
                {isSubmitting ? 'Resetting password...' : 'Reset Password'}
              </button>

              <div className="dontaccountdiv">
                <p className="dontaccount">
                  Back to <Link to="/login">Sign In</Link>
                </p>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
