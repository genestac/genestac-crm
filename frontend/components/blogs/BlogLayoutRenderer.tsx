import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import {
  ContentLayoutBlock,
  HeadingBlock,
  TextBlock,
  ImageBlock,
  VideoBlock,
  CTABlock,
  TableBlock,
  ColumnsBlock,
} from "@/types/blog";

interface BlogLayoutRendererProps {
  layout: ContentLayoutBlock[];
}

export const BlogLayoutRenderer = ({ layout }: BlogLayoutRendererProps) => {
  if (!layout || layout.length === 0) return null;

  return (
    <div className="flex flex-col space-y-4 w-full">
      {layout.map((block) => {
        let content = null;
        switch (block.type) {
          case "heading":
            content = <HeadingRenderer block={block} />;
            break;
          case "text":
            content = <TextRenderer block={block} />;
            break;
          case "image":
            content = <ImageRenderer block={block} />;
            break;
          case "video":
            content = <VideoRenderer block={block} />;
            break;
          case "cta":
            content = <CTARenderer block={block} />;
            break;
          case "table":
            content = <TableRenderer block={block} />;
            break;
          case "columns":
            content = <ColumnsRenderer block={block} />;
            break;
        }

        if (!content) return null;

        return (
          <div 
            key={block.id}
            style={{ 
              marginTop: block.spacing?.marginTop || undefined,
              marginBottom: block.spacing?.marginBottom || undefined 
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
};

const HeadingRenderer = ({ block }: { block: HeadingBlock }) => {
  const { data } = block;
  if (!data) return null;

  const Tag = data.level || "h2";
  const anchorId = data.id || block.id;

  const classes = {
    h2: "text-3xl md:text-4xl font-bold text-navy-900 mt-2 mb-1",
    h3: "text-2xl md:text-3xl font-semibold text-navy-800 mt-4 mb-1.5",
    h4: "text-xl md:text-2xl font-medium text-navy-800 mt-3 mb-1",
  };

  const alignClass = data.align === "center" ? "text-center" : data.align === "right" ? "text-right" : "text-left";

  return (
    <Tag id={anchorId} className={`${classes[Tag]} ${alignClass}`}>
      {data.text}
    </Tag>
  );
};

const TextRenderer = ({ block }: { block: TextBlock }) => {
  const { data } = block;
  const id = useId().replace(/:/g, '');
  
  if (!data || !data.html) return null;

  // The website uses the 'Outfit' font, which is physically smaller than the CRM's 'Inter' font.
  // We automatically bump the CRM's selected size up one level so it looks identical to the user.
  const sizeMap: Record<string, string> = {
    'text-sm prose-sm': 'text-base prose-base',
    'text-base prose-base': 'text-lg prose-lg',
    'text-lg prose-lg': 'text-xl prose-xl',
    'text-xl prose-xl': 'text-2xl prose-2xl',
  };
  
  const sizeClasses = data.baseFontSize ? (sizeMap[data.baseFontSize] || data.baseFontSize) : 'text-xl prose-xl';

  return (
    <div id={block.id} className={`custom-p-spacing-${id}`}>
      <style>{`
        /* 1. Strictly enforce paragraph spacing */
        .custom-p-spacing-${id} p { 
          margin-top: 0 !important;
          margin-bottom: ${data.paragraphSpacing || '1.25em'} !important; 
        }
        
        /* Fix bullet point spacing to match line spacing */
        .custom-p-spacing-${id} li {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        .custom-p-spacing-${id} li > p {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        
        /* 2. Map inline font sizes to override Tailwind Prose defaults */
        .custom-p-spacing-${id} font[size="1"] { font-size: 0.75rem !important; line-height: 1 !important; }
        .custom-p-spacing-${id} font[size="2"] { font-size: 0.875rem !important; line-height: 1.1 !important; }
        .custom-p-spacing-${id} font[size="3"] { font-size: 1rem !important; line-height: 1.2 !important; }
        .custom-p-spacing-${id} font[size="4"] { font-size: 1.25rem !important; line-height: 1.3 !important; }
        .custom-p-spacing-${id} font[size="5"] { font-size: 1.5rem !important; line-height: 1.3 !important; }
        .custom-p-spacing-${id} font[size="6"] { font-size: 2rem !important; line-height: 1.2 !important; }
        .custom-p-spacing-${id} font[size="7"] { font-size: 3rem !important; line-height: 1.1 !important; }
      `}</style>
      
      <div 
        style={{ lineHeight: data.lineHeight || '1.75' }}
        className={`w-full prose dark:prose-invert max-w-none prose-slate text-slate-800 prose-a:text-brand-600 hover:prose-a:text-brand-700 prose-headings:text-navy-900 prose-h2:mt-4 prose-h2:mb-1 prose-img:rounded-xl ${sizeClasses}`}
        dangerouslySetInnerHTML={{ __html: data.html }}
      />
    </div>
  );
};

const ImageRenderer = ({ block }: { block: ImageBlock }) => {
  const { data } = block;
  if (!data || !data.images || data.images.length === 0) return null;

  const layout = data.layout || "single";
  const align = data.align || "center";
  const textSide = data.textSide || "none";

  // ── Single image with text beside it ──
  if (layout === "single") {
    const img = data.images[0];
    if (!img || !img.url) return null;

    if (textSide === "left" || textSide === "right") {
      const widthClasses = { "33": "md:w-1/3", "50": "md:w-1/2", "66": "md:w-2/3" };
      const imgWidthClass = data.imageWidth ? widthClasses[data.imageWidth] : "md:w-1/2";
      const textWidthClass = data.imageWidth === "33" ? "md:w-2/3" : data.imageWidth === "66" ? "md:w-1/3" : "md:w-1/2";
      const isTextLeft = textSide === "left";

      return (
        <div id={block.id} className={`my-6 flex flex-col ${isTextLeft ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 lg:gap-12 items-center`}>
          <figure className={`w-full ${imgWidthClass} flex flex-col shrink-0`}>
            {/* Premium image frame */}
            <div
              className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-slate-50"
              style={{ boxShadow: '0 0 0 1px rgba(14,165,233,0.12), 0 8px 32px -8px rgba(12,74,110,0.18)' }}
            >
              <Image src={img.url} alt={img.alt || ""} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
              {/* Subtle inner border overlay */}
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5 pointer-events-none" />
            </div>
            {img.caption && (
              <figcaption className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-500 italic">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                {img.caption}
              </figcaption>
            )}
          </figure>
          {data.textHtml && (
            <div className={`w-full ${textWidthClass} prose prose-lg prose-slate max-w-none`} dangerouslySetInnerHTML={{ __html: data.textHtml }} />
          )}
        </div>
      );
    } else {
      // ── Single image, no text beside it ──
      const alignClass = align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";
      return (
        <figure id={block.id} className={`my-6 w-full flex flex-col ${alignClass}`}>
          {/* Premium bordered frame */}
          <div
            className="relative w-full aspect-video overflow-hidden rounded-2xl bg-slate-50"
            style={{ boxShadow: '0 0 0 1px rgba(14,165,233,0.14), 0 4px 6px rgba(0,0,0,0.03), 0 20px 48px -12px rgba(12,74,110,0.18)' }}
          >
            <Image src={img.url} alt={img.alt || ""} fill className="object-cover" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw" />
            {/* Inset ring overlay so you can see the frame edge over light images */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5 pointer-events-none" />
          </div>
          {img.caption && (
            <figcaption className="mt-4 flex items-center justify-center gap-1.5 text-sm text-slate-500 italic bg-slate-50 border border-slate-100 rounded-lg px-4 py-2 w-fit mx-auto max-w-lg">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
              {img.caption}
            </figcaption>
          )}
        </figure>
      );
    }
  }

  // ── Grid layouts ──
  const gridClasses = {
    "grid-2": "grid-cols-1 sm:grid-cols-2",
    "grid-3": "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    "grid-4": "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div id={block.id} className="my-6 w-full">
      <div className={`grid gap-4 sm:gap-5 ${gridClasses[layout as keyof typeof gridClasses]}`}>
        {data.images.map((img, idx) => {
          if (!img.url) return null;
          return (
            <figure key={idx} className="flex flex-col group">
              <div
                className="relative w-full aspect-square overflow-hidden rounded-xl bg-slate-100"
                style={{ boxShadow: '0 0 0 1px rgba(14,165,233,0.10), 0 4px 16px -4px rgba(12,74,110,0.12)' }}
              >
                <Image
                  src={img.url}
                  alt={img.alt || ""}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
                <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 pointer-events-none" />
                {/* Hover overlay with icon */}
                <div className="absolute inset-0 bg-navy-900/0 group-hover:bg-navy-900/20 transition-colors duration-300 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100">
                    <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                  </div>
                </div>
              </div>
              {img.caption && (
                <figcaption className="mt-2 text-center text-xs text-slate-500 italic line-clamp-2 px-1">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
};

const VideoRenderer = ({ block }: { block: VideoBlock }) => {
  const { data } = block;
  if (!data || !data.url) return null;

  return (
    <figure id={block.id} className="my-8 w-full flex flex-col items-center">
      <div className="relative w-full max-w-4xl aspect-video overflow-hidden rounded-2xl shadow-soft bg-slate-100">
        {data.url.includes("mp4") ? (
          <video
            src={data.url}
            title={data.title || "Video player"}
            className="absolute inset-0 w-full h-full object-cover"
            controls
            playsInline
          />
        ) : (
          <iframe
            src={data.url}
            title={data.title || "Video player"}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          ></iframe>
        )}
      </div>
      {data.title && (
        <figcaption className="mt-3 text-center text-sm font-medium text-navy-800">
          {data.title}
        </figcaption>
      )}
      {data.transcript && (
        <details className="mt-4 w-full max-w-4xl bg-slate-50 p-4 rounded-xl border border-slate-200">
          <summary className="cursor-pointer text-brand-600 font-medium text-sm">
            Read Transcript
          </summary>
          <div className="mt-3 text-slate-700 text-sm prose max-w-none">
            {data.transcript}
          </div>
        </details>
      )}
    </figure>
  );
};

const CTARenderer = ({ block }: { block: CTABlock }) => {
  const { data } = block;
  if (!data || !data.href || !data.text) return null;

  // Custom colors or fallback to generic styles
  const buttonStyle = data.bgColor && data.color
    ? { backgroundColor: data.bgColor, color: data.color }
    : undefined;

  const defaultClasses = !buttonStyle 
    ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow hover:shadow-glow-hover"
    : "shadow-soft hover:shadow-md";

  return (
    <div id={block.id} className="my-10 flex justify-center w-full">
      <Link
        href={data.href}
        target={data.openInNewTab ? "_blank" : "_self"}
        rel={data.openInNewTab ? "noopener noreferrer" : undefined}
        className={`inline-flex items-center justify-center px-8 py-4 rounded-xl font-semibold transition-all duration-300 hover:-translate-y-1 ${defaultClasses}`}
        style={buttonStyle}
      >
        {data.text}
      </Link>
    </div>
  );
};

const TableRenderer = ({ block }: { block: TableBlock }) => {
  const { data } = block;
  if (!data || !data.headers || !data.rows) return null;

  return (
    <div id={block.id} className="my-12 w-full">
      {/* Outer decorative frame */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 0 0 1px rgba(14,165,233,0.12), 0 4px 24px -4px rgba(12,74,110,0.12)' }}
      >
        {/* Top gradient accent bar */}
        <div className="h-1 bg-gradient-to-r from-brand-500 via-teal-400 to-brand-600" />

        {/* Table wrapper — no scroll, always fits */}
        <div className="bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              {data.headers.map((_: string, idx: number) => (
                <col key={idx} style={{ width: `${100 / data.headers.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gradient-to-r from-brand-900 to-navy-900">
                {data.headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="px-5 py-4 text-sm font-bold text-white tracking-wide whitespace-nowrap border-r border-brand-800 last:border-r-0"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`border-b border-slate-100 transition-colors ${
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                  } hover:bg-brand-50/40`}
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`px-5 py-3.5 text-sm text-slate-700 border-r border-slate-100 last:border-r-0 ${
                        cellIdx === 0 ? 'font-medium text-navy-900' : ''
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ColumnsRenderer = ({ block }: { block: ColumnsBlock }) => {
  const { data } = block;
  if (!data || !data.columns || data.columns.length === 0) return null;

  const layoutClasses = {
    "50-50": "grid-cols-1 md:grid-cols-2",
    "33-33-33": "grid-cols-1 md:grid-cols-3",
    "66-33": "grid-cols-1 md:grid-cols-3",
    "33-66": "grid-cols-1 md:grid-cols-3",
  };

  const layoutClass = layoutClasses[data.layout] || "grid-cols-1 md:grid-cols-2";

  return (
    <div id={block.id} className={`my-8 w-full grid gap-8 ${layoutClass}`}>
      {data.columns.map((col, idx) => {
        // For 66-33 and 33-66 layouts, we need to span columns appropriately
        let colClass = "";
        if (data.layout === "66-33") {
          colClass = idx === 0 ? "md:col-span-2" : "md:col-span-1";
        } else if (data.layout === "33-66") {
          colClass = idx === 0 ? "md:col-span-1" : "md:col-span-2";
        }

        return (
          <div key={idx} className={`flex flex-col ${colClass}`}>
            <BlogLayoutRenderer layout={col} />
          </div>
        );
      })}
    </div>
  );
};
