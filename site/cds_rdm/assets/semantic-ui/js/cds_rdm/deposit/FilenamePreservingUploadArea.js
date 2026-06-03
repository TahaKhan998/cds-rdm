/*
 * Copyright (C) 2026 CERN.
 *
 * CDS-RDM is free software; you can redistribute it and/or modify it
 * under the terms of the GPL-2.0 License; see LICENSE file for more details.
 */

import { i18next } from "@translations/invenio_rdm_records/i18next";
import { getIn, useFormikContext } from "formik";
import _get from "lodash/get";
import PropTypes from "prop-types";
import React, { useRef, useState } from "react";
import Dropzone from "react-dropzone";
import { connect } from "react-redux";
import { humanReadableBytes, FeedbackLabel } from "react-invenio-forms";
import {
  Button,
  Grid,
  Header,
  Icon,
  Message,
  Popup,
  Progress,
  Radio,
  Segment,
  Table,
} from "semantic-ui-react";

import { uploadFiles } from "@js/invenio_rdm_records/src/deposit/state/actions/files";

const getExtension = (filename) => {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
    return "";
  }

  return filename.slice(lastDotIndex).toLowerCase();
};

const ReplaceFileCell = ({ file, onReplace, isReplacing, isDisabled }) => {
  const inputRef = useRef(null);
  const replaceTooltip = i18next.t(
    "Upload a new version of this file."
  );

  const onFileSelected = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (selectedFile) {
      onReplace(file, selectedFile);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" hidden onChange={onFileSelected} />
      <Popup
        content={replaceTooltip}
        position="top center"
        trigger={
          <Icon
            link={!isDisabled}
            className="action primary"
            name={isReplacing ? "spinner" : "upload"}
            loading={isReplacing}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) {
                inputRef.current?.click();
              }
            }}
            aria-label={replaceTooltip}
          />
        }
      />
    </>
  );
};

ReplaceFileCell.propTypes = {
  file: PropTypes.object.isRequired,
  onReplace: PropTypes.func.isRequired,
  isReplacing: PropTypes.bool,
  isDisabled: PropTypes.bool,
};

ReplaceFileCell.defaultProps = {
  isReplacing: false,
  isDisabled: false,
};

const FileTableHeader = ({ filesLocked, replaceEnabled }) => (
  <Table.Header>
    <Table.Row>
      <Table.HeaderCell>
        {i18next.t("Preview")}{" "}
        <Popup
          content={i18next.t(
            "Choose which file to preview on the published record landing page"
          )}
          trigger={<Icon fitted name="help circle" size="small" />}
        />
      </Table.HeaderCell>
      <Table.HeaderCell>{i18next.t("Filename")}</Table.HeaderCell>
      <Table.HeaderCell>{i18next.t("Size")}</Table.HeaderCell>
      {!filesLocked && (
        <Table.HeaderCell textAlign="center">
          {i18next.t("Progress")}
        </Table.HeaderCell>
      )}
      {!filesLocked && replaceEnabled && (
        <Table.HeaderCell textAlign="center" />
      )}
      {!filesLocked && <Table.HeaderCell />}
    </Table.Row>
  </Table.Header>
);

FileTableHeader.propTypes = {
  filesLocked: PropTypes.bool,
  replaceEnabled: PropTypes.bool,
};

FileTableHeader.defaultProps = {
  filesLocked: false,
  replaceEnabled: false,
};

