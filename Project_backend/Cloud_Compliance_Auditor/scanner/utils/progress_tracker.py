from django.utils import timezone

from django.core.cache import cache


class ProgressTracker:
    def __init__(self, total_units, scan_job):
        self.total_units = total_units
        self.completed_units = 0
        self.scan_job = scan_job

    def increment(self, service_name=None, region_name=None):
        self.completed_units += 1

        progress = (
            int((self.completed_units / self.total_units) * 100)
            if self.total_units
            else 0
        )

        cache.set(
            f"scan_progress_{self.scan_job.id}",
            {
                "progress": progress,
                "completed_units": self.completed_units,
                "total_units": self.total_units,
                "current_service": service_name,
                "current_region": region_name,
            },
            timeout=3600,
        )


class TakenTime:
    def __init__(self):
        self.start_time = None
        self.end_time = None

    def start(self):
        self.start_time = timezone.now()

    def finish(self):
        self.end_time = timezone.now()

    def __str__(self):
        if not self.start_time or not self.end_time:
            return "0s"
        return str(self.end_time - self.start_time)

    def time_taken(self):
        if not self.start_time or not self.end_time:
            return None

        duration = self.end_time - self.start_time
        total_seconds = int(duration.total_seconds())

        if total_seconds < 60:
            return f"{total_seconds} sec"

        minutes = total_seconds // 60
        seconds = total_seconds % 60

        if minutes < 60:
            if seconds:
                return f"{minutes} min {seconds} sec"
            return f"{minutes} min"

        hours = minutes // 60
        minutes = minutes % 60

        if minutes or seconds:
            return f"{hours} hr {minutes} min {seconds} sec"

        return f"{hours} hr"
