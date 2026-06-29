import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { getApiError } from '@/lib/utils'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  useExternalStylesheet()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      const user = await login(data.email, data.password)
      if (user.role === 'admin') {
        navigate('/admin', { replace: true })
      } else if (user.practitioner_status === 'ACTIVE') {
        navigate('/profile', { replace: true })
      } else {
        navigate('/pending', { replace: true })
      }
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
            <h1>Welcome Back!</h1>
            <p>Sign in to your account to continue</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                {...register('email')}
              />
              {errors.email && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.email.message}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                  style={{ paddingRight: '45px' }}
                  {...register('password')}
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
              {errors.password && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.password.message}
                </div>
              )}
            </div>

            <div className="form-group form-check forgot">
              <label className="form-check-label">
                <input className="form-check-input" type="checkbox" name="remember" />
                Remember me
              </label>
              <Link to="/forgot-password" className="forgotlink">
                Forgot Password?
              </Link>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn btn-info w-100">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2 d-inline-block" /> : null}
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="dontaccountdiv">
              <p className="dontaccount">
                Don't have an account? <Link to="/register">Sign Up</Link>
              </p>
              <p className="dontaccount" style={{ marginTop: '5px' }}>
                Are you a patient? <Link to="/referral">Submit a Referral</Link>
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
