import cloudinary
import cloudinary.uploader
from core.config import settings
from fastapi import UploadFile

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

def upload_file_to_cloudinary(file: UploadFile, folder: str = "genestac") -> str:
    """
    Uploads a file to Cloudinary and returns the secure URL.
    """
    result = cloudinary.uploader.upload(
        file.file,
        folder=folder,
        resource_type="auto" # Auto detects image, video, raw etc.
    )
    return result.get("secure_url")
