from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from scanner.runners import aws_runner


class AwsRunnerGlobalServicesTests(SimpleTestCase):
    def test_global_services_ran_shared_across_calls(self):
        calls = {"s3": 0, "ec2": 0}

        def s3_run(_session):
            calls["s3"] += 1
            return [{"issue_type": "bucket issue"}]

        def ec2_run(_session):
            calls["ec2"] += 1
            return [{"issue_type": "instance issue"}]

        s3_module = SimpleNamespace(
            __name__="scanner.checks.aws.s3_checks",
            run=s3_run,
        )
        ec2_module = SimpleNamespace(
            __name__="scanner.checks.aws.ec2_checks",
            run=ec2_run,
        )

        shared_global_services_ran: set[str] = set()
        session = object()

        with patch.object(
            aws_runner, "_discover_check_modules", return_value=[s3_module, ec2_module]
        ), patch.object(aws_runner, "_service_available", return_value=True):
            first = aws_runner.run_all_checks(
                session, global_services_ran=shared_global_services_ran
            )
            second = aws_runner.run_all_checks(
                session, global_services_ran=shared_global_services_ran
            )

        self.assertEqual(calls["s3"], 1, "S3 checks should run only once per scan job")
        self.assertEqual(calls["ec2"], 2, "EC2 checks should run for every region")
        self.assertIn("S3", shared_global_services_ran)
        self.assertIn("S3", second.get("skipped_global_services", []))
        self.assertIn("S3", first["scanned_services"])
        self.assertIn("EC2", first["scanned_services"])

    def test_global_services_marked_ran_when_unavailable(self):
        calls = {"s3": 0, "ec2": 0}

        def s3_run(_session):
            calls["s3"] += 1
            return [{"issue_type": "bucket issue"}]

        def ec2_run(_session):
            calls["ec2"] += 1
            return [{"issue_type": "instance issue"}]

        s3_module = SimpleNamespace(
            __name__="scanner.checks.aws.s3_checks",
            run=s3_run,
        )
        ec2_module = SimpleNamespace(
            __name__="scanner.checks.aws.ec2_checks",
            run=ec2_run,
        )

        def availability_side_effect(module, _session):
            return aws_runner._module_label(module) != "s3_checks"

        shared_global_services_ran: set[str] = set()
        session = object()

        with patch.object(
            aws_runner, "_discover_check_modules", return_value=[s3_module, ec2_module]
        ), patch.object(aws_runner, "_service_available", side_effect=availability_side_effect):
            aws_runner.run_all_checks(session, global_services_ran=shared_global_services_ran)
            second = aws_runner.run_all_checks(session, global_services_ran=shared_global_services_ran)

        self.assertEqual(calls["s3"], 0, "Unavailable S3 checks should not run")
        self.assertEqual(calls["ec2"], 2, "EC2 checks should still run per region")
        self.assertIn("S3", shared_global_services_ran)
        self.assertIn("S3", second.get("skipped_global_services", []))
