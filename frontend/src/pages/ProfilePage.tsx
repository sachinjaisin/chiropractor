import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, User, Pencil } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import OnboardingSteps from '@/components/OnboardingSteps'
import DashboardShell from '@/components/DashboardShell'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

const SPECIALTIES = [
  'Back Pain',
  'Neck Pain',
  'Headaches/Migraine',
  'Pregnancy Care',
  'Pediatrics',
  'Tinnitus',
  'Wellness Care',
  'Other',
] as const

const schema = z.object({
  // Practice Information
  practice_name: z.string().min(1, 'Practice name is required'),
  street_address: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'Enter 2-letter state code (e.g. CA)').toUpperCase(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  website: z.string().regex(/^https?:\/\/.+/, 'Enter a valid URL (e.g. https://…)').or(z.literal('')).optional(),
  practice_phone: z.string().optional(),
  practice_email: z.string().email({ message: 'Enter a valid email' }).or(z.literal('')).optional(),
  profile_pic_url: z.string().nullable().optional(),
  // Professional Information
  bio: z.string().max(2000, 'Bio max 2000 characters').optional(),
  years_experience: z.number().min(0).max(60).optional().or(z.nan()),
  languages_spoken: z.string().optional(),
  // Coverage
  service_radius_km: z.number().min(1, 'Minimum 1 km').max(500),
  areas_served: z.string().optional(),
  specialties: z.array(z.string()).min(1, 'Select at least one specialty'),
})

type FormData = z.infer<typeof schema>

function tagsFromString(s: string | undefined): string[] {
  if (!s) return []
  return s.split(',').map((t) => t.trim()).filter(Boolean)
}

function stringFromArray(arr: string[] | undefined): string {
  return (arr ?? []).join(', ')
}

function getFormattedImageUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/uploads/')) {
    const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/v1$/, '')
    return `${baseUrl}${url}`
  }
  return url
}


