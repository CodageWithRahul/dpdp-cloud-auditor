import importlib
import logging
import pkgutil

from django.utils.text import slugify

from scanner.checks import gcp as gcp_checks_package
from scanner.service_registry.gcp.gcp_service_registry import (
    get_service_name,
    get_service_scope,
    get_required_apis,
)

logger = logging.getLogger(__name__)


# -------------------------------
# Context (UPDATED)
# -------------------------------
class GCPScanContext:
    def __init__(
        self, credentials, project_id, region=None, zone=None, enabled_apis=None
    ):
        self.credentials = credentials
        self.project_id = project_id
        self.region = region
        self.zone = zone
        self.enabled_apis = enabled_apis or set()


# -------------------------------
# Module Discovery
# -------------------------------
def _discover_check_modules():
    for _, name, ispkg in pkgutil.iter_modules(gcp_checks_package.__path__):
        if ispkg:
            continue
        yield importlib.import_module(f"{gcp_checks_package.__name__}.{name}")


def _module_label(module):
    return module.__name__.split(".")[-1]


def _build_check_id(module, finding):
    prefix = _module_label(module).replace("_checks", "").upper()
    title = finding.get("check_title") or finding.get("issue_type") or "unknown-check"
    slug = slugify(title).replace("-", "_").upper()
    slug = slug or "UNKNOWN"
    return f"{prefix}_{slug}"


def calculate_gcp_total_units(regions_count):
    modules = list(_discover_check_modules())

    global_count = 0
    regional_count = 0

    for module in modules:
        module_label = getattr(module, "__name__", None)

        scope = get_service_scope(module_label)

        if scope == "GLOBAL":
            global_count += 1
        elif scope == "REGIONAL":
            regional_count += 1
        else:
            raise ValueError(f"Unknown scope for {module_label}: {scope}")

    total = global_count + (regional_count * regions_count)

    return total


# -------------------------------
# Main Runner
# -------------------------------
def run_all_checks(
    context,
    progress_tracker=None,
    log=None,
    stop_requested=None,
):
    findings = []
    scanned_services = []
    skipped_services = []

    enabled_apis = getattr(context, "enabled_apis", set())

    for module in _discover_check_modules():
        module_label = _module_label(module)

        service_name = get_service_name(module_label)
        scope = get_service_scope(module_label)
        required_apis = get_required_apis(module_label)

        region_name = context.region if context.region else "GLOBAL"

        runner = getattr(module, "run", None)

        raw_findings = []

        try:
            # -------------------------------
            # 1. STOP CHECK
            # -------------------------------
            if stop_requested and stop_requested():
                break

            # -------------------------------
            # 2. SCOPE FILTER
            # -------------------------------
            if context.region is None and scope != "GLOBAL":
                skipped_services.append(service_name)
                continue

            if context.region is not None and scope != "REGIONAL":
                skipped_services.append(service_name)
                continue

            # -------------------------------
            # 3. API CHECK
            # -------------------------------
            if required_apis and not set(required_apis).issubset(enabled_apis):
                missing = set(required_apis) - enabled_apis
                skipped_services.append(service_name)

                if log:
                    log(
                        f"Skipping {service_name} (missing APIs: {', '.join(missing)})",
                        level="WARNING",
                    )
                continue

            # -------------------------------
            # 4. RUNNER CHECK
            # -------------------------------
            if not callable(runner):
                skipped_services.append(service_name)
                continue

            # -------------------------------
            # 5. EXECUTION
            # -------------------------------
            if log:
                if context.region:
                    log(f"Running {service_name} checks in {context.region}")
                else:
                    log(f"Running {service_name} global checks")

            raw_findings = runner(context) or []
            scanned_services.append(service_name)

            # normalize
            for finding in raw_findings:
                finding.setdefault("service_name", service_name)
                finding.setdefault("status", "FAIL")
                finding.setdefault("check_id", _build_check_id(module, finding))

                if context.region:
                    finding.setdefault("region", context.region)

            findings.extend(raw_findings)

        except Exception as exc:
            logger.error("%s check failed: %s", service_name, exc)

            skipped_services.append(service_name)

            if log:
                log(
                    f"Skipping {service_name} due to execution error.",
                    level="WARNING",
                )

        finally:
            # -------------------------------
            # 6. IMPORTANT: SINGLE INCREMENT
            # -------------------------------
            if progress_tracker:
                progress_tracker.increment(service_name, region_name)

    return {
        "findings": findings,
        "scanned_services": scanned_services,
        "skipped_services": skipped_services,
    }
