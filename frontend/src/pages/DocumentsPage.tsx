import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import OnboardingSteps from '@/components/OnboardingSteps'
import LogoutButton from '@/components/LogoutButton'
import { Loader2 } from 'lucide-react'
import DashboardShell from '@/components/DashboardShell'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

type DocumentType = 'LICENSE' | 'INSURANCE' | 'CERTIFICATION' | 'TRAINING' | 'SUPPORTING'

interface PractitionerDocument {
  id: string
  document_type: DocumentType
  original_filename: string
  mime_type: string
  file_size_bytes: number
  verified_at: string | null
  expires_at: string | null
  created_at: string
}

const MAX_FILE_SIZE = 10485760 // 10 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const DOCUMENT_TYPE_META: Record<
  DocumentType,
  { label: string; description: string; required: boolean }
> = {
  LICENSE: {
    label: 'Chiropractic License',
    description: 'Upload your active chiropractic license.',
    required: true,
  },
  INSURANCE: {
    label: 'Insurance Certificate',
    description: 'Upload your professional liability insurance certificate.',
    required: true,
  },
  CERTIFICATION: {
    label: 'Professional Certifications',
    description: 'Upload any professional certifications.',
    required: false,
  },
  TRAINING: {
    label: 'Training Verification',
    description: 'Upload your training and education verification.',
    required: false,
  },
  SUPPORTING: {
    label: 'Additional Supporting Documents',
    description: 'Upload any additional documents that support your application.',
    required: false,
  },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  useExternalStylesheet()
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [documents, setDocuments] = useState<PractitionerDocument[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)

  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fileInputRefs = useRef<Partial<Record<DocumentType, HTMLInputElement | null>>>({})

  async function loadDocuments() {
    try {
      const { data: docsResponse } = await api.get<{ data: PractitionerDocument[] }>('/practitioners/me/documents')
      setDocuments(docsResponse.data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsLoadingDocs(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  function triggerFileInput(docType: DocumentType) {
    fileInputRefs.current[docType]?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, docType: DocumentType) {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file) return

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Allowed: PDF, JPEG, PNG, WEBP.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 10 MB.')
      return
    }

    setUploadingType(docType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', docType)

      const { data: newDoc } = await api.post<PractitionerDocument>(
        `/practitioners/me/documents?document_type=${docType}`,
        formData
      )

      const freshDocs = [...documents.filter((d) => d.document_type !== docType), newDoc]
      setDocuments(freshDocs)

      const types = new Set(freshDocs.map((d) => d.document_type))
      if (types.has('LICENSE') && types.has('INSURANCE')) {
        toast.success('Application submitted for review!')
        await refreshUser()
        navigate('/pending', { replace: true })
      } else {
        toast.success(`${DOCUMENT_TYPE_META[docType].label} uploaded successfully.`)
      }
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setUploadingType(null)
      const input = fileInputRefs.current[docType];
      if (input) {
        input.value = '';
      }
    }
  }

  async function handleDelete(doc: PractitionerDocument) {
    if (deletingId) return
    setDeletingId(doc.id)
    try {
      await api.delete(`/practitioners/me/documents/${doc.id}`)
      toast.success(`${DOCUMENT_TYPE_META[doc.document_type].label} removed.`)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const docsByType = documents.reduce<Partial<Record<DocumentType, PractitionerDocument>>>((acc, doc) => {
    acc[doc.document_type] = doc
    return acc
  }, {})

  const hasLicense = Boolean(docsByType['LICENSE'])
  const hasInsurance = Boolean(docsByType['INSURANCE'])
  const applicationSubmitted = hasLicense && hasInsurance
  const isApproved = user && (user.practitioner_status === 'ACTIVE' || user.practitioner_status === 'SUSPENDED')

  const formContent = (
    <form className="formdesign" onSubmit={(e) => e.preventDefault()}>
      {/* Row 1: License and Insurance */}
      <div className="row">
        <div className="col-md-6">
          <DocumentUploadCard
            docType="LICENSE"
            meta={DOCUMENT_TYPE_META['LICENSE']}
            existing={docsByType['LICENSE']}
            isUploading={uploadingType === 'LICENSE'}
            isDeleting={deletingId === docsByType['LICENSE']?.id}
            onTrigger={() => triggerFileInput('LICENSE')}
            onDelete={handleDelete}
            onChange={(e) => handleFileChange(e, 'LICENSE')}
            inputRef={(el) => {
              fileInputRefs.current['LICENSE'] = el
            }}
          />
        </div>

        <div className="col-md-6">
          <DocumentUploadCard
            docType="INSURANCE"
            meta={DOCUMENT_TYPE_META['INSURANCE']}
            existing={docsByType['INSURANCE']}
            isUploading={uploadingType === 'INSURANCE'}
            isDeleting={deletingId === docsByType['INSURANCE']?.id}
            onTrigger={() => triggerFileInput('INSURANCE')}
            onDelete={handleDelete}
            onChange={(e) => handleFileChange(e, 'INSURANCE')}
            inputRef={(el) => {
              fileInputRefs.current['INSURANCE'] = el
            }}
          />
        </div>
      </div>

      {/* Row 2: Certifications and Training */}
      <div className="row">
        <div className="col-md-6">
          <DocumentUploadCard
            docType="CERTIFICATION"
            meta={DOCUMENT_TYPE_META['CERTIFICATION']}
            existing={docsByType['CERTIFICATION']}
            isUploading={uploadingType === 'CERTIFICATION'}
            isDeleting={deletingId === docsByType['CERTIFICATION']?.id}
            onTrigger={() => triggerFileInput('CERTIFICATION')}
            onDelete={handleDelete}
            onChange={(e) => handleFileChange(e, 'CERTIFICATION')}
            inputRef={(el) => {
              fileInputRefs.current['CERTIFICATION'] = el
            }}
          />
        </div>

        <div className="col-md-6">
          <DocumentUploadCard
            docType="TRAINING"
            meta={DOCUMENT_TYPE_META['TRAINING']}
            existing={docsByType['TRAINING']}
            isUploading={uploadingType === 'TRAINING'}
            isDeleting={deletingId === docsByType['TRAINING']?.id}
            onTrigger={() => triggerFileInput('TRAINING')}
            onDelete={handleDelete}
            onChange={(e) => handleFileChange(e, 'TRAINING')}
            inputRef={(el) => {
              fileInputRefs.current['TRAINING'] = el
            }}
          />
        </div>
      </div>

      {/* Row 3: Supporting */}
      <div className="form-group">
        <DocumentUploadCard
          docType="SUPPORTING"
          meta={DOCUMENT_TYPE_META['SUPPORTING']}
          existing={docsByType['SUPPORTING']}
          isUploading={uploadingType === 'SUPPORTING'}
          isDeleting={deletingId === docsByType['SUPPORTING']?.id}
          onTrigger={() => triggerFileInput('SUPPORTING')}
          onDelete={handleDelete}
          onChange={(e) => handleFileChange(e, 'SUPPORTING')}
          inputRef={(el) => {
            fileInputRefs.current['SUPPORTING'] = el
          }}
        />
      </div>

      {!isApproved && (
        <div className="btn-right mt-4 d-flex justify-content-between align-items-center">
          <Link to="/profile" className="text-decoration-none fw-semibold text-primary">
            &larr; Back to Profile
          </Link>
          {applicationSubmitted && (
            <Link to="/pending" className="btn btn-info">
              Submit for Verification
            </Link>
          )}
        </div>
      )}
    </form>
  )

  if (isApproved) {
    return (
      <DashboardShell>
        {/* Title */}
        <div className="row toprow pt-4">
          <div className="col-md-12">
            <div className="page-title">
              <h1>Verification Documents</h1>
              <p>View, upload, and update your professional liability and chiropractic documents.</p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="carddesign">
          <div className="cardheading">
            <h2 className="m-0" style={{ fontSize: '18px' }}>
              Practice Verification Documents
            </h2>
          </div>
          <div className="cardbody">
            {isLoadingDocs ? (
              <div className="text-center py-5">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              formContent
            )}
          </div>
        </div>
      </DashboardShell>
    )
  }

  // Onboarding wizard layout
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
            <span className="text-secondary">
              {user?.first_name} {user?.last_name}
            </span>
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
            {user?.practitioner_status !== 'ACTIVE' && user?.practitioner_status !== 'SUSPENDED' && (
              <div className="bg-white rounded-3 p-3 mb-4 shadow-sm">
                <OnboardingSteps status={user?.practitioner_status} />
              </div>
            )}

            <div className="login-bg shadow-sm">
              <div className="loginheading">
                <h1>Upload Verification Documents</h1>
                <p>Upload your license and insurance to submit your application for review.</p>
              </div>

              {applicationSubmitted && (
                <div className="alert alert-success mb-4" role="alert">
                  <strong>Application Submitted for Review!</strong> Your application has been automatically submitted
                  for admin review once required documents are uploaded. Your status will move to{' '}
                  <strong>Pending Approval</strong> shortly.
                </div>
              )}

              {isLoadingDocs ? (
                <div className="text-center py-5">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="mt-2 text-secondary">Loading documents...</p>
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

interface DocumentUploadCardProps {
  docType: DocumentType
  meta: { label: string; description: string; required: boolean }
  existing: PractitionerDocument | undefined
  isUploading: boolean
  isDeleting: boolean
  onTrigger: () => void
  onDelete: (doc: PractitionerDocument) => void
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  inputRef: (el: HTMLInputElement | null) => void
}

function DocumentUploadCard({
  docType,
  meta,
  existing,
  isUploading,
  isDeleting,
  onTrigger,
  onDelete,
  onChange,
  inputRef,
}: DocumentUploadCardProps) {
  return (
    <div className="form-group">
      <label className="form-label fw-semibold">
        {meta.label} {meta.required && <span className="text-danger">*</span>}
      </label>
      <div className="upload-files-container">
        <div className="drag-file-area w-100">
          {isUploading ? (
            <div className="py-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal" style={{ color: '#1a9e8a' }} />
              <h3 className="dynamic-message mt-2" style={{ fontSize: '14px' }}>
                Uploading file...
              </h3>
            </div>
          ) : (
            <>
              <span className="material-icons-outlined upload-icon">
                <img src="/assets/images/upload-linear.svg" className="img-fluid" alt="Upload Icon" />
              </span>
              <h3 className="dynamic-message">Drag and drop your documents</h3>
              <label className="label m-0">
                <span className="browse-files">
                  <input
                    key={docType}
                    ref={inputRef}
                    type="file"
                    accept={ALLOWED_MIME_TYPES.join(',')}
                    className="default-file-input"
                    onChange={onChange}
                    style={{ display: 'none' }}
                  />
                  <span className="browse-files-text" onClick={onTrigger}>
                    or click to upload
                  </span>
                </span>
              </label>
            </>
          )}

          {existing && (
            <div className="file-block d-flex" style={{ marginTop: '15px' }}>
              <div className="file-info">
                <span className="material-icons-outlined file-icon">
                  <i className="la la-file-import"></i>
                </span>
                <span className="file-name" style={{ wordBreak: 'break-all' }}>
                  {existing.original_filename}
                </span>
                {' | '}
                <span className="file-size">{formatFileSize(existing.file_size_bytes)}</span>
                {existing.verified_at && (
                  <span className="badge bg-success ms-2" style={{ fontSize: '10px' }}>
                    Verified
                  </span>
                )}
              </div>
              {!existing.verified_at && (
                <span
                  className="material-icons remove-file-icon"
                  onClick={() => {
                    if (!isDeleting) {
                      onDelete(existing);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <i className="la la-trash"></i>}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="note mt-1 text-secondary" style={{ fontSize: '13px' }}>
        {meta.description}
      </div>
    </div>
  )
}
