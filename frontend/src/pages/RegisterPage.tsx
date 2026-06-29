import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { getApiError } from '@/lib/utils'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

// Kept exactly as original schema to ensure zero functionality changes
const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  confirm_password: z.string(),
  terms: z.boolean().refine(v => v === true, { message: 'You must agree to the Terms of Use and Privacy Policy' }),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  useExternalStylesheet()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      await api.post('/auth/register', {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        password: data.password,
      })
      toast.success('Account created! Redirecting…')
      const user = await login(data.email, data.password)
      if (user.role === 'admin') navigate('/admin', { replace: true })
      else navigate('/profile', { replace: true })
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  return (
    <div className="signbg">
      <section className="login-sec signup-sec">
        <Link to="#" className="loginlogo signup-logo">
          <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
        </Link>
        <div className="login-bg">
          <div className="loginheading">
            <h1>Chiropractor Registration</h1>
            <p>Create your account to join our trusted referral network.</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="first_name">First Name *</label>
                  <input
                    id="first_name"
                    type="text"
                    placeholder="Enter first name"
                    className={`form-control ${errors.first_name ? 'is-invalid' : ''}`}
                    {...register('first_name')}
                  />
                  {errors.first_name && (
                    <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                      {errors.first_name.message}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="last_name">Last Name *</label>
                  <input
                    id="last_name"
                    type="text"
                    placeholder="Enter last name"
                    className={`form-control ${errors.last_name ? 'is-invalid' : ''}`}
                    {...register('last_name')}
                  />
                  {errors.last_name && (
                    <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                      {errors.last_name.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                    {...register('email')}
                  />
                  {errors.email && (
                    <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                      {errors.email.message}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
                  <input
                    id="phone"
                    type="text"
                    placeholder="Enter phone number"
                    className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
                    {...register('phone')}
                  />
                  {errors.phone && (
                    <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                      {errors.phone.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="password">Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
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
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label htmlFor="confirm_password">Confirm Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="confirm_password"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Confirm password"
                      className={`form-control ${errors.confirm_password ? 'is-invalid' : ''}`}
                      style={{ paddingRight: '45px' }}
                      {...register('confirm_password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
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
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.confirm_password && (
                    <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                      {errors.confirm_password.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-group form-check">
              <label className="form-check-label">
                <input className="form-check-input" type="checkbox" {...register('terms')} required />{' '}
                I agree with <Link to="/terms">Terms of Use</Link> and <Link to="/privacy">Privacy Policy</Link>.
              </label>
              {errors.terms && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.terms.message}
                </div>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn btn-info w-100">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2 d-inline-block" /> : null}
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>

            <div className="dontaccountdiv">
              <p className="dontaccount">
                Already have an account? <Link to="/login">Sign In</Link>
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
