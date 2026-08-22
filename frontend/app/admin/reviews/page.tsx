import { fetchAPI } from '@/utils/api'
import { ReviewsClient } from './reviews-client'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  let reviews: any[] = []
  let stats = { total: 0, pending: 0, approved: 0, rejected: 0, avg_rating: 0 }
  let total = 0

  try {
    const [listRes, statsRes] = await Promise.all([
      fetchAPI('/api/admin/reviews?page_size=100'),
      fetchAPI('/api/admin/reviews/stats'),
    ])
    reviews = listRes?.data || []
    total = listRes?.total || 0
    stats = statsRes || stats
  } catch (e) {
    console.error('Failed to load reviews:', e)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Product Reviews</h1>
          <p className="text-muted-foreground mt-2">
            Moderate patient reviews before they appear on the website.
          </p>
        </div>
        {stats.pending > 0 && (
          <span className="bg-yellow-500 text-white text-sm font-bold px-4 py-2 rounded-full shadow">
            {stats.pending} pending review{stats.pending !== 1 ? 's' : ''} await moderation
          </span>
        )}
      </div>
      <ReviewsClient initialReviews={reviews} stats={stats} total={total} />
    </div>
  )
}
