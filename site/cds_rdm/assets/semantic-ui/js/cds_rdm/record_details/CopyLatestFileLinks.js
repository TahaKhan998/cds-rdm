/*
 * Copyright (C) 2026 CERN.
 *
 * CDS-RDM is free software; you can redistribute it and/or modify it
 * under the terms of the GPL-2.0 License; see LICENSE file for more details.
 */

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("input");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
};

const flashCopyButton = (button) => {
  const icon = button.querySelector("i.icon");
  if (!icon) {
    return;
  }

  const previousClassName = icon.className;
  icon.className = "check icon";
  window.setTimeout(() => {
    icon.className = previousClassName;
  }, 1500);
};

const createCopyButton = (url, title) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui compact mini icon button";
  button.title = title;
  button.setAttribute("aria-label", title);

  const icon = document.createElement("i");
  icon.className = "linkify icon";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);

  button.addEventListener("click", async () => {
    try {
      await copyText(url);
      flashCopyButton(button);
    } catch (error) {
      console.error(`Could not copy link for ${title}`, error);
    }
  });

  return button;
};

const createSplitAction = (actionElement, url, copyTitle) => {
  if (!actionElement || actionElement.parentElement?.classList.contains("cds-split-action")) {
    return null;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "cds-split-action";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "stretch";
  wrapper.style.margin = "0";

  if (actionElement.classList.contains("right") && actionElement.classList.contains("floated")) {
    wrapper.classList.add("right", "floated");
    actionElement.classList.remove("right", "floated");
  }

  actionElement.style.margin = "0";
  actionElement.style.borderTopRightRadius = "0";
  actionElement.style.borderBottomRightRadius = "0";

  const copyButton = createCopyButton(url, copyTitle);
  copyButton.className = "ui compact mini icon button";
  copyButton.style.margin = "0";
  copyButton.style.borderTopLeftRadius = "0";
  copyButton.style.borderBottomLeftRadius = "0";
  copyButton.style.borderLeft = "1px solid rgba(34, 36, 38, 0.15)";

  actionElement.replaceWith(wrapper);
  wrapper.appendChild(actionElement);
  wrapper.appendChild(copyButton);

  return wrapper;
};

const createLatestLinkModal = () => {
  const existingModal = document.getElementById("cds-latest-link-modal");
  if (existingModal) {
    return existingModal;
  }

  const modal = document.createElement("div");
  modal.id = "cds-latest-link-modal";
  modal.className = "ui tiny modal transition";
  modal.innerHTML = `
    <div class="header">Before you copy this link</div>
    <div class="content">
      <p>This link works if this file exists in the latest record version.</p>
    </div>
    <div class="actions">
      <button type="button" class="ui button" data-action="cancel">Cancel</button>
      <button type="button" class="ui primary button" data-action="confirm">
        <i class="linkify icon" aria-hidden="true"></i>
        Copy link
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
};

const openLatestLinkModal = (latestFileUrl, triggerButton) => {
  const modal = createLatestLinkModal();
  const $ = window.jQuery || window.$;
  if (!triggerButton.id) {
    triggerButton.id = `cds-latest-link-trigger-${Math.random().toString(36).slice(2)}`;
  }

  modal.dataset.latestFileUrl = latestFileUrl;
  modal.dataset.triggerId = triggerButton.id;

  const closeModal = () => {
    if ($?.fn?.modal) {
      $(modal).modal("hide");
    }
  };

  modal.querySelector('[data-action="cancel"]').onclick = closeModal;
  modal.querySelector('[data-action="confirm"]').onclick = async () => {
    const latestUrl = modal.dataset.latestFileUrl;
    const triggerId = modal.dataset.triggerId;
    const button = triggerId ? document.getElementById(triggerId) : null;

    try {
      await copyText(latestUrl);
      if (button) {
        flashCopyButton(button);
      }
      closeModal();
    } catch (error) {
      console.error("Could not copy latest link", error);
    }
  };

  if ($?.fn?.modal) {
    $(modal)
      .modal({
        detachable: true,
        closable: true,
        autofocus: false,
        restoreFocus: true,
      })
      .modal("show");
    return;
  }

  if (
    window.confirm(
      "If the newest record version no longer includes this file, the link will open the most recent version that still does.\n\nCopy link?"
    )
  ) {
    copyText(latestFileUrl)
      .then(() => flashCopyButton(triggerButton))
      .catch((error) => console.error("Could not copy latest link", error));
  }
};

const createLatestActionLink = (latestFileUrl) => {
  const actionLink = document.createElement("button");
  actionLink.type = "button";
  actionLink.className = "ui mini basic button";
  actionLink.style.margin = "0";
  actionLink.setAttribute("aria-label", "Copy latest link");
  actionLink.setAttribute(
    "data-tooltip",
    "Copy a link to the latest version of this file."
  );
  actionLink.setAttribute("data-position", "top center");

  const icon = document.createElement("i");
  icon.className = "linkify icon";
  icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = "Latest";

  actionLink.appendChild(icon);
  actionLink.appendChild(label);

  actionLink.addEventListener("click", () => {
    openLatestLinkModal(latestFileUrl, actionLink);
  });

  return actionLink;
};

const getRecordId = () => {
  const match = window.location.pathname.match(/^\/records\/([^/]+)/);
  return match?.[1];
};

const buildLatestFileUrl = (recordId, downloadUrl) => {
  const filePathMatch = downloadUrl.pathname.match(/\/files\/(.+)$/);
  if (!filePathMatch) {
    return null;
  }

  const encodedFilename = filePathMatch[1];
  return `${window.location.origin}/records/${recordId}/latest/files/${encodedFilename}`;
};

const decorateActionCell = (actionsCell) => {
  const actionLinks = Array.from(
    actionsCell.querySelectorAll('a.ui.compact.mini.button[href]')
  );

  actionLinks.forEach((actionLink) => {
    const label = actionLink.textContent?.trim();
    if (!label || !["Preview", "Download"].includes(label)) {
      return;
    }

    createSplitAction(actionLink, actionLink.href, `Copy ${label.toLowerCase()} link`);
  });
};

const decorateDownloadAllButton = () => {
  const downloadAllLink = document.querySelector(
    '#record-files a.ui.compact.mini.button.archive-link[href]'
  );

  if (!downloadAllLink) {
    return;
  }

  const label = downloadAllLink.textContent?.trim();
  if (label !== "Download all") {
    return;
  }

  const splitAction = createSplitAction(
    downloadAllLink,
    downloadAllLink.href,
    "Copy download all link"
  );

  if (splitAction) {
    splitAction.style.float = "right";
    splitAction.style.display = "inline-flex";
  }
};

const decorateNameCell = (nameCell, latestFileUrl) => {
  const nameRow = nameCell.querySelector("div");
  if (!nameRow) {
    return;
  }

  nameRow.style.display = "flex";
  nameRow.style.alignItems = "center";
  nameRow.style.gap = "0.35rem";
  nameRow.style.flexWrap = "wrap";

  const fileNameLink = nameRow.querySelector("a");
  if (fileNameLink) {
    fileNameLink.style.flex = "";
    fileNameLink.style.maxWidth = "";
    fileNameLink.style.minWidth = "";
    fileNameLink.style.overflowWrap = "";
  }

  const latestAction = createLatestActionLink(latestFileUrl);
  latestAction.classList.add("cds-latest-link-row");
  latestAction.style.flexShrink = "";
  nameRow.appendChild(latestAction);
};

const initCopyLatestFileLinks = () => {
  const recordId = getRecordId();
  if (!recordId) {
    return;
  }

  const rows = document.querySelectorAll("#record-files #file-list-table tbody tr");
  decorateDownloadAllButton();

  rows.forEach((row) => {
    const nameCell = row.querySelector("td");
    const actionsCell = row.querySelector("td.right.aligned");
    const downloadLink = actionsCell?.querySelector(
      'a.ui.compact.mini.button[href*="/files/"][href*="download=1"]'
    );

    if (
      !nameCell ||
      !actionsCell ||
      !downloadLink ||
      row.querySelector(".cds-latest-link-row")
    ) {
      return;
    }

    const latestFileUrl = buildLatestFileUrl(recordId, new URL(downloadLink.href));
    if (!latestFileUrl) {
      return;
    }

    decorateActionCell(actionsCell);
    decorateNameCell(nameCell, latestFileUrl);
  });
};

const scheduleInit = () => {
  initCopyLatestFileLinks();
  window.setTimeout(initCopyLatestFileLinks, 100);
  window.setTimeout(initCopyLatestFileLinks, 500);
  window.setTimeout(initCopyLatestFileLinks, 1500);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleInit, { once: true });
} else {
  scheduleInit();
}

window.addEventListener("load", initCopyLatestFileLinks);

const observer = new MutationObserver(() => {
  initCopyLatestFileLinks();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
