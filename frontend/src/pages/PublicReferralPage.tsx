import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

const schema = z.object({
  // Patient Information
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  // Location Information
  street_address: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'Enter 2-letter state code (e.g. CA)').toUpperCase(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  // Referral Details
  primary_complaint: z.string().min(1, 'Primary complaint is required'),
  symptoms: z.string().optional(),
  duration_of_problem: z.string().optional(),
  urgency_level: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  preferred_contact: z.enum(['phone', 'email', 'either']).optional(),
  additional_notes: z.string().optional(),
  patient_problems: z.array(z.string()),
})

type FormData = z.infer<typeof schema>

const PROBLEMS = [
  'Back Pain', 'Neck Pain', 'Headaches/Migraine', 'Pregnancy Care',
  'Pediatrics', 'Tinnitus', 'Wellness Care', 'Other',
] as const

interface SuccessState {
  referral_number: string
}

export default function PublicReferralPage() {
  useExternalStylesheet()
  const [success, setSuccess] = useState<SuccessState | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      urgency_level: 'NORMAL',
      patient_problems: [],
    },
  })

  async function onSubmit(data: FormData) {
    const key = crypto.randomUUID()
    try {
      const { data: result } = await api.post('/public/referrals', {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email: data.email || null,
        street_address: data.street_address,
        city: data.city,
        state: data.state.toUpperCase(),
        zip_code: data.zip_code,
        primary_complaint: data.primary_complaint,
        symptoms: data.symptoms || null,
        duration_of_problem: data.duration_of_problem || null,
        urgency_level: data.urgency_level,
        preferred_contact: data.preferred_contact ?? null,
        additional_notes: data.additional_notes || null,
        patient_problems: data.patient_problems,
      }, {
        headers: { 'Idempotency-Key': key },
      })
      setSuccess({ referral_number: result.referral_number })
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  function handleSubmitAnother() {
    setSuccess(null)
    reset()
  }

  return (
    <div className="min-h-screen bg-light">
      {/* Top nav */}
      <header className="bg-white border-bottom border-gray-200 sticky-top z-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="container-md d-flex align-items-center justify-content-between" style={{ height: '56px' }}>
          <div>
            <span className="fw-bold text-dark me-2">Chiropractor Referral Network</span>
            <span className="text-secondary d-none d-sm-inline" style={{ fontSize: '14px' }}>| Submit a Referral</span>
          </div>
          <Link to="/login" className="text-primary fw-medium text-decoration-none text-sm">
            Chiropractor? Sign in &rarr;
          </Link>
        </div>
      </header>

      <div className="signbg py-4">
        {success ? (
          /* ---- SUCCESS STATE ---- */
          <section className="login-sec referral-submitted my-4">
            <div className="text-center mb-4">
              <Link to="#" className="loginlogo">
                <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
              </Link>
            </div>
            <div className="login-bg shadow-sm text-center">
              <div className="loginheading m-0">
                <img src="/assets/images/checkedg.png" className="img-fluid checkedg mb-3" alt="Success" />
                <h1>Referral Submitted!</h1>
                <p>Your referral number is:</p>
                <h4 className="my-3">
                  <span>{success.referral_number}</span>
                </h4>
                <p className="mb-4">Our team will match you with a qualified Chiropractor in your area within 1-2 business days.</p>
                <div className="btn-right text-center">
                  <button type="button" onClick={handleSubmitAnother} className="btn btn-info px-4">
                    Submit Another Referral
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* ---- FORM ---- */
          <section className="login-sec patient-referral my-4">
            <div className="text-center mb-4">
              <Link to="#" className="loginlogo">
                <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
              </Link>
            </div>
            <div className="login-bg shadow-sm">
              <div className="loginheading">
                <h1>Patient Referral Form</h1>
                <p>Fill out the form below and we will match the patient with a qualified Chiropractor in their area.</p>
              </div>

              <fieldset disabled={isSubmitting}>
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
                  
                  {/* Patient Information */}
                  <div className="forminner-heading">
                    <h2>Patient Information</h2>
                  </div>

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
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="email">Email Address</label>
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
                  </div>

                  {/* Location Information */}
                  <div className="forminner-heading">
                    <h2>Location Information</h2>
                  </div>

                  <div className="form-group">
                    <label htmlFor="street_address">Street Address *</label>
                    <input
                      id="street_address"
                      type="text"
                      placeholder="Enter street address"
                      className={`form-control ${errors.street_address ? 'is-invalid' : ''}`}
                      {...register('street_address')}
                    />
                    {errors.street_address && (
                      <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                        {errors.street_address.message}
                      </div>
                    )}
                  </div>

                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="city">City *</label>
                        <input
                          id="city"
                          type="text"
                          placeholder="Enter city"
                          className={`form-control ${errors.city ? 'is-invalid' : ''}`}
                          {...register('city')}
                        />
                        {errors.city && (
                          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                            {errors.city.message}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="state">State * (2 letters)</label>
                        <input
                          id="state"
                          type="text"
                          maxLength={2}
                          placeholder="CA"
                          className={`form-control uppercase ${errors.state ? 'is-invalid' : ''}`}
                          {...register('state')}
                        />
                        {errors.state && (
                          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                            {errors.state.message}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="zip_code">ZIP Code *</label>
                        <input
                          id="zip_code"
                          type="text"
                          placeholder="90001"
                          className={`form-control ${errors.zip_code ? 'is-invalid' : ''}`}
                          {...register('zip_code')}
                        />
                        {errors.zip_code && (
                          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                            {errors.zip_code.message}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Referral Details */}
                  <div className="forminner-heading">
                    <h2>Referral Details</h2>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="primary_complaint">Primary Complaint *</label>
                        <textarea
                          id="primary_complaint"
                          rows={3}
                          placeholder="Describe primary complaint"
                          className={`form-control ${errors.primary_complaint ? 'is-invalid' : ''}`}
                          {...register('primary_complaint')}
                        />
                        {errors.primary_complaint && (
                          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                            {errors.primary_complaint.message}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="symptoms">Symptoms</label>
                        <textarea
                          id="symptoms"
                          rows={3}
                          placeholder="Describe symptoms"
                          className="form-control"
                          {...register('symptoms')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group mt-2">
                    <label className="fw-semibold">What issues are you experiencing?</label>
                    <Controller
                      name="patient_problems"
                      control={control}
                      render={({ field }) => (
                        <ul className="radiolist-ul">
                          {PROBLEMS.map((p, idx) => {
                            const checked = field.value?.includes(p) ?? false
                            const chkId = `problem_chk_${idx}`
                            return (
                              <li key={p}>
                                <div className="form-check">
                                  <input
                                    type="checkbox"
                                    id={chkId}
                                    className="form-check-input"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...(field.value ?? []), p]
                                        : (field.value ?? []).filter((v: string) => v !== p)
                                      field.onChange(next)
                                    }}
                                  />
                                  <label className="form-check-label" htmlFor={chkId}>
                                    {p}
                                  </label>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="duration_of_problem">Duration of Problem</label>
                    <input
                      id="duration_of_problem"
                      type="text"
                      placeholder="e.g. 2 weeks"
                      className="form-control"
                      {...register('duration_of_problem')}
                    />
                  </div>

                  <div className="form-group">
                    <label className="fw-semibold">Urgency Level</label>
                    <Controller
                      name="urgency_level"
                      control={control}
                      render={({ field }) => (
                        <ul className="radiolist-ul">
                          {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((level, idx) => {
                            const radId = `urgency_rad_${idx}`
                            return (
                              <li key={level}>
                                <div className="form-check">
                                  <input
                                    type="radio"
                                    id={radId}
                                    name="urgency_level"
                                    className="form-check-input"
                                    checked={field.value === level}
                                    onChange={() => field.onChange(level)}
                                  />
                                  <label className="form-check-label" htmlFor={radId}>
                                    {level.charAt(0) + level.slice(1).toLowerCase()}
                                  </label>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="preferred_contact">Preferred Contact</label>
                    <Controller
                      name="preferred_contact"
                      control={control}
                      render={({ field }) => (
                        <select
                          id="preferred_contact"
                          className="form-control"
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            field.onChange(v === '' ? undefined : v)
                          }}
                        >
                          <option value="">-- No preference --</option>
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                          <option value="either">Either</option>
                        </select>
                      )}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="additional_notes">Additional Notes</label>
                    <textarea
                      id="additional_notes"
                      rows={3}
                      placeholder="Enter additional notes..."
                      className="form-control"
                      {...register('additional_notes')}
                    />
                  </div>

                  <div className="btn-right mt-4">
                    <button type="submit" disabled={isSubmitting} className="btn btn-info px-4">
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin d-inline-block mr-2" /> : null}
                      {isSubmitting ? 'Submitting Referral...' : 'Submit Referral'}
                    </button>
                  </div>
                </form>
              </fieldset>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
