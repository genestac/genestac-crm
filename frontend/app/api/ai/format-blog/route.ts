import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { rawText } = await req.json()
  if (!rawText?.trim()) {
    return NextResponse.json({ error: 'rawText is required' }, { status: 400 })
  }

  const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    'AQ.Ab8RN6Kd7bMJ4ryAbLYSmFKTSV5oEu5VtCjb8H2zlOxdgFa01g'

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
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
    { "id": "block-2", "type": "text", "data": { "html": "<p>...</p>" } }
  ],
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}`

  const candidateModels = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.0-flash',
  ]

  let lastError = ''
  let responseText = ''

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nRaw blog text to format:\n\n${rawText}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        lastError = `${model} failed (${res.status}): ${errText}`
        continue
      }

      const geminiData = await res.json()
      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (responseText) {
        break
      }
    } catch (e) {
      lastError = String(e)
    }
  }

  if (!responseText) {
    return NextResponse.json(
      { error: `Gemini formatting failed: ${lastError || 'No response generated'}` },
      { status: 500 }
    )
  }

  // Strip potential markdown fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: {
    seo: Record<string, string>
    blocks: unknown[]
    faqs: { question: string; answer: string }[]
  }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json(
      { error: 'Gemini returned invalid JSON structure', raw: cleaned },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    seo: parsed.seo || {},
    blocks: parsed.blocks || [],
    faqs: parsed.faqs ?? [],
  })
}
