import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { getApiError } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import DashboardShell from '@/components/DashboardShell'
import { useExternalStylesheet } from '@/lib/useExternalStylesheet'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Wallet {
  id: string
  balance: number
  total_purchased: number
  total_allocated: number
  total_used: number
  total_expired: number
  updated_at: string
}

interface Transaction {
  id: string
  transaction_type:
    | 'PURCHASE'
    | 'MONTHLY_ALLOCATION'
    | 'REFERRAL_CLAIM'
    | 'REFUND'
    | 'ADJUSTMENT'
    | 'EXPIRY'
  amount: number
  balance_after: number
  referral_id: string | null
  notes: string | null
  created_at: string
}

interface Package {
  id: string
  token_count: number
  price_cents: number
  sort_order: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<Transaction['transaction_type'], string> = {
  PURCHASE: 'Token Purchase',
  MONTHLY_ALLOCATION: 'Monthly Allocation',
  REFERRAL_CLAIM: 'Referral Claim',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
  EXPIRY: 'Token Expiry',
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getStatusClass = (type: Transaction['transaction_type']): string => {
  switch (type) {
    case 'PURCHASE':
    case 'REFUND':
      return 'status2' // Green background
    case 'MONTHLY_ALLOCATION':
    case 'ADJUSTMENT':
      return 'status3' // Blue background
    case 'REFERRAL_CLAIM':
    case 'EXPIRY':
      return 'status4' // Red/Purple background
    default:
      return 'status1' // Yellow background
  }
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { user, systemConfig } = useAuth()

  useExternalStylesheet(['https://cdn.datatables.net/1.10.22/css/jquery.dataTables.min.css'])

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)

  const [packages, setPackages] = useState<Package[]>([])
  const [packagesLoading, setPackagesLoading] = useState(true)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [txCursor, setTxCursor] = useState<string | null>(null)
  const [txLoadingMore, setTxLoadingMore] = useState(false)
  const [txHasMore, setTxHasMore] = useState(false)

  const [redirectingPkgId, setRedirectingPkgId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const initialBalanceRef = useRef<number | null>(null)

  // ── Local DataTable State ──────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when search term or page size changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, pageSize])

  // Filter transactions locally
  const filteredTransactions = transactions.filter((tx) => {
    const term = searchTerm.toLowerCase()
    if (!term) return true

    const typeLabel = TYPE_LABELS[tx.transaction_type]?.toLowerCase() || ''
    const notes = tx.notes?.toLowerCase() || ''
    const date = formatDate(tx.created_at).toLowerCase()
    const amountStr = `${tx.amount > 0 ? '+' : ''}${tx.amount} tkn`.toLowerCase()
    const refStr = (tx.referral_id ? `ref-${tx.referral_id}` : `txn-${tx.id}`).toLowerCase()
    const balStr = `${tx.balance_after} tkn`.toLowerCase()

    return (
      typeLabel.includes(term) ||
      notes.includes(term) ||
      date.includes(term) ||
      amountStr.includes(term) ||
      refStr.includes(term) ||
      balStr.includes(term)
    )
  })

  const totalEntries = filteredTransactions.length
  const totalPages = Math.ceil(totalEntries / pageSize) || 1
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, totalEntries)

  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadWallet = useCallback(async () => {
    try {
      const { data } = await api.get<Wallet>('/wallet')
      setWallet(data)
      return data
    } catch (err) {
      toast.error(getApiError(err))
      return null
    } finally {
      setWalletLoading(false)
    }
  }, [])

  const loadPackages = useCallback(async () => {
    try {
      const { data: res } = await api.get<{ data: Package[] }>('/wallet/packages')
      const sorted = [...res.data].sort((a, b) => a.sort_order - b.sort_order)
      setPackages(sorted)
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setPackagesLoading(false)
    }
  }, [])

  const loadTransactions = useCallback(async (cursor?: string) => {
    try {
      const params: Record<string, string> = { limit: '20' }
      if (cursor) params.cursor = cursor

      const { data } = await api.get<{ data: Transaction[]; pagination: { cursor: string | null } }>(
        '/wallet/transactions',
        { params },
      )

      if (cursor) {
        setTransactions((prev) => [...prev, ...data.data])
      } else {
        setTransactions(data.data)
      }

      setTxCursor(data.pagination?.cursor || null)
      setTxHasMore((data.pagination?.cursor ?? null) !== null)
      return data.data
    } catch (err) {
      toast.error(getApiError(err))
      return null
    } finally {
      setTxLoading(false)
      setTxLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadWallet()
    loadPackages()
    loadTransactions()
  }, [loadWallet, loadPackages, loadTransactions])

  const handleBuyNow = async (pkgId: string) => {
    setRedirectingPkgId(pkgId)
    try {
      const successUrl = `${window.location.origin}/wallet?success=true`
      const cancelUrl = `${window.location.origin}/wallet?cancel=true`

      if (wallet) {
        localStorage.setItem('pre_purchase_balance', wallet.balance.toString())
      }

      const { data } = await api.post<{ checkout_url: string }>('/wallet/purchase', {
        package_id: pkgId,
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
      setRedirectingPkgId(null)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setIsPolling(true)
      toast.loading('Confirming your payment and updating balance...', { id: 'payment-status' })
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('cancel') === 'true') {
      toast.error('Payment was cancelled.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!isPolling) return

    let isMounted = true
    let intervalId: any
    let pollCount = 0
    const maxPolls = 8

    const runPolling = async () => {
      let initialBal = initialBalanceRef.current
      if (initialBal === null) {
        const savedPreBalStr = localStorage.getItem('pre_purchase_balance')
        localStorage.removeItem('pre_purchase_balance') // Clear it so it won't be reused

        if (savedPreBalStr !== null) {
          initialBal = parseInt(savedPreBalStr, 10)
        } else {
          const currentWallet = await loadWallet()
          if (!isMounted) return
          initialBal = currentWallet?.balance ?? 0
        }
        initialBalanceRef.current = initialBal
      }

      // Check immediately if the balance has already updated
      const currentWallet = await loadWallet()
      if (!isMounted) return
      if (currentWallet && currentWallet.balance > initialBal) {
        toast.success('Payment completed successfully! Your wallet has been updated.', { id: 'payment-status' })
        setIsPolling(false)
        return
      }

      intervalId = setInterval(async () => {
        pollCount++
        try {
          const [updatedWallet] = await Promise.all([loadWallet(), loadTransactions()])

          if (!isMounted) return

          if (updatedWallet && updatedWallet.balance > initialBal) {
            toast.success('Payment completed successfully! Your wallet has been updated.', { id: 'payment-status' })
            setIsPolling(false)
          } else if (pollCount >= maxPolls) {
            toast.success('Payment completed successfully! Your balance will update shortly.', { id: 'payment-status' })
            setIsPolling(false)
          }
        } catch (err) {
          if (pollCount >= maxPolls) {
            toast.success('Payment completed successfully! Your balance will update shortly.', { id: 'payment-status' })
            setIsPolling(false)
          }
        }
      }, 2000)
    }

    runPolling()

    return () => {
      isMounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [isPolling, loadWallet, loadTransactions])

  async function handleLoadMore() {
    if (!txCursor || txLoadingMore) return
    setTxLoadingMore(true)
    await loadTransactions(txCursor)
  }

  return (
    <DashboardShell useStyle3={true}>
      {/* Title block */}
      <div className="row toprow">
        <div className="col-md-12">
          <div className="page-title">
            <h1>Token Wallet</h1>
            <p>View your available token balance, buy new packages, and review all account activity.</p>
          </div>
        </div>
      </div>

      {/* Hero balance card */}
      <div className="row">
        <div className="col-md-12">
          {walletLoading ? (
            <div className="text-center py-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="mt-2 text-secondary">Loading wallet data...</p>
            </div>
          ) : wallet ? (
            <ul className="dashboardcard-list">
              <li>
                <div className="dashboard-card dashboard-card1">
                  <div className="dashboard-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/assets/images/tokens-card1.svg" className="img-fluid" alt="" />
                  </div>
                  <h4>Tokens Available</h4>
                  <h3>{wallet.balance.toLocaleString()}</h3>
                  <p className="dashboard-success">NEW REFERRALS</p>
                </div>
              </li>
              <li>
                <div className="dashboard-card dashboard-card2">
                  <div className="dashboard-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/assets/images/tokens-card2.svg" className="img-fluid" alt="" />
                  </div>
                  <h4>Total Purchased</h4>
                  <h3>{wallet.total_purchased.toLocaleString()}</h3>
                  <p>ACTIVE CASES</p>
                </div>
              </li>
              <li>
                <div className="dashboard-card dashboard-card3">
                  <div className="dashboard-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/assets/images/tokens-card3.svg" className="img-fluid" alt="" />
                  </div>
                  <h4>Total Allocated</h4>
                  <h3>{wallet.total_allocated.toLocaleString()}</h3>
                  <p>UNREAD MESSAGES</p>
                </div>
              </li>
              <li>
                <div className="dashboard-card dashboard-card4">
                  <div className="dashboard-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/assets/images/tokens-card4.svg" className="img-fluid" alt="" />
                  </div>
                  <h4>Total Used</h4>
                  <h3>{wallet.total_used.toLocaleString()}</h3>
                  <p>SCORE</p>
                </div>
              </li>
            </ul>
          ) : (
            <p className="text-center text-danger py-4">Unable to load wallet data.</p>
          )}
        </div>
      </div>

      {/* Purchase Tokens */}
      {!systemConfig.token_buying_disabled && (
        <div className="carddesign">
          <div className="cardheading">
            <h2>Token Purchase</h2>
          </div>
          <div className="cardbody">
            {packagesLoading ? (
              <div className="text-center py-5">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              </div>
            ) : packages.length === 0 ? (
              <p className="text-secondary text-sm">No packages available at this time.</p>
            ) : (
              <ul className="token">
                {packages.map((pkg) => (
                  <li key={pkg.id}>
                    <div className="tokenlist">
                      <span className="tokeniimg">
                        <img src="/assets/images/token.png" className="img-fluid" alt="" />
                      </span>
                      <h3>
                        {pkg.token_count} <span>Tokens</span>
                      </h3>
                      <h4>{formatPrice(pkg.price_cents)}</h4>
                      <button
                        onClick={() => handleBuyNow(pkg.id)}
                        disabled={redirectingPkgId !== null}
                        className="btn btn-info"
                      >
                        {redirectingPkgId === pkg.id ? 'Redirecting...' : 'Buy Now'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="carddesign mt-4">
        <div className="cardheading">
          <h2>Transaction History</h2>
        </div>
        <div className="cardbody">
          {txLoading ? (
            <div className="text-center py-5">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-secondary text-center py-5">No transactions yet.</p>
          ) : (
            <div className="tabledesign filterno whitebg">
              <div className="dataTables_wrapper no-footer">
                <div className="dataTables_length" id="categories_table_length">
                  <label>
                    Show{' '}
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      name="categories_table_length"
                      aria-controls="categories_table"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>{' '}
                    entries
                  </label>
                </div>
                <div id="categories_table_filter" className="dataTables_filter">
                  <label>
                    Search:{' '}
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder=""
                      aria-controls="categories_table"
                    />
                  </label>
                </div>
                <div style={{ clear: 'both' }}></div>

                <div className="table-responsive">
                  <table className="table dt-responsive categories_table dataTable no-footer">
                    <thead>
                      <tr>
                        <th style={{ minWidth: '70px' }}>Date</th>
                        <th style={{ minWidth: '100px' }}>Type</th>
                        <th style={{ minWidth: '100px' }}>Amount</th>
                        <th style={{ minWidth: '100px' }}>Reference</th>
                        <th style={{ minWidth: '100px' }}>Balance After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.map((tx) => {
                        const isPositive = tx.amount > 0
                        return (
                          <tr key={tx.id}>
                            <td>{formatDate(tx.created_at)}</td>
                            <td>
                              <span
                                className={`status-d ${getStatusClass(tx.transaction_type)}`}
                                style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
                              >
                                {TYPE_LABELS[tx.transaction_type]}
                              </span>
                              {tx.notes && (
                                <div
                                  className="text-secondary"
                                  style={{ fontSize: '11px', marginTop: '4px', maxWidth: '180px', lineHeight: '1.2' }}
                                >
                                  {tx.notes}
                                </div>
                              )}
                            </td>
                            <td className={isPositive ? 'text-success' : 'text-danger'}>
                              {isPositive ? '+' : ''}{tx.amount.toLocaleString()} TKN
                            </td>
                            <td>
                              {tx.referral_id
                                ? `REF-${tx.referral_id.slice(0, 6).toUpperCase()}`
                                : `TXN-${tx.id.slice(0, 6).toUpperCase()}`}
                            </td>
                            <td>{tx.balance_after.toLocaleString()} TKN</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="dataTables_info" id="categories_table_info" role="status" aria-live="polite">
                  Showing {startIndex} to {endIndex} of {totalEntries} entries
                  {txHasMore && ' (more transactions can be loaded below)'}
                </div>

                <div className="dataTables_paginate paging_simple_numbers" id="categories_table_paginate">
                  <a
                    className={`paginate_button previous ${currentPage === 1 ? 'disabled' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      if (currentPage > 1) setCurrentPage(currentPage - 1)
                    }}
                    style={{ cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </a>
                  <span>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <a
                        key={page}
                        className={`paginate_button ${currentPage === page ? 'current' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage(page)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {page}
                      </a>
                    ))}
                  </span>
                  <a
                    className={`paginate_button next ${currentPage === totalPages ? 'disabled' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      if (currentPage < totalPages) setCurrentPage(currentPage + 1)
                    }}
                    style={{ cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </a>
                </div>

                {txHasMore && (
                  <div className="text-center pt-3" style={{ clear: 'both' }}>
                    <button
                      onClick={handleLoadMore}
                      disabled={txLoadingMore}
                      className="btn btn-secondary px-4 py-2"
                    >
                      {txLoadingMore ? 'Loading...' : 'Load More Transactions from Server'}
                    </button>
                  </div>
                )}
                <div style={{ clear: 'both' }}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
