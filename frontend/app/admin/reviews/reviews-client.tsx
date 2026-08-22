'use client'

import React, { useState, useCallback } from 'react'

interface Review {
  id: string
  created_at: string
  reviewer_name: string
  reviewer_email: string | null
  rating: number
  title: string | null
  body: string
  status: 'pending' | 'approved' | 'rejected'
  verified_purchase: boolean
  helpful_count: number
  admin_note: string | null
  moderated_by: string | null
  moderated_at: string | null
  inventory: { name: string; slug: string } | null
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  avg_rating: number
}

interface ReviewsClientProps {
  initialReviews: Review[]
  stats: Stats
  total: number
}

// ── Star display ──────────────────────────────────────────────────────────────
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width="14" height="14" viewBox="0 0 24 24"
          fill={rating >= s ? '#f59e0b' : 'none'}
          stroke={rating >= s ? '#f59e0b' : '#d1d5db'} strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${map[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {status === 'pending' && '⏳'}
      {status === 'approved' && '✅'}
      {status === 'rejected' && '❌'}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Moderation Modal ──────────────────────────────────────────────────────────
function ModerationModal({
  review,
  onClose,
  onModerate,
}: {
  review: Review
  onClose: () => void
  onModerate: (id: string, status: 'approved' | 'rejected', note: string) => Promise<void>
}) {
  const [note, setNote] = useState(review.admin_note || '')
  const [loading, setLoading] = useState(false)

  const handle = async (status: 'approved' | 'rejected') => {
    setLoading(true)
    await onModerate(review.id, status, note)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Review Moderation</h2>
            <p className="text-sm text-gray-500 mt-0.5">{review.inventory?.name || 'Unknown product'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
              {review.reviewer_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{review.reviewer_name}</p>
              {review.reviewer_email && <p className="text-xs text-gray-500">{review.reviewer_email}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Stars rating={review.rating} />
              <span className="text-sm font-bold text-gray-700">{review.rating}/5</span>
            </div>
          </div>

          {review.title && (
            <p className="font-semibold text-gray-800">&ldquo;{review.title}&rdquo;</p>
          )}
          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-4">
            {review.body}
          </p>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>📅 {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {review.verified_purchase && <span className="text-green-600 font-semibold">✓ Verified Purchase</span>}
            <StatusBadge status={review.status} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Internal Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note for your records..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={() => handle('approved')}
            disabled={loading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => handle('rejected')}
            disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
          >
            ❌ Reject
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Client Component ─────────────────────────────────────────────────────
export function ReviewsClient({ initialReviews, stats: initialStats, total: initialTotal }: ReviewsClientProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [stats, setStats] = useState<Stats>(initialStats)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterRating, setFilterRating] = useState<string>('all')
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const handleModerate = async (id: string, status: 'approved' | 'rejected', note: string) => {
    try {
      const res = await fetch(`/api/proxy/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_note: note }),
      })
      if (!res.ok) throw new Error('Failed')

      setReviews(prev => prev.map(r => r.id === id ? { ...r, status, admin_note: note } : r))
      setStats(prev => ({
        ...prev,
        pending: prev.pending - 1,
        approved: status === 'approved' ? prev.approved + 1 : prev.approved,
        rejected: status === 'rejected' ? prev.rejected + 1 : prev.rejected,
      }))
      showToast(`Review ${status} successfully.`, 'success')
    } catch {
      showToast('Failed to update review.', 'error')
    }
  }

  const filteredReviews = reviews.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterRating !== 'all' && r.rating !== Number(filterRating)) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white transition-all ${toastMsg.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900', bg: 'bg-gray-50 border-gray-200' },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
          { label: 'Approved', value: stats.approved, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Avg Rating', value: `${stats.avg_rating} ★`, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
            <p className="text-xs font-semibold text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-sm font-semibold text-gray-600">Filter:</span>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterRating}
          onChange={e => setFilterRating(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="all">All Ratings</option>
          {[5, 4, 3, 2, 1].map(r => (
            <option key={r} value={r}>{r} ★</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-gray-400 font-medium">{filteredReviews.length} result{filteredReviews.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {filteredReviews.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💬</p>
            <p className="font-semibold">No reviews match your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Reviewer</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Rating</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Review</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredReviews.map(review => (
                <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 truncate max-w-[140px]">
                      {review.inventory?.name || 'Unknown'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{review.reviewer_name}</p>
                    {review.reviewer_email && (
                      <p className="text-xs text-gray-400 truncate max-w-[160px]">{review.reviewer_email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Stars rating={review.rating} />
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    {review.title && <p className="font-semibold text-gray-800 truncate">{review.title}</p>}
                    <p className="text-gray-500 text-xs line-clamp-2">{review.body}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={review.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedReview(review)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Moderation Modal */}
      {selectedReview && (
        <ModerationModal
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onModerate={handleModerate}
        />
      )}
    </div>
  )
}
