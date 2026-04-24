from django.urls import path
from .views import (
    ScanJobFindingListView,
    ScanJobLogListView,
    ScanMetadataView,
    ScanStats,
    StartScanView,
    ScanHistory,
    StopScanView,
    ScanStatusView,
)

urlpatterns = [
    path("start/", StartScanView.as_view()),
    path("scan/history/", ScanHistory.as_view()),
    path("scan/stats/", ScanStats.as_view()),
    path(
        "scan/status/<int:scan_job_id>/", ScanStatusView.as_view(), name="scan-status"
    ),
    path(
        "scan/metadata/<int:scan_job_id>/",
        ScanMetadataView.as_view(),
        name="scan-metadata",
    ),
    path("scan/<int:scan_job_id>/logs/", ScanJobLogListView.as_view()),
    path("scan/<int:scan_job_id>/findings/", ScanJobFindingListView.as_view()),
    path("scan/<int:scan_job_id>/stop/", StopScanView.as_view()),
]
