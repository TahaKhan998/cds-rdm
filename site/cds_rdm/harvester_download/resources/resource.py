# -*- coding: utf-8 -*-
#
# Copyright (C) 2026 CERN.
#
# CDS-RDM is free software; you can redistribute it and/or modify it
# under the terms of the GPL-2.0 License; see LICENSE file for more details.

"""Harvester download resource."""

import re
import uuid
from datetime import datetime, timezone

from flask import Response, current_app, request
from flask_babel import format_datetime, get_timezone
from flask_resources import Resource, route
from invenio_access.permissions import system_identity
from invenio_i18n import gettext as _
from invenio_jobs.models import Run
from invenio_jobs.proxies import current_jobs_logs_service

from cds_rdm.administration.permissions import curators_permission

INSPIRE_HARVESTER_TASK = "process_inspire"


def _format_timestamp(value):
    """``Run.started_at`` / ``finished_at``: naive DB datetimes are UTC → user locale."""
    if value is None or value == "":
        return "N/A"
    if isinstance(value, datetime):
        dt = (
            value.replace(tzinfo=timezone.utc)
            if value.tzinfo is None
            else value
        )
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return str(value)
    return format_datetime(dt, "yyyy-MM-dd HH:mm", rebase=True)


def _format_log_hit_timestamp(value):
    """Job log ``timestamp`` from search: zone-less ISO is local wall (like admin RunsLogs)."""
    if value is None or value == "":
        return "N/A"
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return str(value)
    if dt.tzinfo is None:
        tz = get_timezone()
        if hasattr(tz, "localize"):
            dt = tz.localize(dt)
        else:
            dt = dt.replace(tzinfo=tz)
        return format_datetime(dt, "yyyy-MM-dd HH:mm", rebase=False)
    return format_datetime(dt, "yyyy-MM-dd HH:mm", rebase=True)


class HarvesterDownloadResource(Resource):
    """Harvester download resource."""

    def create_url_rules(self):
        """Create the URL rules for the download resource."""
        routes = self.config.routes
        return [
            route("GET", routes["download"], self.download),
        ]

    @staticmethod
    def _resolve_harvester_run(run_id):
        """Return ``(run, None)`` or ``(None, (error_dict, status))``."""
        run_id = (run_id or "").strip()
        if not run_id:
            return None, ({"message": "Missing run_id"}, 400)
        try:
            uuid.UUID(run_id)
        except ValueError:
            return None, ({"message": "Invalid run_id"}, 400)

        run = Run.query.filter_by(id=run_id, parent_run_id=None).one_or_none()
        if not run:
            return None, ({"message": "Run not found"}, 404)
        if not run.job or run.job.task != INSPIRE_HARVESTER_TASK:
            return None, ({"message": "Run is not a harvester run"}, 404)
        return run, None

    def _fetch_hits(self, run):
        """Return ``(hits, total)`` from structured job logs."""
        try:
            result = current_jobs_logs_service.search(
                system_identity,
                params={
                    "q": f'"{run.id}"',
                    "sort": "timestamp",
                },
            )
            hits = list(result.hits)
            total = result.total or len(hits)
        except Exception:
            current_app.logger.exception(
                "Failed to fetch structured job logs for harvester run %s", run.id
            )
            hits = []
            total = 0
        return hits, total

    def _lines_from_hits(self, hits):
        """De-duplicated lines and counts (task-group order, same as before)."""
        task_groups = {}
        seen = set()
        error_count = 0
        warning_count = 0
        for hit in hits:
            raw_ts = hit.get("timestamp")
            level = hit.get("level", "INFO")
            message = re.sub(r"\s+", " ", (hit.get("message") or "")).strip()
            key = (raw_ts, level, message)
            if key in seen:
                continue
            seen.add(key)
            if level == "ERROR":
                error_count += 1
            elif level == "WARNING":
                warning_count += 1
            task_id = (hit.get("context") or {}).get("task_id") or "unknown"
            task_groups.setdefault(task_id, []).append(
                f"[{_format_log_hit_timestamp(raw_ts)}] {level} {message}"
            )
        lines = [line for group in task_groups.values() for line in group]
        return lines, error_count, warning_count

    def _plain_text_log(self, run, lines, total, error_count, warning_count):
        """Same plain-text shape as the original download endpoint."""
        max_results = current_app.config.get("JOBS_LOGS_MAX_RESULTS", 2000)
        status = getattr(run.status, "name", str(run.status))
        header = [
            f"Status: {status}",
            f"Started: {_format_timestamp(run.started_at)}",
        ]
        if run.finished_at:
            header.append(f"Finished: {_format_timestamp(run.finished_at)}")

        summary = []
        if status in ("FAILED", "PARTIAL_SUCCESS", "SUCCESS"):
            summary.append(
                {
                    "FAILED": _("Job failed"),
                    "PARTIAL_SUCCESS": _("Job partially succeeded"),
                    "SUCCESS": _("Job completed successfully"),
                }[status]
            )
        if run.message:
            summary.append(run.message)
        if error_count:
            summary.append(
                _("%(count)s error(s) found in logs below", count=error_count)
            )
        if warning_count:
            summary.append(
                _("%(count)s warning(s) found in logs below", count=warning_count)
            )
        if summary:
            header.append("")
            header.extend(summary)

        if total and total > len(lines):
            header.append(
                f"Showing first {len(lines)} of {total} log entries "
                f"(truncated at JOBS_LOGS_MAX_RESULTS={max_results})."
            )
        header.append("=" * 80)

        logs = "\n".join(header + lines)
        if not lines:
            logs += "\n" + (run.message or "No logs available for this run.\n")
        return logs

    def report_template_context(self, run_id):
        """Context for the colored HTML report page; errors like ``download``."""
        run, err = self._resolve_harvester_run(run_id)
        if err:
            return None, err
        hits, total = self._fetch_hits(run)
        lines, error_count, _unused_warnings = self._lines_from_hits(hits)
        status = getattr(run.status, "name", str(run.status))

        truncation_message = None
        if total and total > len(lines):
            truncation_message = (
                f"Log results truncated. Too many log results returned ({total}). "
                f"Only the most recent {len(lines)} results are shown."
            )

        display_title = (getattr(run, "title", None) or "").strip() or f"Run {run.id}"
        ctx = {
            "run": run,
            "title": display_title,
            "status": status,
            "started_at": _format_timestamp(run.started_at),
            "finished_at": (
                _format_timestamp(run.finished_at) if run.finished_at else None
            ),
            "truncation_message": truncation_message,
            "lines": lines,
            "error_count": error_count,
        }
        return ctx, None

    def download(self):
        """Download a harvester run's logs as a plain-text ``.log`` file."""
        if not curators_permission.can():
            return {"message": "Permission denied"}, 403

        run, err = self._resolve_harvester_run(request.args.get("run_id", ""))
        if err:
            return err

        hits, total = self._fetch_hits(run)
        lines, error_count, warning_count = self._lines_from_hits(hits)
        logs = self._plain_text_log(run, lines, total, error_count, warning_count)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"harvester_logs_{run.id}_{timestamp}.log"

        return Response(
            logs,
            mimetype="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
