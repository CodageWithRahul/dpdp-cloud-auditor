from django.urls import path

from .views import (
    CloudAccountScanResultsView,
    ReportSummaryView,
    ScanResultDetailView,
    ScanResultListView,
    ServiceWiseReportView,
    export_excel_report,
    export_pdf_report,
)

urlpatterns = [
    path(
        "cloud-accounts/<int:cloud_account_id>/results/",
        CloudAccountScanResultsView.as_view(),
        name="cloudaccount-scan-results",
    ),
    path(
        "<int:scan_job_id>/results/",
        ScanResultListView.as_view(),
        name="scanresult-list",
    ),
    path("result/<int:pk>/", ScanResultDetailView.as_view(), name="scanresult-detail"),
    path(
        "<int:scan_job_id>/summary/",
        ReportSummaryView.as_view(),
        name="scanjob-summary",
    ),
    path(
        "<int:scan_job_id>/services/",
        ServiceWiseReportView.as_view(),
        name="service-wise-report",
    ),
    path("export/pdf/", export_pdf_report, name="report-export-pdf"),
    path("export/excel/", export_excel_report, name="report-export-excel"),
]