const FileTableRow = ({
  decimalSizeDisplay,
  defaultPreview,
  deleteFile,
  file,
  fileError,
  filesLocked,
  onReplace,
  replaceEnabled,
  replacingFileName,
  setDefaultPreview,
}) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDefaultPreview = defaultPreview === file.name;
  const isReplacing = replacingFileName === file.name;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFile(file);
      if (isDefaultPreview) {
        setDefaultPreview("");
      }
    } catch (error) {
      setIsDeleting(false);
      console.error(error);
    }
  };

  const handleCancelUpload = () => {
    setIsCancelling(true);
    file.cancelUploadFn();
  };

  return (
    <Table.Row key={file.name}>
      <Table.Cell data-label={i18next.t("Default preview")} width={2}>
        <Radio
          checked={isDefaultPreview}
          onChange={() => setDefaultPreview(isDefaultPreview ? "" : file.name)}
        />
      </Table.Cell>
      <Table.Cell data-label={i18next.t("Filename")} width={8}>
        <div>
          {fileError && (
            <>
              <FeedbackLabel
                fieldPath={"files.entries." + file.name}
                pointing="below"
              />
              <br />
            </>
          )}
          {file.uploadState.isPending ? (
            <div className="mr-5 text-break">{file.name}</div>
          ) : (
            <a
              href={_get(file, "links.content", "")}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-5 text-break"
            >
              {file.name}
            </a>
          )}
          <br />
          {(file.checksum && (
            <div className="ui text-muted">
              <span style={{ fontSize: "10px" }}>{file.checksum}</span>{" "}
              <Popup
                content={i18next.t(
                  "This is the file fingerprint (MD5 checksum), which can be used to verify the file integrity."
                )}
                trigger={<Icon fitted name="help circle" size="small" />}
                position="top center"
              />
            </div>
          )) || (
            <div className="ui text-muted">
              <span style={{ fontSize: "10px" }}>
                {i18next.t("Checksum not yet calculated.")}
              </span>{" "}
            </div>
          )}
        </div>
      </Table.Cell>
      <Table.Cell data-label={i18next.t("Size")} width={2}>
        {file.size
          ? humanReadableBytes(file.size, decimalSizeDisplay)
          : i18next.t("N/A")}
      </Table.Cell>
      {!filesLocked && (
        <Table.Cell
          className="file-upload-pending"
          data-label={i18next.t("Progress")}
          width={2}
        >
          {!file.uploadState?.isPending && (
            <Progress
              className="file-upload-progress primary"
              percent={file.progressPercentage}
              error={file.uploadState.isFailed}
              size="medium"
              progress
              autoSuccess
              active
            />
          )}
          {file.uploadState?.isPending && <span>{i18next.t("Pending")}</span>}
        </Table.Cell>
      )}
      {!filesLocked && replaceEnabled && (
        <Table.Cell textAlign="center" width={1}>
          <ReplaceFileCell
            file={file}
            onReplace={onReplace}
            isReplacing={isReplacing}
            isDisabled={isDeleting || isCancelling}
          />
        </Table.Cell>
      )}
      {!filesLocked && (
        <Table.Cell textAlign="right" width={1}>
          {(file.uploadState?.isFinished ||
            file.uploadState?.isFailed ||
            file.uploadState?.isPending) &&
            (isDeleting ? (
              <Icon loading name="spinner" />
            ) : (
              <Icon
                link
                className="action primary"
                name="trash alternate outline"
                disabled={isDeleting || isReplacing}
                onClick={handleDelete}
                aria-label={i18next.t("Delete file")}
                title={i18next.t("Delete file")}
              />
            ))}
          {file.uploadState?.isUploading && (
            <Button
              compact
              type="button"
              negative
              size="tiny"
              disabled={isCancelling}
              onClick={handleCancelUpload}
            >
              {isCancelling ? <Icon loading name="spinner" /> : i18next.t("Cancel")}
            </Button>
          )}
        </Table.Cell>
      )}
    </Table.Row>
  );
};

FileTableRow.propTypes = {
  decimalSizeDisplay: PropTypes.bool,
  defaultPreview: PropTypes.string,
  deleteFile: PropTypes.func.isRequired,
  file: PropTypes.object.isRequired,
  fileError: PropTypes.object,
  filesLocked: PropTypes.bool,
  onReplace: PropTypes.func.isRequired,
  replaceEnabled: PropTypes.bool,
  replacingFileName: PropTypes.string,
  setDefaultPreview: PropTypes.func.isRequired,
};

FileTableRow.defaultProps = {
  decimalSizeDisplay: false,
  defaultPreview: undefined,
  fileError: undefined,
  filesLocked: false,
  replaceEnabled: false,
  replacingFileName: undefined,
};

