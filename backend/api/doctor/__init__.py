# pyrefly: ignore [missing-import]
from fastapi import APIRouter
from . import appointments
from . import patients
from . import prescriptions
from . import assessments
from . import inventory
from . import metrics
from . import availability
from . import notifications
from . import prescription_settings
from . import test_requests
router = APIRouter()
router.include_router(appointments.router)
router.include_router(patients.router)
router.include_router(prescriptions.router)
router.include_router(assessments.router)
router.include_router(inventory.router)
router.include_router(metrics.router)
router.include_router(availability.router)
router.include_router(notifications.router)
router.include_router(prescription_settings.router)
router.include_router(test_requests.router)

