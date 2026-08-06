(function installTsbCustomOrderBackup() {
  "use strict";

  if (window.__tsbCustomOrderBackupInstalled) return;
  window.__tsbCustomOrderBackupInstalled = true;

  var API_ORIGIN = "https://admin-teamsportbanners.vercel.app";
  var MAX_FILE_SIZE = 25 * 1024 * 1024;
  var PROPERTY_NAME = /^properties\[([^\]]+)\]$/;
  var CUSTOM_FIELD = /(?:team|player|coach|manager|mom|dad|sponsor|logo|photo|design|banner|sport|year|custom)/i;

  function propertyKey(name) {
    var match = String(name || "").match(PROPERTY_NAME);
    return match ? match[1].trim() : "";
  }

  function formSnapshot(form) {
    var data = new FormData(form);
    var fields = [];
    var files = [];
    data.forEach(function (value, name) {
      var key = propertyKey(name);
      if (!key || /^_TSB (?:Submission|Backup)/i.test(key)) return;
      if (value instanceof File) {
        if (!value.size) return;
        files.push({ fieldKey: key, file: value });
        fields.push({ key: key, value: value.name || "Uploaded file" });
        return;
      }
      var clean = String(value || "").trim();
      if (clean) fields.push({ key: key, value: clean });
    });
    return { fields: fields, files: files };
  }

  function isCustomOrderForm(form, snapshot) {
    if (!(form instanceof HTMLFormElement) || !/\/cart\/add/i.test(String(form.action || ""))) return false;
    return snapshot.fields.some(function (field) { return CUSTOM_FIELD.test(field.key); });
  }

  function productDetails(form) {
    var pathname = window.location.pathname;
    var productMatch = pathname.match(/\/products\/([^/?#]+)/i);
    var titleNode = document.querySelector("main h1, [data-product-title], .product__title h1, h1");
    var variantInput = form.querySelector('[name="id"]');
    var quantityInput = form.querySelector('[name="quantity"]');
    return {
      pageUrl: window.location.href,
      productTitle: String(
        form.getAttribute("data-product-title")
          || (titleNode && titleNode.textContent)
          || document.title.replace(/\s*[|\-].*$/, "")
          || "Custom banner"
      ).trim(),
      productHandle: productMatch ? decodeURIComponent(productMatch[1]) : "",
      productId: String(form.getAttribute("data-product-id") || "").trim(),
      variantId: variantInput ? String(variantInput.value || "").trim() : "",
      quantity: quantityInput ? Math.max(1, Number(quantityInput.value) || 1) : 1
    };
  }

  function statusNode(form) {
    var existing = form.querySelector("[data-tsb-backup-status]");
    if (existing) return existing;
    var node = document.createElement("div");
    node.setAttribute("data-tsb-backup-status", "");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.style.cssText = "display:none;margin:10px 0;padding:10px 12px;border:1px solid #1d4ed8;background:#eff6ff;color:#172554;font:600 14px/1.35 Arial,sans-serif;";
    var submit = form.querySelector('[type="submit"], button[name="add"]');
    if (submit && submit.parentNode) submit.parentNode.insertBefore(node, submit);
    else form.appendChild(node);
    return node;
  }

  function setStatus(form, message, error) {
    var node = statusNode(form);
    node.textContent = message;
    node.style.display = message ? "block" : "none";
    node.style.borderColor = error ? "#b91c1c" : "#1d4ed8";
    node.style.background = error ? "#fef2f2" : "#eff6ff";
    node.style.color = error ? "#7f1d1d" : "#172554";
    node.setAttribute("role", error ? "alert" : "status");
  }

  function setSubmitBusy(form, busy) {
    var buttons = form.querySelectorAll('[type="submit"], button[name="add"]');
    buttons.forEach(function (button) {
      if (busy) {
        button.setAttribute("data-tsb-was-disabled", button.disabled ? "1" : "0");
        button.disabled = true;
      } else if (button.getAttribute("data-tsb-was-disabled") !== "1") {
        button.disabled = false;
        button.removeAttribute("data-tsb-was-disabled");
      }
    });
  }

  function hiddenProperty(form, key, value) {
    var name = "properties[" + key + "]";
    var input = Array.prototype.find.call(form.elements, function (control) { return control.name === name; });
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }

  async function jsonRequest(url, body) {
    var response = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "Custom-order backup request failed.");
    return result;
  }

  function safeFileName(value) {
    return String(value || "upload")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "upload";
  }

  async function uploadOriginal(submission, entry, index) {
    var file = entry.file;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(file.name + " is larger than the 25 MB upload limit.");
    }
    var pathname = "team-banner-custom-orders/" + submission.submissionId + "/files/"
      + Date.now() + "-" + index + "-" + safeFileName(file.name);
    var clientPayload = JSON.stringify({
      submissionId: submission.submissionId,
      submissionToken: submission.submissionToken,
      fieldKey: entry.fieldKey,
      fileName: file.name,
      contentType: file.type,
      size: file.size
    });
    var tokenResult = await jsonRequest(API_ORIGIN + "/api/custom-order-backups/upload", {
      type: "blob.generate-client-token",
      payload: { pathname: pathname, clientPayload: clientPayload, multipart: false }
    });
    var clientToken = String(tokenResult.clientToken || "");
    var tokenParts = clientToken.split("_");
    var storeId = tokenParts[3] || "";
    if (!clientToken || !storeId) throw new Error("The secure file upload token was not created.");

    var blobResponse = await fetch("https://vercel.com/api/blob/?pathname=" + encodeURIComponent(pathname), {
      method: "PUT",
      mode: "cors",
      credentials: "omit",
      headers: {
        Authorization: "Bearer " + clientToken,
        "x-api-blob-request-id": storeId + ":" + Date.now() + ":" + Math.random().toString(16).slice(2),
        "x-vercel-blob-store-id": storeId,
        "x-api-blob-request-attempt": "0",
        "x-api-version": "12",
        "x-vercel-blob-access": "public",
        "x-content-type": file.type || "application/octet-stream"
      },
      body: file
    });
    var blob = await blobResponse.json().catch(function () { return {}; });
    if (!blobResponse.ok || !blob.url || !blob.pathname) {
      throw new Error(blob.message || blob.error || ("Unable to back up " + file.name + "."));
    }
    return {
      fieldKey: entry.fieldKey,
      name: file.name,
      pathname: blob.pathname,
      url: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
      contentType: file.type || blob.contentType || "",
      size: file.size
    };
  }

  async function backUpForm(form, snapshot) {
    var details = productDetails(form);
    var submission = await jsonRequest(API_ORIGIN + "/api/custom-order-backups", {
      action: "reserve",
      fields: snapshot.fields,
      pageUrl: details.pageUrl,
      productTitle: details.productTitle,
      productHandle: details.productHandle,
      productId: details.productId,
      variantId: details.variantId,
      quantity: details.quantity
    });
    var files = [];
    for (var index = 0; index < snapshot.files.length; index += 1) {
      setStatus(form, "Saving uploaded file " + (index + 1) + " of " + snapshot.files.length + "...", false);
      files.push(await uploadOriginal(submission, snapshot.files[index], index));
    }
    var finalized = await jsonRequest(API_ORIGIN + "/api/custom-order-backups", {
      action: "finalize",
      submissionId: submission.submissionId,
      submissionToken: submission.submissionToken,
      fields: snapshot.fields,
      files: files
    });
    if (finalized.status !== "ready") throw new Error("The custom-order backup did not finish.");

    hiddenProperty(form, "_TSB Submission ID", submission.submissionId);
    hiddenProperty(form, "_TSB Backup Status", "Stored before checkout");
    files.forEach(function (file, index) {
      hiddenProperty(form, "_TSB Backup File " + (index + 1), file.downloadUrl || file.url);
    });
    return finalized;
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute("data-tsb-backup-complete") === "1") return;
    var snapshot = formSnapshot(form);
    if (!isCustomOrderForm(form, snapshot)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    var submitter = event.submitter;
    setSubmitBusy(form, true);
    setStatus(form, "Saving custom order details before adding to cart...", false);

    backUpForm(form, snapshot).then(function (result) {
      form.setAttribute("data-tsb-backup-complete", "1");
      setSubmitBusy(form, false);
      setStatus(form, result.emailSent
        ? "Order details saved and sent to fulfillment."
        : "Order details saved. Fulfillment email will be retried from Admin.", false);
      window.setTimeout(function () {
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitter || undefined);
        else HTMLFormElement.prototype.submit.call(form);
      }, 50);
    }).catch(function (error) {
      form.removeAttribute("data-tsb-backup-complete");
      setSubmitBusy(form, false);
      setStatus(form, (error && error.message) || "Order details could not be safely saved. Please retry.", true);
    });
  }, true);
})();

