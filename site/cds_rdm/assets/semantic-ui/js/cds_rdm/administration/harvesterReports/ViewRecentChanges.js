// This file is part of CDS-RDM
// Copyright (C) 2026 CERN.
//
// CDS-RDM is free software; you can redistribute it and/or modify it
// under the terms of the GPL-2.0 License; see LICENSE file for more details.

import React, { Component } from "react";
import PropTypes from "prop-types";
import _isEmpty from "lodash/isEmpty";
import { RecordModerationApi } from "@js/invenio_app_rdm/administration/records/api";
import { withCancel } from "react-invenio-forms";
import { Modal, Button, Grid, Message, Icon } from "semantic-ui-react";
import { i18next } from "@translations/invenio_app_rdm/i18next";
import { RevisionsDiffViewer } from "@js/invenio_app_rdm/administration/components/RevisionsDiffViewer";

const getRevisionErrorMessage = (error) => {
  if (error?.response?.status === 403) {
    return {
      header: i18next.t("Access denied"),
      content: i18next.t(
        "You do not have permission to view revisions for this record. Revision access follows record-level permissions."
      ),
      icon: "lock",
    };
  }

  return {
    header: i18next.t("Unable to fetch revisions."),
    content:
      error?.response?.data?.message ||
      error?.message ||
      i18next.t("An unexpected error occurred while fetching revisions."),
    icon: "exclamation circle",
  };
};

export class HarvesterViewRecentChanges extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: true,
      error: undefined,
      diff: undefined,
    };
  }

  componentDidMount() {
    this.setDiff();
  }

  componentWillUnmount() {
    this.cancellableAction && this.cancellableAction.cancel();
  }

  setDiff() {
    const { resource } = this.props;
    const {
      metadata: { before, after },
    } = resource;

    const diff = {
      targetRevision: after || {},
      srcRevision: before || {},
    };

    const isDiffEmpty = _isEmpty(diff.targetRevision) && _isEmpty(diff.srcRevision);
    if (isDiffEmpty) {
      this.fetchPreviousRevision();
    } else {
      this.setState({ diff, loading: false });
    }
  }

  async fetchPreviousRevision() {
    const { resource } = this.props;
    const {
      resource: record,
      metadata: { revision_id: targetRevision } = { revision_id: null },
    } = resource;

    this.setState({ loading: true });

    try {
      if (!targetRevision) {
        this.setState({
          error: {
            header: i18next.t("Unable to fetch revisions."),
            content: i18next.t("No revision ID found."),
            icon: "exclamation circle",
          },
          loading: false,
        });
        return;
      }

      this.cancellableAction = withCancel(
        RecordModerationApi.getLastRevision(record, targetRevision, true)
      );
      const response = await this.cancellableAction.promise;
      const revisions = await response.data;

      this.setState({
        diff: {
          targetRevision: revisions[0],
          srcRevision: revisions.length > 1 ? revisions[1] : {},
        },
        loading: false,
      });
    } catch (error) {
      if (error === "UNMOUNTED") return;
      this.setState({ error: getRevisionErrorMessage(error), loading: false });
      console.error(error);
    }
  }

  handleModalClose = () => {
    const { actionCancelCallback } = this.props;
    actionCancelCallback();
  };

  render() {
    const { error, loading, diff } = this.state;

    return (
      <>
        {error && (
          <Modal.Content>
            <Message negative icon className="text-align-left">
              <Icon name={error.icon} />
              <Message.Content>
                <Message.Header>{error.header}</Message.Header>
                {error.content}
              </Message.Content>
            </Message>
          </Modal.Content>
        )}
        {!error && (
          <Modal.Content scrolling>
            <RevisionsDiffViewer diff={diff} />
          </Modal.Content>
        )}
        <Modal.Actions>
          <Grid>
            <Grid.Column floated="left" width={8} textAlign="left">
              <Button
                onClick={this.handleModalClose}
                disabled={loading}
                loading={loading}
                aria-label={i18next.t("Cancel revision comparison")}
              >
                Close
              </Button>
            </Grid.Column>
          </Grid>
        </Modal.Actions>
      </>
    );
  }
}

HarvesterViewRecentChanges.propTypes = {
  resource: PropTypes.object.isRequired,
  actionCancelCallback: PropTypes.func.isRequired,
};