const ReplaceAwareFilesListTable = ({
  decimalSizeDisplay,
  deleteFile,
  filesList,
  filesLocked,
  onReplace,
  replaceEnabled,
  replacingFileName,
}) => {
  const { errors, setFieldValue, values: formikDraft } = useFormikContext();
  const defaultPreview = _get(formikDraft, "files.default_preview", "");

  return (
    <Table>
      <FileTableHeader filesLocked={filesLocked} replaceEnabled={replaceEnabled} />
      <Table.Body>
        {filesList.map((file) => (
          <FileTableRow
            key={file.name}
            decimalSizeDisplay={decimalSizeDisplay}
            defaultPreview={defaultPreview}
            deleteFile={deleteFile}
            file={file}
            fileError={getIn(errors, "files.entries." + file.name, undefined)}
            filesLocked={filesLocked}
            onReplace={onReplace}
            replaceEnabled={replaceEnabled}
            replacingFileName={replacingFileName}
            setDefaultPreview={(filename) =>
              setFieldValue("files.default_preview", filename)
            }
          />
        ))}
      </Table.Body>
    </Table>
  );
};

ReplaceAwareFilesListTable.propTypes = {
  decimalSizeDisplay: PropTypes.bool,
  deleteFile: PropTypes.func.isRequired,
  filesList: PropTypes.array,
  filesLocked: PropTypes.bool,
  onReplace: PropTypes.func.isRequired,
  replaceEnabled: PropTypes.bool,
  replacingFileName: PropTypes.string,
};

ReplaceAwareFilesListTable.defaultProps = {
  decimalSizeDisplay: false,
  filesList: [],
  filesLocked: false,
  replaceEnabled: false,
  replacingFileName: undefined,
};

const FileUploadBox = ({
  filesList,
  filesLocked,
  dragText,
  hasError,
  openFileDialog,
  uploadButtonIcon,
  uploadButtonText,
}) =>
  !filesLocked && (
    <Segment
      basic
      padded="very"
      className={filesList.length ? "file-upload-area" : "file-upload-area no-files"}
    >
      <Grid columns={3} textAlign="center">
        <Grid.Row verticalAlign="middle">
          <Grid.Column mobile={16} tablet={7} computer={7}>
            <Header size="small">{dragText}</Header>
          </Grid.Column>

          <Grid.Column className="mt-10 mb-10" mobile={16} tablet={2} computer={2}>
            - {i18next.t("or")} -
          </Grid.Column>

          <Grid.Column mobile={16} tablet={7} computer={7}>
            <Button
              type="button"
              className={hasError ? "error" : "primary"}
              labelPosition="left"
              icon={uploadButtonIcon}
              content={uploadButtonText}
              onClick={() => openFileDialog()}
              disabled={openFileDialog === null}
            />
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Segment>
  );

FileUploadBox.propTypes = {
  filesList: PropTypes.array,
  filesLocked: PropTypes.bool.isRequired,
  dragText: PropTypes.string,
  hasError: PropTypes.bool,
  openFileDialog: PropTypes.func,
  uploadButtonIcon: PropTypes.node,
  uploadButtonText: PropTypes.string,
};

FileUploadBox.defaultProps = {
  filesList: [],
  dragText: undefined,
  hasError: false,
  openFileDialog: null,
  uploadButtonIcon: undefined,
  uploadButtonText: undefined,
};

