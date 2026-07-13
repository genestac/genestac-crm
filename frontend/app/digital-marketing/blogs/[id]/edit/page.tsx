import { getBlog } from '@/app/digital-marketing/actions'
import { BlogEditor } from '@/components/digital-marketing/blogs/BlogEditor'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const blog = await getBlog(id)
  return {
    title: blog ? `Edit: ${blog.title} — Digital Marketing` : 'Edit Blog Post',
  }
}

export default async function EditBlogPage({ params }: Props) {
  const { id } = await params
  const blog = await getBlog(id)

  if (!blog) notFound()

  return <BlogEditor initialBlog={blog} />
}
