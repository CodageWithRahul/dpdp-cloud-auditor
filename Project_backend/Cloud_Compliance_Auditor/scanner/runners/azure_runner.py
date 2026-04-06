import importlib
import logging
import pkgutil

from django.utils.text import slugify

from scanner.checks import azure as azure_checks_package

logger = logging.getLogger(__name__)


class AzureScanContext:
    def __init__(self, credential, subscription_id):
        self.credential = credential
        self.subscription_id = subscription_id


_SERVICE_NAME_MAP = {
    "resource_group_checks": "Resource Groups",
    "resource_tag_checks": "Tagged Resources",
}


def _discover_check_modules():
    for finder, name, ispkg in pkgutil.iter_modules(azure_checks_package.__path__):
        if ispkg:
            continue
        yield importlib.import_module(f"{azure_checks_package.__name__}.{name}")


def _module_label(module):
    return module.__name__.split(".")[-1]


def _default_service(module):
    label = _module_label(module)
    if label in _SERVICE_NAME_MAP:
        return _SERVICE_NAME_MAP[label]
    if label.endswith("_checks"):
        return label.replace("_checks", "").capitalize()
    return label.capitalize()


def _build_check_id(module, finding):
    prefix = _module_label(module).replace("_checks", "").upper()
    title = finding.get("check_title") or finding.get("issue_type") or "unknown-check"
    slug = slugify(title).replace("-", "_").upper()
    slug = slug or "UNKNOWN"
    return f"{prefix}_{slug}"


def run_all_checks(context, log=None, stop_requested=None):
    findings = []
    scanned_services = []
    skipped_services = []

    for module in _discover_check_modules():
        service_name = _default_service(module)
        if stop_requested and stop_requested():
            logger.info("Azure scan interrupted before running %s checks.", service_name)
            break
        runner = getattr(module, "run", None)
        if not callable(runner):
            continue

        if log:
            log(f"Running {service_name} checks.")

        try:
            raw_findings = runner(context) or []
        except Exception as exc:
            logger.error("Azure %s runner crashed: %s", service_name, exc, exc_info=True)
            skipped_services.append(service_name)
            if log:
                log(
                    f"Skipping {service_name} checks because the check failed to execute.",
                    level="WARNING",
                )
            continue

        scanned_services.append(service_name)

        for finding in raw_findings:
            finding.setdefault("service_name", service_name)
            finding.setdefault("status", "FAIL")
            finding.setdefault("check_title", finding.get("issue_type") or "Unnamed check")
            finding.setdefault("check_id", _build_check_id(module, finding))

        findings.extend(raw_findings)

    return {
        "findings": findings,
        "scanned_services": scanned_services,
        "skipped_services": skipped_services,
    }
