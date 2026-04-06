from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("report", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="scanresult",
            name="region",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
