from django.contrib import admin
from .models import CloudAccount, CloudRegion


@admin.register(CloudAccount)
class CloudAccountAdmin(admin.ModelAdmin):

    list_display = (
        "account_name",
        "provider",
        "user",
        "is_active",
        "created_at",
    )

    list_filter = ("provider", "is_active")

    search_fields = ("account_name", "user__username")

    readonly_fields = ("created_at",)


admin.register(CloudRegion)
