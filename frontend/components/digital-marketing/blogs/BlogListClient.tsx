'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search, PenSquare, Trash2, Globe, Clock, FileText,
  Filter, ArrowUpDown, ArrowRight, Loader2,
} from 'lucide-react'
import { deleteBlog, publishBlog, type Blog } from '@/app/digital-marketing/actions'
import { format } from 'date-fns'

interface Props {
  initialBlogs: Blog[]
}

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  draft:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const STATUS_ICONS: Record<string, React.FC<{ className?: string }>> = {
  published: Globe,
  draft:     FileText,
  scheduled: Clock,
}

export function BlogListClient({ initialBlogs }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [blogs, setBlogs] = useState<Blog[]>(initialBlogs)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const filtered = blogs.filter(b => {
    const matchesSearch = b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.slug.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await deleteBlog(id)
      setBlogs(prev => prev.filter(b => b.id !== id))
      toast.success('Blog post deleted')
    } catch {
      toast.error('Failed to delete post')
    } finally {
      setDeletingId(null)
    }
  }

  const handleQuickPublish = async (id: string) => {
    setPublishingId(id)
    try {
      await publishBlog(id)
      setBlogs(prev => prev.map(b => b.id === id ? { ...b, status: 'published' } : b))
      toast.success('Post published!')
    } catch {
      toast.error('Publish failed')
    } finally {
      setPublishingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search posts by title or slug…"
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            {['all', 'published', 'draft', 'scheduled'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <Link
            href="/digital-marketing/blogs/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all"
          >
            <PenSquare className="w-4 h-4" />
            New Post
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="w-10 h-10 opacity-20 mb-3" />
            <p className="font-semibold">No posts found</p>
            {search && <p className="text-sm mt-1">Try a different search term</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Post</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Slug</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Created</th>
                <th className="text-right px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(blog => {
                const StatusIcon = STATUS_ICONS[blog.status] ?? FileText
                const isDeleting  = deletingId  === blog.id
                const isPublishing = publishingId === blog.id
                return (
                  <tr key={blog.id} className="group hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {blog.og_image ? (
                          <img
                            src={blog.og_image}
                            alt={blog.title}
                            className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-200 dark:border-violet-800 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-violet-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{blog.title}</p>
                          {blog.meta_title && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{blog.meta_title}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">/{blog.slug}</code>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[blog.status]}`}>
                        <StatusIcon className="w-3 h-3" />
                        {blog.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground hidden lg:table-cell">
                      {format(new Date(blog.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {blog.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => handleQuickPublish(blog.id)}
                            disabled={isPublishing}
                            className="p-2 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors disabled:opacity-50"
                            title="Quick Publish"
                          >
                            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                          </button>
                        )}
                        <Link
                          href={`/digital-marketing/blogs/${blog.id}/edit`}
                          className="p-2 rounded-lg text-muted-foreground hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors"
                          title="Edit"
                        >
                          <PenSquare className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(blog.id, blog.title)}
                          disabled={isDeleting}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {blogs.length} posts
        </p>
      )}
    </div>
  )
}
