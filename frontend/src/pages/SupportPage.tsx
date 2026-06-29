import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import DashboardShell from '@/components/DashboardShell'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'

const schema = z.object({
  name:    z.string().min(1, 'Name is required').max(200),
  email:   z.string().email('Invalid email address'),
  phone:   z.string().max(50).optional().or(z.literal('')),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
})

type FormData = z.infer<typeof schema>

export default function SupportPage() {
  const { user } = useAuth()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:  user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : '',
      email: user?.email ?? '',
      phone: '',
      message: '',
    },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await api.post('/public/contact', {
        name:    data.name,
        email:   data.email,
        phone:   data.phone || undefined,
        message: data.message,
      })
      setSubmitted(true)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardShell>
      <div className="row toprow">
        <div className="col-md-12">
          <div className="page-title">
            <h1>Support / Enquiry</h1>
            <p>Have a question or need help? Fill in the form below and our team will respond promptly.</p>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-12">
          {submitted ? (
            <div className="carddesign text-center" style={{ padding: '40px 24px' }}>
              <div className="cardbody">
                <CheckCircle style={{ width: 56, height: 56, color: '#16a34a', margin: '0 auto 16px' }} />
                <h5 style={{ fontWeight: 700, color: '#1f244a', marginBottom: 8 }}>Message Sent!</h5>
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  Thank you for reaching out. Our team will get back to you as soon as possible.
                </p>
                <button
                  className="btn btn-primary mt-4"
                  onClick={() => setSubmitted(false)}
                >
                  Send Another Message
                </button>
              </div>
            </div>
          ) : (
            <div className="carddesign">
              <div className="cardbody">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Full Name <span style={{ color: '#dc2626' }}>*</span></label>
                    <input
                      type="text"
                      className={`form-control${errors.name ? ' is-invalid' : ''}`}
                      placeholder="Your full name"
                      {...register('name')}
                    />
                    {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address <span style={{ color: '#dc2626' }}>*</span></label>
                    <input
                      type="email"
                      className={`form-control${errors.email ? ' is-invalid' : ''}`}
                      placeholder="your@email.com"
                      {...register('email')}
                    />
                    {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="+1 (555) 000-0000"
                      {...register('phone')}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Message <span style={{ color: '#dc2626' }}>*</span></label>
                    <textarea
                      className={`form-control${errors.message ? ' is-invalid' : ''}`}
                      rows={6}
                      placeholder="Describe your question or issue..."
                      {...register('message')}
                    />
                    {errors.message && <div className="invalid-feedback">{errors.message.message}</div>}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-100"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {loading && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}
                    {loading ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
