from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, Query
from fastapi.responses import JSONResponse
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Optional
import re, json, datetime, cloudinary, cloudinary.uploader
from core.config import settings

router = APIRouter()

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

PRIVILEGED_ROLES = {"digital_marketing", "superadmin", "master_admin"}

def require_dm_role(current_user: dict):
    role = current_user.get("role")
    if role not in PRIVILEGED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Requires Digital Marketing or Super Admin role."
        )

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text

def build_article_schema(blog: dict) -> dict:
    """Generate Article JSON-LD structured data for Google Rich Results."""
    published = blog.get("published_at") or datetime.datetime.utcnow().isoformat()
    updated   = blog.get("updated_at")   or published
    
    article = {
        "@type": "Article",
        "headline": blog.get("title", ""),
        "description": blog.get("meta_description", ""),
        "image": [img for img in [blog.get("cover_image"), blog.get("og_image")] if img],
        "datePublished": published,
        "dateModified": updated,
        "author": {
            "@type": "Person",
            "name": blog.get("author_name", "Genestac Team")
        },
        "publisher": {
            "@type": "Organization",
            "name": "Genestac",
            "logo": {
                "@type": "ImageObject",
                "url": "https://genestac.com/genestac.webp"
            }
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": blog.get("canonical_url", "")
        },
        "keywords": blog.get("focus_keywords", [])
    }

    faqs = blog.get("faqs") or []
    if faqs:
        faq_schema = {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": faq.get("question"),
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": faq.get("answer")
                    }
                }
                for faq in faqs if faq.get("question") and faq.get("answer")
            ]
        }
        return {
            "@context": "https://schema.org",
            "@graph": [article, faq_schema]
        }
        
    article["@context"] = "https://schema.org"
    return article


# ──────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────

@router.get("/")
async def list_blogs(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)
    offset = (page - 1) * limit
    q = supabase.table("blogs").select(
        "id, title, slug, status, published_at, author_id, meta_title, cover_image, og_image, created_at, updated_at"
    ).order("created_at", desc=True).range(offset, offset + limit - 1)
    if status:
        q = q.eq("status", status)
    res = q.execute()
    
    # Count
    count_q = supabase.table("blogs").select("id", count="exact")
    if status:
        count_q = count_q.eq("status", status)
    count_res = count_q.execute()
    
    return {"blogs": res.data, "total": count_res.count}


@router.get("/{blog_id}")
async def get_blog(
    blog_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)
    res = supabase.table("blogs").select("*").eq("id", blog_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"blog": res.data}


@router.post("/")
async def create_blog(
    title: str = Form(...),
    slug: str = Form(None),
    content_layout: str = Form("[]"),  # JSON string
    status: str = Form("draft"),
    meta_title: str = Form(None),
    meta_description: str = Form(None),
    focus_keywords: str = Form(None),  # comma-separated
    cover_image: str = Form(None),
    og_image: str = Form(None),
    canonical_url: str = Form(None),
    published_at: str = Form(None),
    faqs: str = Form("[]"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)

    final_slug = slug or slugify(title)
    # Ensure slug uniqueness by appending a timestamp suffix if collision
    existing = supabase.table("blogs").select("id").eq("slug", final_slug).execute()
    if existing.data:
        final_slug = f"{final_slug}-{int(datetime.datetime.utcnow().timestamp())}"

    keywords = [k.strip() for k in focus_keywords.split(",")] if focus_keywords else []

    payload = {
        "title": title,
        "slug": final_slug,
        "content_layout": json.loads(content_layout),
        "status": status,
        "author_id": current_user["id"],
        "meta_title": meta_title,
        "meta_description": meta_description,
        "focus_keywords": keywords if keywords else None,
        "cover_image": cover_image,
        "og_image": og_image,
        "canonical_url": canonical_url,
        "faqs": json.loads(faqs) if faqs else [],
    }
    if published_at:
        payload["published_at"] = published_at
    # Strip None values
    payload = {k: v for k, v in payload.items() if v is not None}

    res = supabase.table("blogs").insert(payload).execute()
    return {"success": True, "blog": res.data[0] if res.data else None}


@router.put("/{blog_id}")
async def update_blog(
    blog_id: str,
    title: str = Form(None),
    slug: str = Form(None),
    content_layout: str = Form(None),
    status: str = Form(None),
    meta_title: str = Form(None),
    meta_description: str = Form(None),
    focus_keywords: str = Form(None),
    cover_image: str = Form(None),
    og_image: str = Form(None),
    canonical_url: str = Form(None),
    published_at: str = Form(None),
    faqs: str = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)

    update: dict = {}
    if title is not None:
        update["title"] = title
    if slug is not None:
        update["slug"] = slug
    elif title is not None:
        update["slug"] = slugify(title)
    if content_layout is not None:
        update["content_layout"] = json.loads(content_layout)
    if status is not None:
        update["status"] = status
    if meta_title is not None:
        update["meta_title"] = meta_title
    if meta_description is not None:
        update["meta_description"] = meta_description
    if focus_keywords is not None:
        update["focus_keywords"] = [k.strip() for k in focus_keywords.split(",") if k.strip()]
    if cover_image is not None:
        update["cover_image"] = cover_image
    if og_image is not None:
        update["og_image"] = og_image
    if canonical_url is not None:
        update["canonical_url"] = canonical_url
    if published_at is not None:
        update["published_at"] = published_at
    if faqs is not None:
        update["faqs"] = json.loads(faqs)

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    res = supabase.table("blogs").update(update).eq("id", blog_id).execute()
    return {"success": True, "blog": res.data[0] if res.data else None}


@router.post("/{blog_id}/publish")
async def publish_blog(
    blog_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)

    # Fetch latest blog data
    res = supabase.table("blogs").select("*").eq("id", blog_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Blog not found")
    blog = res.data

    # Attach author name for schema
    if blog.get("author_id"):
        author_res = supabase.table("staffs").select("full_name").eq("id", blog["author_id"]).single().execute()
        blog["author_name"] = author_res.data.get("full_name", "Genestac Team") if author_res.data else "Genestac Team"

    schema = build_article_schema(blog)
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"

    update_payload = {
        "status": "published",
        "published_at": blog.get("published_at") or now_iso,
        "dynamic_schema_json": schema,
    }
    supabase.table("blogs").update(update_payload).eq("id", blog_id).execute()

    return {"success": True, "message": "Blog published", "schema": schema}


@router.delete("/{blog_id}")
async def delete_blog(
    blog_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_dm_role(current_user)
    supabase.table("blogs").delete().eq("id", blog_id).execute()
    return {"success": True, "message": "Blog deleted"}


@router.post("/upload-image")
async def upload_blog_image(
    file: UploadFile = File(...),
    folder: str = Form("blogs"),
    current_user: dict = Depends(get_current_user),
):
    require_dm_role(current_user)
    try:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        contents = await file.read()
        
        # Ensure the folder is either blogs or inventory to prevent arbitrary folder creation
        safe_folder = "inventory" if folder == "inventory" else "blogs"
        
        result = cloudinary.uploader.upload(
            contents,
            folder=f"genestac/{safe_folder}",
            resource_type="image",
            format="webp",
            quality="auto",
            transformation=[
                {
                    "width": 1200, 
                    "crop": "limit",
                    "fetch_format": "webp", 
                    "quality": "auto"
                }
            ],
        )
        return {"success": True, "url": result["secure_url"], "public_id": result["public_id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
