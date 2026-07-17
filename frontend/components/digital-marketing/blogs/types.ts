// Shared types for the blog block editor

export type BlockType = 'heading' | 'text' | 'image' | 'video' | 'cta' | 'table' | 'columns'

export interface HeadingData {
  level: 'h2' | 'h3' | 'h4'
  text: string
  id: string // auto-generated anchor
  align?: 'left' | 'center' | 'right'
}

export interface TextData {
  html: string // innerHTML with basic rich-text markup
  paragraphSpacing?: string
  lineHeight?: string
  baseFontSize?: string
}

export interface ImageItem {
  url: string
  alt: string
  caption: string
}

export interface ImageData {
  layout: 'single' | 'grid-2' | 'grid-3' | 'grid-4'
  align?: 'left' | 'center' | 'right'
  images: ImageItem[]
  textSide?: 'none' | 'left' | 'right'
  textHtml?: string
  imageWidth?: '33' | '50' | '66'
}

export interface VideoData {
  url: string
  title: string
  transcript: string
}

export interface CTAData {
  text: string
  href: string
  color: string // hex or tailwind-compatible value
  bgColor: string
  openInNewTab: boolean
}

export interface TableData {
  headers: string[]
  rows: string[][]
}

export interface ColumnsData {
  layout: '50-50' | '33-33-33' | '66-33' | '33-66'
  columns: ContentBlock[][]
}

export interface BlockSpacing {
  marginTop?: string;
  marginBottom?: string;
  paddingTop?: string;
  paddingBottom?: string;
}

export interface ContentBlock {
  id: string
  type: BlockType
  data: HeadingData | TextData | ImageData | VideoData | CTAData | TableData | ColumnsData
  spacing?: BlockSpacing
}

export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
