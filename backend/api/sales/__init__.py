from fastapi import APIRouter
from . import leads
from . import documents
from . import notes
from . import appointments
from . import orders
from . import payments
from . import metrics
router = APIRouter()
router.include_router(leads.router)
router.include_router(documents.router)
router.include_router(notes.router)
router.include_router(appointments.router)
router.include_router(orders.router)
router.include_router(payments.router)
router.include_router(metrics.router)
