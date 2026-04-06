from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scanner", "0004_scanjob_target_regions"),
    ]

    operations = [
        migrations.AddField(
            model_name="finding",
            name="region",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
