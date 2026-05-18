"""
This script mints missing DOIs for dissertations created on CDS-RDM since the
migration date.

It searches for published dissertation records created on or after 2025-05-15
that do not have a DOI yet. For each matching record, it opens an edit draft,
reserves a DOI, and republishes the record so the DOI is registered through the
normal service flow.

How to use:
1. Review and adjust the configuration constants below if needed.
2. Run in dry-run mode first.
3. Set EXECUTE = True when you are ready to mint the DOIs.
4. Execute the script:
   invenio shell scripts/mint_dissertation_dois_since_migration.py
"""

from datetime import datetime

from invenio_access.permissions import system_identity
from invenio_rdm_records.proxies import current_rdm_records_service
from invenio_rdm_records.records.systemfields.deletion_status import (
    RecordDeletionStatusEnum,
)
from invenio_search.api import RecordsSearchV2


CUTOFF_DATE = "2025-05-15"
RESOURCE_TYPE = "publication-dissertation"
LOGFILE = "/eos/media/cds/cds-rdm/prod/migration/dissertations_doi_backfill_logs.txt"
LIMIT = None
EXECUTE = False


def search_candidate_records():
    """Search published dissertations without a DOI since the migration date."""
    records = []
    search = (
        RecordsSearchV2(index=current_rdm_records_service.record_cls.index._name)
        .filter("term", deletion_status=RecordDeletionStatusEnum.PUBLISHED.value)
        .filter("term", has_draft=False)
        .filter("term", **{"metadata.resource_type.id": RESOURCE_TYPE})
        .filter("range", created={"gte": CUTOFF_DATE})
        .exclude("exists", field="pids.doi.identifier")
        .source(["id", "created", "metadata.title"])
    )

    for hit in search.scan():
        records.append(
            {
                "id": hit["id"],
                "created": hit.get("created"),
                "title": hit.get("metadata", {}).get("title", "No title"),
            }
        )
        if LIMIT is not None and len(records) >= LIMIT:
            break

    return records


def process_record(record_id, logfile):
    """Mint DOI for one dissertation record."""
    created_draft = False

    try:
        record = current_rdm_records_service.read(system_identity, record_id)
        record = record._record

        if record.has_draft:
            logfile.write(f"SKIP: Record {record_id} already has a draft\n")
            print(f"SKIP: Record {record_id} already has a draft")
            return "skipped"

        if record.access.record != "public":
            logfile.write(f"SKIP: Record {record_id} is not public\n")
            print(f"SKIP: Record {record_id} is not public")
            return "skipped"

        if record.get("pids", {}).get("doi"):
            logfile.write(f"SKIP: Record {record_id} already has a DOI\n")
            print(f"SKIP: Record {record_id} already has a DOI")
            return "skipped"

        if record.parent.pids.get("doi"):
            logfile.write(
                f"SKIP: Record {record_id} parent already has a DOI while record DOI is missing\n"
            )
            print(
                f"SKIP: Record {record_id} parent already has a DOI while record DOI is missing"
            )
            return "skipped"

        if not record.get("metadata", {}).get("publisher"):
            logfile.write(f"SKIP: Record {record_id} is missing publisher\n")
            print(f"SKIP: Record {record_id} is missing publisher")
            return "skipped"

        if not EXECUTE:
            logfile.write(f"DRY-RUN: Record {record_id} is eligible for DOI minting\n")
            print(f"DRY-RUN: Record {record_id} is eligible for DOI minting")
            return "dry-run"

        draft = current_rdm_records_service.edit(system_identity, record_id)
        created_draft = True
        draft = current_rdm_records_service.pids.create(
            system_identity, draft.id, "doi"
        )
        published = current_rdm_records_service.publish(system_identity, draft.id)

        doi = published["pids"]["doi"]["identifier"]
        parent_doi = published["parent"]["pids"]["doi"]["identifier"]
        logfile.write(
            f"LOG: Minted DOI {doi} for record {record_id} and parent DOI {parent_doi}\n"
        )
        print(
            f"LOG: Minted DOI {doi} for record {record_id} and parent DOI {parent_doi}"
        )
        return "updated"
    except Exception as error:
        if created_draft:
            try:
                current_rdm_records_service.delete_draft(system_identity, record_id)
            except Exception as cleanup_error:
                logfile.write(
                    f"FAIL: Record {record_id} failed with {repr(error)} | cleanup failed with {repr(cleanup_error)}\n"
                )
                print(
                    f"FAIL: Record {record_id} failed with {repr(error)} | cleanup failed with {repr(cleanup_error)}"
                )
                return "failed"

        logfile.write(f"FAIL: Record {record_id} failed with {repr(error)}\n")
        print(f"FAIL: Record {record_id} failed with {repr(error)}")
        return "failed"


def process_records():
    """Process all dissertations without DOIs since the migration date."""
    datetime.fromisoformat(CUTOFF_DATE)
    records = search_candidate_records()

    print(f"Found {len(records)} dissertation records without DOI since {CUTOFF_DATE}")

    with open(LOGFILE, "a", encoding="utf-8") as logfile:
        timestamp = datetime.now().isoformat()
        header = (
            f"=== Dissertation DOI backfill - {timestamp} | "
            f"cutoff={CUTOFF_DATE} | execute={EXECUTE} | candidates={len(records)} ==="
        )
        print(header)
        logfile.write(header + "\n")

        updated = 0
        dry_run = 0
        skipped = 0
        failed = 0

        for index, record in enumerate(records, start=1):
            message = (
                f"[{index}/{len(records)}] Processing record {record['id']} | "
                f"created={record.get('created')} | title={record['title']}"
            )
            print(message)
            logfile.write(message + "\n")

            result = process_record(record["id"], logfile)
            if result == "updated":
                updated += 1
            elif result == "dry-run":
                dry_run += 1
            elif result == "skipped":
                skipped += 1
            else:
                failed += 1

        summary = (
            f"=== SUMMARY === updated={updated} dry-run={dry_run} "
            f"skipped={skipped} failed={failed}"
        )
        print(summary)
        logfile.write(summary + "\n")


process_records()
