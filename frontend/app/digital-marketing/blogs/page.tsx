import { getBlogs } from '../actions'
import { BlogListClient } from '@/components/digital-marketing/blogs/BlogListClient'
import { Rss } from 'lucide-react'

export const metadata = {
  title: 'Blog Posts — Digital Marketing',
  description: 'Manage all blog posts and content.',
}

export default async function BlogsPage() {
  const { blogs } = await getBlogs()

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Rss className="w-6 h-6 text-violet-500" />
          Blog Posts
        </h1>
        <p className="text-muted-foreground mt-1">Create, manage, and publish your blog content.</p>
      </div>
      <BlogListClient initialBlogs={blogs} />
    </div>
  )
}
