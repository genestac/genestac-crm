import { BlogEditor } from '@/components/digital-marketing/blogs/BlogEditor'

export const metadata = {
  title: 'New Blog Post — Digital Marketing',
}

export default function NewBlogPage() {
  return <BlogEditor initialBlog={null} />
}
