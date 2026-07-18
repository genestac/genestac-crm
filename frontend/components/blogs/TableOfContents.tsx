"use client";

import { useEffect, useState } from "react";
import { ContentLayoutBlock, HeadingBlock } from "@/types/blog";

interface TableOfContentsProps {
  layout: ContentLayoutBlock[];
}

export const TableOfContents = ({ layout }: TableOfContentsProps) => {
  const [activeId, setActiveId] = useState<string>("");

  const headings = layout.filter(
    (block): block is HeadingBlock =>
      block.type === "heading" &&
      block.data &&
      (block.data.level === "h2" || block.data.level === "h3")
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-10% 0% -70% 0%", threshold: 0 }
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.data.id || heading.id);
      if (element) observer.observe(element);
    });

    return () => {
      headings.forEach((heading) => {
        const element = document.getElementById(heading.data.id || heading.id);
        if (element) observer.unobserve(element);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (headings.length === 0) return null;

  return (
    <div className="sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-200">
        <svg className="w-4 h-4 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h7" />
        </svg>
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Table of Contents
        </h3>
      </div>

      <nav className="flex flex-col space-y-0.5">
        {headings.map((heading) => {
          const anchorId = heading.data.id || heading.id;
          const isActive = activeId === anchorId;
          const isH3 = heading.data.level === "h3";

          return (
            <a
              key={heading.id}
              href={`#${anchorId}`}
              className={`group flex items-start gap-2.5 py-2 px-3 rounded-lg text-sm transition-all duration-200 ${
                isH3 ? "ml-4" : ""
              } ${
                isActive
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-navy-900"
              }`}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(anchorId);
                if (element) {
                  element.scrollIntoView({ behavior: "smooth" });
                  window.history.pushState(null, "", `#${anchorId}`);
                }
              }}
            >
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  isActive ? "bg-brand-500" : "bg-slate-300 group-hover:bg-slate-400"
                }`}
              />
              <span className={isH3 ? "text-xs leading-snug" : "leading-snug"}>
                {heading.data.text}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
};
