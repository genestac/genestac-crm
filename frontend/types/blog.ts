export type BlogStatus = 'draft' | 'published' | 'scheduled'

export interface BaseBlock {
  id: string;
  type: string;
  spacing?: { marginTop?: string; marginBottom?: string };
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  data?: {
    id?: string;
    level?: 'h2' | 'h3' | 'h4';
    align?: 'left' | 'center' | 'right';
    text: string;
  };
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  data?: {
    html?: string;
    baseFontSize?: string;
    paragraphSpacing?: string;
    lineHeight?: string;
  };
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  data?: {
    images?: Array<{ url?: string; alt?: string; caption?: string }>;
    layout?: 'single' | 'grid-2' | 'grid-3' | 'grid-4';
    align?: 'left' | 'center' | 'right';
    textSide?: 'none' | 'left' | 'right';
    imageWidth?: '33' | '50' | '66';
    textHtml?: string;
  };
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  data?: {
    url?: string;
    title?: string;
    transcript?: string;
  };
}

export interface CTABlock extends BaseBlock {
  type: 'cta';
  data?: {
    href?: string;
    text?: string;
    bgColor?: string;
    color?: string;
    openInNewTab?: boolean;
  };
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  data?: {
    headers: string[];
    rows: string[][];
  };
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  data?: {
    layout: '50-50' | '33-33-33' | '66-33' | '33-66';
    columns: ContentLayoutBlock[][];
  };
}

export type ContentLayoutBlock = 
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | VideoBlock
  | CTABlock
  | TableBlock
  | ColumnsBlock;

export type ContentBlock = ContentLayoutBlock; // For compatibility with actions.ts

export interface Blog {
  id: string
  title: string
  slug: string
  content_layout: ContentBlock[]
  status: BlogStatus
  published_at: string | null
  author_id: string | null
  meta_title: string | null
  meta_description: string | null
  focus_keywords: string[] | null
  cover_image: string | null
  og_image: string | null
  canonical_url: string | null
  faqs: { question: string, answer: string }[] | null
  dynamic_schema_json: object | null
  created_at: string
  updated_at: string
}

export function toLocalDatetimeInput(dateInput?: string | Date | null): string {
  if (!dateInput) return ''
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

