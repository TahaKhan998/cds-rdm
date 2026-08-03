# -*- coding: utf-8 -*-
#
# Copyright (C) 2026 CERN.
#
# CDS-RDM is free software; you can redistribute it and/or modify it under
# the terms of the MIT License; see LICENSE file for more details.

"""Harvester user helpers."""

from flask import current_app
from invenio_access.utils import get_identity
from invenio_accounts.proxies import current_datastore


class HarvesterUser:
    """Configured INSPIRE harvester account."""

    def get(self):
        """Load the harvester user and attach its identity once."""
        email = current_app.config.get("CDS_HARVESTER_USER_EMAIL")
        if not email:
            raise RuntimeError("CDS_HARVESTER_USER_EMAIL is not configured.")

        user = current_datastore.get_user_by_email(email)
        if user is None:
            raise RuntimeError(f"Harvester user '{email}' was not found.")
        if not user.active:
            raise RuntimeError(f"Harvester user '{email}' is inactive.")

        user.identity = get_identity(user)
        return user