export default function ProfilePage() {
  useExternalStylesheet()
  const { user, setUser } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null)
  const [isUploadingPic, setIsUploadingPic] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { specialties: [], service_radius_km: 40 },
  })

  useEffect(() => {
    api
      .get('/practitioners/me/profile')
      .then(({ data }) => {
        reset({
          practice_name: data.practice_name ?? '',
          street_address: data.street_address ?? '',
          city: data.city ?? '',
          state: data.state ?? '',
          zip_code: data.zip_code ?? '',
          website: data.website ?? '',
          practice_phone: data.practice_phone ?? '',
          practice_email: data.practice_email ?? '',
          bio: data.bio ?? '',
          years_experience: data.years_experience ?? undefined,
          languages_spoken: stringFromArray(data.languages_spoken),
          service_radius_km: data.service_radius_km ?? 40,
          areas_served: stringFromArray(data.areas_served),
          specialties: data.specialties ?? [],
          profile_pic_url: data.profile_pic_key ?? '',
        })
        if (data.profile_pic_url) {
          setProfilePicPreview(getFormattedImageUrl(data.profile_pic_url))
        }
      })
      .catch(() => {}) // first time — no profile yet
      .finally(() => setIsLoading(false))
  }, [reset])

  async function handleProfilePicChange(e: React.ChangeEvent<HTMLInputElement>, onChange: (val: string | null) => void) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedMimeTypes.includes(file.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, WEBP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size too large. Maximum is 2 MB.')
      return
    }

    setIsUploadingPic(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string; key: string }>('/practitioners/me/profile-pic', formData)
      // Update form field
      onChange(data.key)
      const formattedUrl = getFormattedImageUrl(data.url)
      setProfilePicPreview(formattedUrl)
      // Auto-save profile picture
      await api.put('/practitioners/me/profile', { profile_pic_url: data.key })
      if (user) {
        setUser({ ...user, profile_pic_url: formattedUrl })
      }
      toast.success('Profile picture uploaded and saved.')
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsUploadingPic(false)
    }
  }

  async function handleRemoveProfilePic(onChange: (val: string | null) => void) {
    try {
      await api.delete('/practitioners/me/profile-pic')
      onChange(null)
      setProfilePicPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (user) {
        setUser({ ...user, profile_pic_url: null })
      }
      toast.success('Profile picture removed successfully.')
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  async function onSubmit(data: FormData) {
    setSaveError(null)
    try {
      const yearsExp =
        data.years_experience === undefined || isNaN(data.years_experience) ? null : data.years_experience
      const { data: saved } = await api.put('/practitioners/me/profile', {
        practice_name: data.practice_name,
        street_address: data.street_address,
        city: data.city,
        state: data.state.toUpperCase(),
        zip_code: data.zip_code,
        website: data.website || null,
        practice_phone: data.practice_phone || null,
        practice_email: data.practice_email || null,
        bio: data.bio || null,
        years_experience: yearsExp,
        languages_spoken: tagsFromString(data.languages_spoken),
        service_radius_km: data.service_radius_km,
        areas_served: tagsFromString(data.areas_served),
        specialties: data.specialties,
        profile_pic_url: data.profile_pic_url || null,
      })

      if (user && saved.status && (saved.status !== user.practitioner_status || saved.profile_pic_url !== user.profile_pic_url)) {
        setUser({ ...user, practitioner_status: saved.status, profile_pic_url: saved.profile_pic_url })
      }
      if (saved.status === 'PROFILE_COMPLETED') {
        toast.success('Profile complete! Redirecting to documents upload...')
        navigate('/documents')
      } else {
        toast.success('Profile saved successfully!')
      }
    } catch (err) {
      setSaveError(getApiError(err))
    }
  }

  const isApproved = user && (user.practitioner_status === 'ACTIVE' || user.practitioner_status === 'SUSPENDED')

  const formContent = (
    <fieldset disabled={isSubmitting}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
        {/* Practice Information */}
        <div className="forminner-heading">
          <h2>Practice Information</h2>
        </div>

        {/* Profile Picture Upload Section (Optional) */}
        <div className="form-group mb-4 text-center">
          <Controller
            name="profile_pic_url"
            control={control}
            render={({ field }) => (
              <div className="d-flex flex-column align-items-center gap-2 mt-2">
                {/* Outer relative wrapper to allow badge overflow without clipping */}
                <div 
                  className="position-relative"
                  style={{ 
                    width: '96px', 
                    height: '96px', 
                    cursor: 'pointer'
                  }}
                  onClick={() => !isUploadingPic && fileInputRef.current?.click()}
                  title="Click to upload/change image"
                >
                  {/* Inner circle with overflow: hidden for clipping the avatar */}
                  <div
                    className="w-100 h-100 rounded-circle bg-gray-100 d-flex align-items-center justify-content-center border border-gray-300 shadow-sm"
                    style={{ overflow: 'hidden' }}
                  >
                    {profilePicPreview ? (
                      <img src={profilePicPreview} className="w-100 h-100 object-fit-cover" alt="Profile Preview" />
                    ) : (
                      <User className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                  
                  {/* Pencil overlay badge positioned on the outer edge */}
                  <div 
                    className="position-absolute bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                    style={{ 
                      width: '28px', 
                      height: '28px', 
                      border: '2px solid white', 
                      bottom: '-2px',
                      right: '-2px',
                      zIndex: 2
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </div>

                  {/* Upload spinner overlay */}
                  {isUploadingPic && (
                    <div className="position-absolute inset-0 bg-black bg-opacity-50 d-flex align-items-center justify-content-center rounded-circle" style={{ zIndex: 1 }}>
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="d-none"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleProfilePicChange(e, field.onChange)}
                />

                {profilePicPreview && (
                  <button
                    type="button"
                    onClick={() => handleRemoveProfilePic(field.onChange)}
                    className="btn btn-link btn-sm text-danger text-decoration-none mt-1 p-0"
                    style={{ fontSize: '13px' }}
                  >
                    Remove Image
                  </button>
                )}
              </div>
            )}
          />
        </div>

        <div className="form-group">
          <label htmlFor="practice_name">Practice Name *</label>
          <input
            id="practice_name"
            type="text"
            placeholder="Enter practice name"
            className={`form-control ${errors.practice_name ? 'is-invalid' : ''}`}
            {...register('practice_name')}
          />
          {errors.practice_name && (
            <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
              {errors.practice_name.message}
            </div>
          )}
        </div>

        <div className="row">
          <div className="col-md-6">
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
          </div>
          <div className="col-md-6">
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
        </div>

        <div className="row">
          <div className="col-md-6">
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
          <div className="col-md-6">
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

        <div className="row">
          <div className="col-md-4">
            <div className="form-group">
              <label htmlFor="practice_email">Practice Email</label>
              <input
                id="practice_email"
                type="email"
                placeholder="info@practice.com"
                className={`form-control ${errors.practice_email ? 'is-invalid' : ''}`}
                {...register('practice_email')}
              />
              {errors.practice_email && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.practice_email.message}
                </div>
              )}
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label htmlFor="practice_phone">Practice Phone</label>
              <input
                id="practice_phone"
                type="text"
                placeholder="Enter phone number"
                className="form-control"
                {...register('practice_phone')}
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                placeholder="https://practice.com"
                className={`form-control ${errors.website ? 'is-invalid' : ''}`}
                {...register('website')}
              />
              {errors.website && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.website.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Professional Information */}
        <div className="forminner-heading">
          <h2>Professional Information</h2>
        </div>

        <div className="form-group">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            rows={3}
            placeholder="Tell patients about your approach and practice..."
            className={`form-control ${errors.bio ? 'is-invalid' : ''}`}
            {...register('bio')}
          />
          {errors.bio && (
            <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
              {errors.bio.message}
            </div>
          )}
        </div>

        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="years_experience">Years of Experience</label>
              <input
                id="years_experience"
                type="number"
                placeholder="e.g. 5"
                className={`form-control ${errors.years_experience ? 'is-invalid' : ''}`}
                {...register('years_experience', { valueAsNumber: true })}
              />
              {errors.years_experience && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.years_experience.message}
                </div>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="languages_spoken">Languages Spoken</label>
              <input
                id="languages_spoken"
                type="text"
                placeholder="English, Spanish (comma separated)"
                className="form-control"
                {...register('languages_spoken')}
              />
            </div>
          </div>
        </div>

        {/* Coverage Information */}
        <div className="forminner-heading">
          <h2>Coverage Information</h2>
        </div>

        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="service_radius_km">Service Radius (km) *</label>
              <input
                id="service_radius_km"
                type="number"
                placeholder="40"
                className={`form-control ${errors.service_radius_km ? 'is-invalid' : ''}`}
                {...register('service_radius_km', { valueAsNumber: true })}
              />
              {errors.service_radius_km && (
                <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
                  {errors.service_radius_km.message}
                </div>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="areas_served">Areas Served</label>
              <input
                id="areas_served"
                type="text"
                placeholder="Downtown, Westside (comma separated)"
                className="form-control"
                {...register('areas_served')}
              />
            </div>
          </div>
        </div>

        <div className="form-group mt-3">
          <label className="fw-semibold">Specialties *</label>
          {errors.specialties && (
            <div className="text-danger mb-2" style={{ fontSize: '14px' }}>
              {errors.specialties.message}
            </div>
          )}
          <Controller
            name="specialties"
            control={control}
            render={({ field }) => (
              <ul className="radiolist-ul">
                {SPECIALTIES.map((s, idx) => {
                  const checked = field.value?.includes(s) ?? false
                  const inputId = `specialty_chk_${idx}`
                  return (
                    <li key={s}>
                      <div className="form-check">
                        <input
                          type="checkbox"
                          id={inputId}
                          className="form-check-input"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...(field.value ?? []), s]
                              : (field.value ?? []).filter((v: string) => v !== s)
                            field.onChange(next)
                          }}
                        />
                        <label className="form-check-label" htmlFor={inputId}>
                          {s}
                        </label>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          />
        </div>

        {saveError && (
          <div className="alert alert-danger mt-3" role="alert">
            {saveError}
          </div>
        )}

        <div className="btn-right mt-4">
          <button type="submit" disabled={isSubmitting} className="btn btn-info px-4">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin d-inline-block mr-2" /> : null}
            {isSubmitting ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </fieldset>
  )

  if (isApproved) {
    return (
      <DashboardShell>
        {/* Title */}
        <div className="row toprow pt-4">
          <div className="col-md-12">
            <div className="page-title">
              <h1>Profile Settings</h1>
              <p>Update your practice, professional, and coverage information.</p>
            </div>
          </div>
        </div>

        {/* Profile Completion Form Card */}
        <div className="carddesign">
          <div className="cardheading">
            <h2 className="m-0" style={{ fontSize: '18px' }}>
              Update Profile Details
            </h2>
          </div>
          <div className="cardbody">
            {isLoading ? (
              <div className="text-center py-5">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              formContent
            )}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="carddesign mt-4">
          <div className="cardheading">
            <h2 className="m-0" style={{ fontSize: '18px' }}>
              Change Password
            </h2>
          </div>
          <div className="cardbody">
            <ChangePasswordForm />
          </div>
        </div>
      </DashboardShell>
    )
  }

  // Standalone onboarding layout
  return (
    <div className="min-h-screen bg-light">
      <header
        className="bg-white border-bottom border-gray-200 sticky-top z-3"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <div className="container-md d-flex align-items-center justify-content-between" style={{ height: '56px' }}>
          <Link to="/" className="fw-bold text-dark text-decoration-none hover-primary">
            Chiropractor Referral Network
          </Link>
          <div className="d-flex align-items-center gap-3 text-sm">
            {isLoading ? (
              <span className="placeholder col-6" style={{ width: '80px' }} />
            ) : (
              <span className="text-secondary">
                {user?.first_name} {user?.last_name}
              </span>
            )}
            <LogoutButton className="text-primary fw-medium bg-transparent border-0 p-0" />
          </div>
        </div>
      </header>

      <div className="signbg py-4">
        <section className="login-sec patient-referral my-4">
          <div className="text-center mb-4">
            <Link to="#" className="loginlogo">
              <img src="/assets/images/logo.png" className="img-fluid" alt="Logo" />
            </Link>
          </div>

          <div className="container">
            <div className="bg-white rounded-3 p-3 mb-4 shadow-sm">
              <OnboardingSteps status={user?.practitioner_status} />
            </div>

            <div className="login-bg shadow-sm">
              <div className="loginheading">
                <h1>Practitioner Profile Completion</h1>
                <p>Please provide your practice and professional information.</p>
              </div>

              {isLoading ? (
                <div className="text-center py-5">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="mt-2 text-secondary">Loading profile data...</p>
                </div>
              ) : (
                formContent
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const passwordSchema = z
    .object({
      current_password: z.string().min(1, 'Current password is required'),
      new_password: z.string().min(10, 'New password must be at least 10 characters'),
      confirm_password: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.new_password === data.confirm_password, {
      message: 'Passwords do not match',
      path: ['confirm_password'],
    })

  type PasswordFormData = z.infer<typeof passwordSchema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  async function onSubmit(data: PasswordFormData) {
    try {
      await api.post('/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast.success('Password changed successfully!')
      reset()
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="formdesign">
      <div className="form-group">
        <label htmlFor="current_password">Current Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="current_password"
            type={showCurrent ? 'text' : 'password'}
            placeholder="Enter current password"
            className={`form-control ${errors.current_password ? 'is-invalid' : ''}`}
            style={{ paddingRight: '45px' }}
            {...register('current_password')}
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
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
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.current_password && (
          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
            {errors.current_password.message}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="new_password">New Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="new_password"
            type={showNew ? 'text' : 'password'}
            placeholder="Enter new password (min 10 characters)"
            className={`form-control ${errors.new_password ? 'is-invalid' : ''}`}
            style={{ paddingRight: '45px' }}
            {...register('new_password')}
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
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
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.new_password && (
          <div className="text-danger mt-1" style={{ fontSize: '14px' }}>
            {errors.new_password.message}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="confirm_password">Confirm New Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="confirm_password"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirm new password"
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

      <div className="btn-right mt-3">
        <button type="submit" disabled={isSubmitting} className="btn btn-info">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin d-inline-block mr-2" /> : null}
          {isSubmitting ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </form>
  )
}