const FilenamePreservingUploadAreaComponent = ({
  decimalSizeDisplay,
  deleteFile,
  draft,
  dropzoneParams,
  filesEnabled,
  filesList,
  filesLocked,
  hasError,
  uploadFiles,
  uploadButtonIcon,
  uploadButtonText,
}) => {
  const [replaceError, setReplaceError] = useState("");
  const [replacingFileName, setReplacingFileName] = useState();

  const replaceEnabled = filesList.length > 0;

  const handleReplace = async (existingFile, selectedFile) => {
    setReplaceError("");

    const existingExtension = getExtension(existingFile.name);
    const selectedExtension = getExtension(selectedFile.name);

    if (existingExtension !== selectedExtension) {
      setReplaceError(
        i18next.t(
          "Replacement files must keep the same file extension. Expected {{expected}}, got {{received}}.",
          {
            expected: existingExtension || i18next.t("no extension"),
            received: selectedExtension || i18next.t("no extension"),
          }
        )
      );
      return;
    }

    setReplacingFileName(existingFile.name);

    const renamedFile = new File([selectedFile], existingFile.name, {
      type: selectedFile.type,
      lastModified: selectedFile.lastModified,
    });

    try {
      await deleteFile(existingFile);
      await uploadFiles(draft, [renamedFile]);
    } catch (error) {
      console.error(error);
      setReplaceError(
        error?.message ||
          i18next.t(
            "The replacement upload failed after removing the previous file. Please try uploading the replacement again."
          )
      );
    } finally {
      setReplacingFileName(undefined);
    }
  };

  if (!filesEnabled) {
    return (
      <Grid.Row className="pt-0 pb-0">
        <Grid.Column width={16}>
          <Segment basic padded="very" className="file-upload-area no-files">
            <Grid textAlign="center">
              <Grid.Row verticalAlign="middle">
                <Grid.Column>
                  <Header size="medium">
                    {i18next.t("This is a Metadata-only record.")}
                  </Header>
                </Grid.Column>
              </Grid.Row>
            </Grid>
          </Segment>
        </Grid.Column>
      </Grid.Row>
    );
  }

  return (
    <Dropzone {...dropzoneParams} disabled={filesLocked}>
      {({ getRootProps, getInputProps, open: openFileDialog }) => (
        <Grid.Row className="pt-0 pb-0">
          <Grid.Column width={16}>
            <span {...getRootProps()}>
              <input {...getInputProps()} />
              {replaceError && (
                <Message negative>
                  <p className="mb-0">{replaceError}</p>
                </Message>
              )}
              {filesList.length !== 0 && (
                <Grid.Column verticalAlign="middle">
                  <ReplaceAwareFilesListTable
                    decimalSizeDisplay={decimalSizeDisplay}
                    deleteFile={deleteFile}
                    filesList={filesList}
                    filesLocked={filesLocked}
                    onReplace={handleReplace}
                    replaceEnabled={replaceEnabled}
                    replacingFileName={replacingFileName}
                  />
                </Grid.Column>
              )}
              <FileUploadBox
                filesList={filesList}
                filesLocked={filesLocked}
                dragText={i18next.t("Drag and drop files")}
                hasError={hasError}
                openFileDialog={openFileDialog}
                uploadButtonIcon={uploadButtonIcon}
                uploadButtonText={uploadButtonText}
              />
            </span>
          </Grid.Column>
        </Grid.Row>
      )}
    </Dropzone>
  );
};

FilenamePreservingUploadAreaComponent.propTypes = {
  decimalSizeDisplay: PropTypes.bool,
  deleteFile: PropTypes.func.isRequired,
  draft: PropTypes.object,
  dropzoneParams: PropTypes.object.isRequired,
  filesEnabled: PropTypes.bool.isRequired,
  filesList: PropTypes.array,
  filesLocked: PropTypes.bool,
  hasError: PropTypes.bool,
  uploadFiles: PropTypes.func.isRequired,
  uploadButtonIcon: PropTypes.node,
  uploadButtonText: PropTypes.string,
};

FilenamePreservingUploadAreaComponent.defaultProps = {
  decimalSizeDisplay: false,
  draft: undefined,
  filesList: [],
  filesLocked: false,
  hasError: false,
  uploadButtonIcon: undefined,
  uploadButtonText: undefined,
};

const mapStateToProps = (state) => ({
  draft: state.deposit.record,
});

const mapDispatchToProps = (dispatch) => ({
  uploadFiles: (draft, files) => dispatch(uploadFiles(draft, files)),
});

export const FilenamePreservingUploadArea = connect(
  mapStateToProps,
  mapDispatchToProps
)(FilenamePreservingUploadAreaComponent);
