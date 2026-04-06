from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scanner", "0003_scanjob_cancel_requested_alter_scanjob_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="scanjob",
            name="target_regions",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
