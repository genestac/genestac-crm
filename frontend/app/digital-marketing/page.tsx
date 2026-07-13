import { getBlogStats, getBlogs } from './actions'
import Link from 'next/link'
import {
  FileText, Globe, Clock, PenSquare, ArrowRight, Rss,
  TrendingUp, Eye, CheckCircle2,
} from 'lucide-react'

export const metadata = {
  title: 'Digital Marketing — Genestac',
  description: 'Manage blog content and SEO strategy.',
}

export default async function DigitalMarketingDashboard() {
  const [stats, { blogs }] = await Promise.all([getBlogStats(), getBlogs()])

  const recentBlogs = blogs.slice(0, 5)

  const statusColor: Record<string, string> = {
    published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    draft:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Content Studio
          </h1>
          <p className="text-muted-foreground mt-1">Manage blog posts, SEO metadata, and content strategy.</p>
        </div>
        <Link
          href="/digital-marketing/blogs/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all duration-200"
        >
          <PenSquare className="w-4 h-4" />
          New Blog Post
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'Total Posts',
            value: stats.total,
            icon: FileText,
            color: 'from-violet-50 to-white border-violet-100 dark:from-violet-950/30 dark:to-card dark:border-violet-800/40',
            iconBg: 'bg-violet-100 dark:bg-violet-900/30',
            iconColor: 'text-violet-600 dark:text-violet-400',
          },
          {
            label: 'Published',
            value: stats.published,
            icon: Globe,
            color: 'from-emerald-50 to-white border-emerald-100 dark:from-emerald-950/30 dark:to-card dark:border-emerald-800/40',
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Drafts',
            value: stats.drafts,
            icon: PenSquare,
            color: 'from-amber-50 to-white border-amber-100 dark:from-amber-950/30 dark:to-card dark:border-amber-800/40',
            iconBg: 'bg-amber-100 dark:bg-amber-900/30',
            iconColor: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Scheduled',
            value: stats.scheduled,
            icon: Clock,
            color: 'from-blue-50 to-white border-blue-100 dark:from-blue-950/30 dark:to-card dark:border-blue-800/40',
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            iconColor: 'text-blue-600 dark:text-blue-400',
          },
        ].map(card => (
          <div
            key={card.label}
            className={`bg-gradient-to-br ${card.color} border rounded-2xl p-6 shadow-sm`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <h3 className="text-4xl font-bold text-foreground mt-2">{card.value}</h3>
              </div>
              <div className={`p-3 rounded-xl ${card.iconBg}`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          {
            title: 'Write New Post',
            description: 'Start a new blog from scratch with the block editor',
            href: '/digital-marketing/blogs/new',
            icon: PenSquare,
            gradient: 'from-violet-600 to-fuchsia-600',
          },
          {
            title: 'View All Blogs',
            description: 'Manage all posts — filter, edit, publish or delete',
            href: '/digital-marketing/blogs',
            icon: Rss,
            gradient: 'from-indigo-500 to-violet-600',
          },
          {
            title: 'Published Posts',
            description: 'Review live articles and SEO performance',
            href: '/digital-marketing/blogs?status=published',
            icon: Globe,
            gradient: 'from-emerald-500 to-teal-600',
          },
        ].map(action => (
          <Link
            key={action.href}
            href={action.href}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${action.gradient} mb-4`}>
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-bold text-foreground">{action.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
            <ArrowRight className="w-4 h-4 text-muted-foreground mt-3 group-hover:text-foreground group-hover:translate-x-1 transition-all duration-200" />
          </Link>
        ))}
      </div>

      {/* Recent Posts Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Recent Posts</h2>
          <Link
            href="/digital-marketing/blogs"
            className="text-sm text-violet-600 dark:text-violet-400 font-medium hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentBlogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Rss className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-medium">No blog posts yet</p>
            <p className="text-sm mt-1">Create your first post to get started</p>
            <Link
              href="/digital-marketing/blogs/new"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              <PenSquare className="w-4 h-4" /> New Post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentBlogs.map(blog => (
              <div key={blog.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-200 dark:border-violet-800 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{blog.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">/{blog.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[blog.status]}`}>
                    {blog.status}
                  </span>
                  <Link
                    href={`/digital-marketing/blogs/${blog.id}/edit`}
                    className="opacity-0 group-hover:opacity-100 text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline flex items-center gap-1 transition-opacity"
                  >
                    Edit <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
