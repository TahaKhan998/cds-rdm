/*
 * Copyright (C) 2026 CERN.
 *
 * CDS-RDM is free software; you can redistribute it and/or modify it
 * under the terms of the GPL-2.0 License; see LICENSE file for more details.
 */

import { overrideStore } from "react-overridable";

import { FilenamePreservingUploadArea } from "./FilenamePreservingUploadArea";

overrideStore.add(
  "InvenioRdmRecords.DepositForm.FileUploader.UploadArea",
  FilenamePreservingUploadArea
);
