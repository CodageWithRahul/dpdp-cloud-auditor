from django.urls import path
from .views import (
    ScanJobFindingListView,
    ScanJobLogListView,
    StartScanView,
    ScanHistory,
    StopScanView,
)

urlpatterns = [
    path("start/", StartScanView.as_view()),
    path("scan/history/", ScanHistory.as_view()),
    path("scan/<int:scan_job_id>/logs/", ScanJobLogListView.as_view()),
    path("scan/<int:scan_job_id>/findings/", ScanJobFindingListView.as_view()),
    path("scan/<int:scan_job_id>/stop/", StopScanView.as_view()),
]
