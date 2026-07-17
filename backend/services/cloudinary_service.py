import cloudinary
import cloudinary.uploader
from core.config import settings
from fastapi import UploadFile
import io
from PIL import Image

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

def upload_file_to_cloudinary(file: UploadFile, folder: str = "genestac") -> str:
    """
    Uploads a file to Cloudinary and returns the secure URL.
    Optimizes and resizes large images before uploading.
    """
    file_content = file.file.read()
    file.file.seek(0)
    
    upload_data = file.file
    
    # Only optimize if it's an image
    if file.content_type and file.content_type.startswith('image/'):
        try:
            img = Image.open(io.BytesIO(file_content))
            # Convert RGBA to RGB if saving as JPEG (for optimization)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # Resize if too large (e.g., max 1920x1920)
            img.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
            
            output = io.BytesIO()
            # Default to JPEG for size reduction unless it's a PNG that needs transparency (already converted to RGB for safety, but could preserve PNG if needed. For now JPEG is safest for large files)
            img.save(output, format='JPEG', optimize=True, quality=80)
            output.seek(0)
            upload_data = output
        except Exception as e:
            print(f"Image optimization failed, falling back to original: {e}")
            # Fallback to original file
            upload_data = file.file
            file.file.seek(0)

    try:
        result = cloudinary.uploader.upload(
            upload_data,
            folder=folder,
            resource_type="auto" # Auto detects image, video, raw etc.
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload error: {e}")
        raise ValueError(f"Failed to upload file to Cloudinary: {str(e)}")
