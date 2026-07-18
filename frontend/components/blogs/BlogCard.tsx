import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { Blog } from "@/types/blog";

export const BlogCard = ({ blog, featured = false }: { blog: Blog; featured?: boolean }) => {
  const publishDate = blog.published_at ? new Date(blog.published_at) : new Date(blog.created_at);

  if (featured) {
    return (
      <Link href={`/blogs/${blog.slug}`} className="group block col-span-1 md:col-span-2 lg:col-span-3">
        <article className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-soft hover:shadow-floating transition-all duration-500 flex flex-col md:flex-row">
          {/* Specific Image Container */}
          <div className="relative w-full md:w-1/2 lg:w-[55%] h-[300px] md:h-[480px] shrink-0 bg-slate-100 overflow-hidden">
            {blog.og_image ? (
              <Image
                src={blog.og_image}
                alt={blog.meta_title || blog.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700"
                sizes="(max-width: 768px) 100vw, 55vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center">
                <svg className="w-16 h-16 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            {/* Subtle top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-teal-400" />
          </div>

          {/* Text Container */}
          <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16 w-full md:w-1/2 lg:w-[45%]">
            <div className="flex items-center gap-3 mb-5">
              <span className="bg-brand-50 text-brand-700 border border-brand-200 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                Featured
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              <span className="text-slate-500 text-sm font-medium">
                {format(publishDate, "MMMM d, yyyy")}
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-navy-900 leading-tight mb-5 group-hover:text-brand-600 transition-colors">
              {blog.title}
            </h2>

            {blog.meta_description && (
              <p className="text-slate-600 text-base lg:text-lg line-clamp-3 mb-8 leading-relaxed">
                {blog.meta_description}
              </p>
            )}

            <div className="mt-auto md:mt-0 inline-flex items-center gap-2 text-brand-600 font-bold text-sm group-hover:text-brand-700 transition-colors">
              Read Full Article
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/blogs/${blog.slug}`} className="group block">
      <article className="h-full bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-soft hover:shadow-floating transition-all duration-500 hover:-translate-y-2 flex flex-col">
        {/* Thumbnail */}
        <div className="relative aspect-[16/9] w-full bg-slate-100 overflow-hidden shrink-0">
          {blog.og_image ? (
            <Image
              src={blog.og_image}
              alt={blog.meta_title || blog.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {/* Colored top accent bar on hover */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
            <time>{format(publishDate, "MMM d, yyyy")}</time>
          </div>

          <h2 className="text-lg font-bold text-navy-900 leading-snug mb-3 group-hover:text-brand-600 transition-colors line-clamp-2 flex-shrink-0">
            {blog.title}
          </h2>

          <p className="text-slate-500 text-sm line-clamp-3 mb-5 flex-grow leading-relaxed">
            {blog.meta_description || "Read the full article for more insights."}
          </p>

          <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="inline-flex items-center gap-1.5 text-brand-600 font-semibold text-sm group-hover:text-brand-700 transition-colors">
              Read Article
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
};
