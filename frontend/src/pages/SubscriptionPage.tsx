import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import DashboardShell from '@/components/DashboardShell'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subscription {
  id?: string
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'NONE'
  plan_name?: string
  monthly_price_cents?: number
  included_tokens?: number
  current_period_start?: string
  current_period_end?: string
  cancelled_at?: string | null
}

interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  monthly_price_cents: number
  included_tokens: number
  sort_order: number
}

interface Invoice {
  id: string
  amount: number
  status: string
  created_at: string
  pdf_url: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { user, walletBalance, systemConfig } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (systemConfig.subscription_system_disabled) {
      navigate('/dashboard')
    }
  }, [systemConfig.subscription_system_disabled, navigate])

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subLoading, setSubLoading] = useState(true)

  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)

  const [redirectingPlanId, setRedirectingPlanId] = useState<string | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadSubscription = useCallback(async () => {
    try {
      const { data } = await api.get<Subscription>('/subscriptions')
      setSubscription(data)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setSubLoading(false)
    }
  }, [])

  const loadPlans = useCallback(async () => {
    try {
      const { data: res } = await api.get<{ data: SubscriptionPlan[] }>('/subscriptions/plans')
      const sorted = [...res.data].sort((a, b) => a.sort_order - b.sort_order)
      setPlans(sorted)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPlansLoading(false)
    }
  }, [])

  const loadInvoices = useCallback(async () => {
    try {
      const { data: res } = await api.get<{ data: Invoice[] }>('/subscriptions/billing')
      setInvoices(res.data || [])
    } catch {
      // non-critical
    } finally {
      setInvoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSubscription()
    loadPlans()
    loadInvoices()
  }, [loadSubscription, loadPlans, loadInvoices])

  const handleSubscribe = async (planId: string) => {
    setRedirectingPlanId(planId)
    try {
      const successUrl = `${window.location.origin}/subscription?success=true`
      const cancelUrl = `${window.location.origin}/subscription?cancel=true`

      const { data } = await api.post<{ checkout_url: string }>('/subscriptions', {
        plan_id: planId,
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        toast.error('Failed to create Stripe Checkout session.')
      }
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setRedirectingPlanId(null)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      toast.success('Subscription updated successfully!')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('cancel') === 'true') {
      toast.error('Subscription setup was cancelled.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleCancelSub = async () => {
    if (
      !window.confirm(
        'Are you sure you want to cancel your subscription? You will retain access to claim referrals until the end of your current billing period.'
      )
    ) {
      return
    }
    setIsActionLoading(true)
    try {
      await api.post('/subscriptions/cancel')
      toast.success('Your subscription will be cancelled at the end of the billing period.')
      await loadSubscription()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleSwitchPlan = async (plan: SubscriptionPlan) => {
    if (!subscription || subscription.status === 'NONE') return

    const confirmMsg = `Are you sure you want to switch your plan to the "${plan.name}" plan? This will update your Stripe subscription immediately with proration.`
    if (!window.confirm(confirmMsg)) return

    setIsActionLoading(true)
    try {
      await api.patch('/subscriptions', { plan_id: plan.id })
      toast.success(`Successfully switched subscription plan to ${plan.name}!`)
      setSubLoading(true)
      await loadSubscription()
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsActionLoading(false)
    }
  }

  return (
    <DashboardShell>
      {/* Title */}
      <div className="row toprow pt-4">
        <div className="col-md-12">
          <div className="page-title">
            <h1>Subscription & Billing</h1>
            <p>Manage your subscription, view billing history and download invoices.</p>
          </div>
        </div>
      </div>

      {/* Active Subscription Summary */}
      {subLoading ? (
        <div className="carddesign mb-4">
          <div className="cardbody">
            <div className="text-center py-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            </div>
          </div>
        </div>
      ) : subscription && subscription.status !== 'NONE' ? (
        <>
          <div className="row">
            <div className="col-md-12">
              <div className="subscriptionbg">
                <div className="subscription-row">
                  <div className="subscription-col subscription-col1">
                    <div className="subscription-design">
                      <span className="subscriptioniimg">
                        {subscription.plan_name === 'Professional' ? (
                          <img src="/assets/images/professional-icon.svg" className="img-fluid" alt="" />
                        ) : subscription.plan_name === 'Enterprise' ? (
                          <img src="/assets/images/enterprise-icon.svg" className="img-fluid" alt="" />
                        ) : (
                          <img src="/assets/images/starter-icon.svg" className="img-fluid" alt="" />
                        )}
                      </span>
                      <span className={`currentplan ${subscription.status === 'EXPIRED' ? 'bg-danger text-white' : ''}`}>
                        {subscription.status === 'EXPIRED' ? 'EXPIRED PLAN' : 'CURRENT PLAN'}
                      </span>
                      <h3>{subscription.plan_name}</h3>
                      <h4>
                        {formatPrice(subscription.monthly_price_cents ?? 0)}{' '}
                        <span>/month</span>
                      </h4>
                      <p>
                        {subscription.plan_name === 'Free'
                          ? `Includes ${subscription.included_tokens} tokens / 12 months`
                          : `Includes ${subscription.included_tokens} tokens / renewal`}
                      </p>
                    </div>
                  </div>
                  <div className="subscription-col">
                    <div className="subscription-design">
                      <span className="subscriptioniimg">
                        <img src="/assets/images/date.svg" className="img-fluid" alt="" />
                      </span>
                      <span className="datetext">
                        {subscription.status === 'EXPIRED' ? 'Expired Date' : 'Next Renewal Date'}
                      </span>
                      <h4>
                        {subscription.current_period_end
                          ? formatDate(subscription.current_period_end)
                          : 'N/A'}
                      </h4>
                      <p>
                        {subscription.status === 'EXPIRED'
                          ? 'Your subscription/free trial has expired.'
                          : subscription.plan_name === 'Free'
                          ? 'Your free plan will expire after the 12-month period.'
                          : subscription.cancelled_at
                          ? 'Your subscription is pending cancellation.'
                          : 'Your subscription will renew automatically.'}
                      </p>
                    </div>
                  </div>
                  <div className="subscription-col">
                    <div className="subscription-design">
                      <span className="subscriptioniimg">
                        <img src="/assets/images/token.svg" className="img-fluid" alt="" />
                      </span>
                      <span className="datetext">Current Token Balance</span>
                      <h4>
                        {walletBalance !== null ? `${walletBalance} Tokens` : '0 Tokens'}
                      </h4>
                      <p>Available to use across your account.</p>
                    </div>
                  </div>
                  <div className="subscription-col subscription-col4">
                    <div className="subscription-design">
                      {!subscription.cancelled_at && subscription.status !== 'EXPIRED' && subscription.plan_name !== 'Free' && (
                        <button
                          onClick={handleCancelSub}
                          disabled={isActionLoading}
                          className="btn btn-info cancelplan"
                        >
                          {isActionLoading ? 'Cancelling...' : 'Cancel Plan'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {subscription.status === 'EXPIRED' && (
            <div className="alert alert-danger mt-3 mb-4 p-3 text-sm font-semibold" role="alert">
              <strong>Subscription/Free Trial Expired:</strong> Your plan expired on{' '}
              {subscription.current_period_end ? formatDate(subscription.current_period_end) : ''}. An active subscription plan is required to claim referrals.
            </div>
          )}

          {subscription.cancelled_at && (
            <div className="alert alert-warning mt-3 mb-4 p-3 text-sm" role="alert">
              <strong>Subscription Pending Cancellation:</strong> Your plan has been cancelled and will expire on{' '}
              {subscription.current_period_end ? formatDate(subscription.current_period_end) : ''}.
            </div>
          )}
        </>
      ) : (
        <div className="carddesign mb-4">
          <div className="cardbody">
            <div className="text-center py-5 text-secondary">
              <h6 className="fw-bold text-dark">No Active Subscription</h6>
              <p className="text-sm">An active subscription plan is required to claim patient referrals.</p>
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      {!systemConfig.subscription_system_disabled && (
        <div className="carddesign mt-4">
        <div className="cardheading">
          <h2>
            Available Plans{' '}
            <span>Choose the perfect plan for your practice's growth.</span>
          </h2>
        </div>
        <div className="cardbody">
          {plansLoading ? (
            <div className="text-center py-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            </div>
          ) : (
            <div className="row">
              {plans.map((plan) => {
                const isActive =
                  subscription?.plan_name === plan.name &&
                  subscription.status === 'ACTIVE'
                const isCancelledState =
                  subscription?.plan_name === plan.name &&
                  subscription.status === 'CANCELLED'

                const planImgSrc =
                  plan.name === 'Professional'
                    ? '/assets/images/professional-icon.svg'
                    : plan.name === 'Enterprise'
                    ? '/assets/images/enterprise-icon.svg'
                    : '/assets/images/starter-icon.svg'

                return (
                  <div className="col-md-4 mb-3" key={plan.id}>
                    <div className={`planscard ${isActive ? 'plansactive' : ''}`}>
                      {isActive && <div className="planscard-current">CURRENT PLAN</div>}
                      <div className="plans-heading">
                        <span className="plansimg">
                          <img src={planImgSrc} className="img-fluid" alt="" />
                        </span>
                        <h3>{plan.name}</h3>
                        <p>{plan.description || 'Perfect for growing your practice'}</p>
                      </div>
                      <h4>
                        {formatPrice(plan.monthly_price_cents)} <span>/month</span>
                      </h4>
                      <ul>
                        <li>
                          <i className="la la-check"></i>
                          {plan.name === 'Free' ? (
                            `${plan.included_tokens} tokens included`
                          ) : (
                            `${plan.included_tokens} tokens included / month`
                          )}
                        </li>
                        <li>
                          <i className="la la-check"></i>Priority referral matches
                        </li>
                        <li>
                          <i className="la la-check"></i>Detailed patient diagnostics
                        </li>
                      </ul>

                      {isActive && !isCancelledState ? (
                        <button disabled className="btn btn-info">
                          Current Plan
                        </button>
                      ) : subscription &&
                        subscription.status !== 'NONE' &&
                        subscription.status !== 'CANCELLED' ? (
                        <button
                          onClick={() => handleSwitchPlan(plan)}
                          disabled={isActionLoading}
                          className="btn btn-info"
                        >
                          {isActionLoading ? 'Switching...' : 'Switch Plan'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={redirectingPlanId !== null}
                          className="btn btn-info"
                        >
                          {redirectingPlanId === plan.id ? 'Redirecting...' : 'Subscribe'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Billing & Invoices */}
      {!systemConfig.subscription_system_disabled && (
        <div className="carddesign mt-4">
        <div className="cardheading">
          <h2>Billing & Invoices</h2>
        </div>
        <div className="cardbody">
          {invoicesLoading ? (
            <div className="text-center py-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-secondary text-center py-5">No billing invoices found.</p>
          ) : (
            <div className="tabledesign filterno whitebg">
              <div className="table-responsive">
                <table className="table dt-responsive categories_table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '70px' }}>INVOICE ID</th>
                      <th style={{ minWidth: '100px' }}>DATE</th>
                      <th style={{ minWidth: '100px' }}>PLAN</th>
                      <th style={{ minWidth: '100px' }}>AMOUNT</th>
                      <th style={{ minWidth: '100px', textAlign: 'center' }}>STATUS</th>
                      <th style={{ minWidth: '100px' }}>RECEIPT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, index) => {
                      const sequentialNumber = invoices.length - index
                      const formattedId = `CR_${String(sequentialNumber).padStart(3, '0')}`
                      return (
                        <tr key={inv.id}>
                          <td>{formattedId}</td>
                          <td>{formatDate(inv.created_at)}</td>
                        <td>{subscription?.plan_name || 'Starter'} (Monthly)</td>
                        <td>{formatPrice(inv.amount)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1 w-28 rounded-full whitespace-nowrap border ${
                              inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${inv.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {inv.status === 'paid' ? 'Paid' : inv.status}
                          </span>
                        </td>
                        <td className="tdaction">
                          {inv.pdf_url ? (
                            <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src="/assets/images/download.svg"
                                className="img-fluid"
                                title="Download Receipt"
                                alt=""
                              />
                            </a>
                          ) : (
                            <span className="text-secondary text-xs">N/A</span>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </DashboardShell>
  )
}
