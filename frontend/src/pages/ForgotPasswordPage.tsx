import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
})

type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  useExternalStylesheet()
  const [isSent, setIsSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      await api.post('/auth/forgot-password', { email: data.email })
      setIsSent(true)
      toast.success('Reset email sent if the account exists.')
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
            <h1>Forgot Password</h1>
            {isSent ? (
              <p>We've sent a password reset link to your email address.</p>
            ) : (
              <p>Enter your email address and we'll send you a link to reset your password.</p>
            )}
          </div>
          {isSent ? (
            <div className="text-center py-3">
              <div className="alert alert-success" role="alert">
                If an account matches that email, we have sent a password reset link. The link expires in 1 hour.
              </div>
              <div className="dontaccountdiv mt-4">
                <p className="dontaccount">
                  Back to <Link to="/login">Sign In</Link>
                </p>
              </div>
            </div>
          ) : (
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

              <button type="submit" disabled={isSubmitting} className="btn btn-info w-100 mt-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2 d-inline-block" /> : null}
                {isSubmitting ? 'Sending Link...' : 'Send Reset Link'}
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
