import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { rawText } = await req.json()
  if (!rawText?.trim()) {
    return NextResponse.json({ error: 'rawText is required' }, { status: 400 })
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY
  if (!NVIDIA_API_KEY) {
    return NextResponse.json({ error: 'NVIDIA_API_KEY not configured' }, { status: 500 })
  }

  const systemPrompt = `You are a professional blog content formatter. The user will give you raw, unformatted blog text. Your job is to:
1. Parse and structure it into a JSON object with three keys: "seo", "blocks", and "faqs".
2. "seo" should contain: title (string), slug (url-safe string), metaTitle (max 60 chars), metaDescription (max 160 chars), focusKeywords (comma-separated string of 3-5 keywords).
3. "blocks" is an array of ContentBlock objects. Each block has: id (unique string like "block-1"), type, and data.
4. "faqs" is an array of 4-6 FAQ objects, each with: { "question": string, "answer": string }. Generate relevant FAQs based on the blog content even if none are explicitly listed in the raw text.

BLOCK TYPES YOU MUST USE:
- heading: { level: "h2"|"h3"|"h4", text: string, id: string (anchor slug), align: "left" }
- text: { html: string } — html can contain <p>, <strong>, <em>, <ul>, <ol>, <li>, <a href="...">, <br>. NO markdown. Use real HTML tags.
- table: { headers: string[], rows: string[][] }
- cta: { text: string, href: "#contact", color: "#ffffff", bgColor: "#7c3aed", openInNewTab: false }

RULES:
- NEVER use "image" or "video" blocks. Skip any image references.
- Use h2 for main sections, h3 for subsections, h4 for minor headings.
- Use text blocks with proper HTML for body content, bullet lists, numbered lists.
- Use table blocks for any tabular data or comparisons.
- Use cta blocks for any call-to-action or button text at the end.
- Every heading must have a unique anchor id (kebab-case of the heading text).
- Each block MUST have a unique id string (e.g. "block-1", "block-2", etc.)
- FAQs must be practical questions a reader would actually ask, with clear concise answers (2-3 sentences each).
- Return ONLY the raw JSON object. No markdown fences, no explanation.

OUTPUT FORMAT:
{
  "seo": {
    "title": "...",
    "slug": "...",
    "metaTitle": "...",
    "metaDescription": "...",
    "focusKeywords": "..."
  },
  "blocks": [
    { "id": "block-1", "type": "heading", "data": { "level": "h2", "text": "...", "id": "...", "align": "left" } },
    { "id": "block-2", "type": "text", "data": { "html": "<p>...</p>" } },
    ...
  ],
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}`

    const payload = {
      model: 'meta/llama-3.1-8b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Raw blog text to format:\n\n' + rawText }
    ],
    temperature: 0.3,
    max_tokens: 4096,
  }

  try {
    const res = await fetch(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NVIDIA_API_KEY}`
        },
        body: JSON.stringify(payload),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `NVIDIA error: ${err}` }, { status: 500 })
    }

    const nvidiaData = await res.json()
    const rawJson = nvidiaData?.choices?.[0]?.message?.content ?? ''

    // Strip markdown fences if Gemini wraps the response
    const cleaned = rawJson.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

    let parsed: { seo: Record<string, string>, blocks: unknown[], faqs: { question: string, answer: string }[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'NVIDIA returned invalid JSON', raw: cleaned }, { status: 500 })
    }

    return NextResponse.json({ success: true, seo: parsed.seo, blocks: parsed.blocks, faqs: parsed.faqs ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
