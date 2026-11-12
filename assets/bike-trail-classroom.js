"use strict";

const BikeTrailClassroom = (() => {
  const agreementLevels = [
    "Wholehearted endorsement", "Agreement with a minor point of contention", "Support with reservations",
    "Abstain", "More discussion needed", "Don’t like but will support", "Serious disagreement", "Veto"
  ];
  const ARCHIVE_KEY = "bike-trail-saved-debriefs-v1";
  const DISPLAY_KEY = "bike-trail-class-display-v1";
  const chartSignatures = new WeakMap();
  let archiveSignature = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function dots(count) {
    return count + (count === 1 ? " dot" : " dots");
  }

  function progress(count, expected, noun, action = "submitted") {
    if (expected && count <= expected) return count + " of " + expected + " " + noun + (expected === 1 ? " " : "s ") + action;
    const message = count + " " + noun + (count === 1 ? " " : "s ") + action;
    return expected ? message + " · " + expected + " expected" : message;
  }

  function agreementChart(id = "agreement-chart-title") {
    const figure = node("figure", "live-agreement");
    figure.dataset.liveAgreement = "";
    figure.setAttribute("aria-labelledby", id);
    const caption = node("figcaption", "live-agreement-caption");
    const title = node("h4", "", "Gradients of Agreement");
    title.id = id;
    title.tabIndex = -1;
    const total = node("span", "small");
    total.dataset.agreementTotal = "";
    total.setAttribute("aria-live", "polite");
    caption.append(title, total);

    const plot = node("div", "live-agreement-plot");
    plot.setAttribute("aria-hidden", "true");
    const axis = node("div", "live-agreement-axis");
    for (let tick = 0; tick < 3; tick++) axis.append(node("span", ""));
    const bars = node("ol", "live-agreement-bars");
    const key = node("ol", "live-agreement-key");
    agreementLevels.forEach((label, index) => {
      const level = index + 1;
      const column = node("li", "live-agreement-column");
      const track = node("div", "live-agreement-track");
      track.dataset.agreementLevel = level;
      track.append(node("span", "live-agreement-bar"), node("b", "live-agreement-count"));
      column.append(track, node("span", "live-agreement-number", level));
      bars.append(column);
      const item = node("li", "");
      const count = node("span", "visually-hidden");
      count.dataset.agreementCount = "";
      item.append(node("b", "", level), node("span", "", label), count);
      key.append(item);
    });
    plot.append(axis, bars);
    figure.append(caption, plot, key);
    return figure;
  }

  function paintAgreementChart(figure, counts, expected = null) {
    const signature = [expected, ...counts].join(",");
    if (chartSignatures.get(figure) === signature) return;
    chartSignatures.set(figure, signature);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const ceiling = Math.max(4, Math.ceil(Math.max(...counts) / 4) * 4);
    const summary = figure.querySelector("[data-agreement-total]");
    const message = progress(total, expected, "rating");
    if (summary.textContent !== message) summary.textContent = message;
    figure.querySelectorAll(".live-agreement-axis span").forEach((tick, index) => {
      tick.textContent = ceiling * (1 - index / 2);
    });
    const accessibleCounts = figure.querySelectorAll("[data-agreement-count]");
    figure.querySelectorAll("[data-agreement-level]").forEach((track, index) => {
      const count = counts[index];
      track.style.setProperty("--agreement-height", (100 * count / ceiling) + "%");
      track.querySelector(".live-agreement-count").textContent = count;
      accessibleCounts[index].textContent = ", " + count + (count === 1 ? " rating" : " ratings");
    });
  }

  function studentURL(code) {
    const url = new URL("word-cloud-respond.html", location.href);
    url.searchParams.set("code", code);
    return url;
  }

  function appendQR(parent, url, size) {
    if (typeof window.QRCode !== "function") return;
    const qr = node("div", "live-qr");
    qr.setAttribute("role", "img");
    qr.setAttribute("aria-label", "QR code for this student session");
    try {
      new window.QRCode(qr, { text: url.href, width: size, height: size });
      qr.removeAttribute("title");
      parent.append(qr);
    } catch {}
  }

  function savedDebriefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(item => item && /^[a-f0-9-]{36}$/i.test(item.id) && Array.isArray(item.proposals)) : [];
    } catch { return []; }
  }

  function archivedDebrief(id) { return savedDebriefs().find(record => record.id === id); }

  function saveDebrief(record) {
    const records = savedDebriefs().filter(item => item.id !== record.id);
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify([record, ...records]));
      renderArchive();
      return true;
    } catch { return false; }
  }

  function downloadDebrief(record) {
    const lines = ["Bike Trail Dot Voting — Debrief", new Date(record.savedAt).toLocaleString(), ""];
    if (record.problem) lines.push("Group problem", record.problem, "");
    lines.push(progress(record.ballots, record.expected, "ballot"), dots(record.dotBudget) + " per student", "", "Ranked tally");
    record.proposals.forEach(item => lines.push("Proposal " + item.number + " | " + dots(item.dots) + " | " + item.label));
    if (record.selectedProposal) lines.push("", "Proposal for discussion", record.selectedProposal);
    if (record.agreementStarted) {
      lines.push("", "Gradients of Agreement");
      agreementLevels.forEach((label, index) => lines.push((index + 1) + " — " + label + " | " + record.agreementCounts[index]));
    }
    if (record.concern) lines.push("", "Concern for Shifting the Burden", record.concern);
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }));
    const link = node("a", "");
    link.href = url;
    link.download = "Bike_Trail_Debrief.txt";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function proposalRow(item) {
    const row = node("li", "result-row");
    const top = node("div", "result-top");
    top.append(node("span", "proposal-number", item.number), node("span", "proposal-text", item.label));
    if (Number.isInteger(item.dots)) top.append(node("span", "result-count", dots(item.dots)));
    row.append(top);
    return row;
  }

  function renderArchive() {
    const archive = document.getElementById("saved-debriefs");
    if (!archive) return;
    const records = savedDebriefs();
    const signature = JSON.stringify(records);
    if (signature === archiveSignature) return;
    archiveSignature = signature;
    archive.hidden = records.length === 0;
    archive.replaceChildren(node("h2", "", "Saved debriefs"));
    for (const record of records) {
      const entry = node("details", "saved-debrief");
      entry.append(node("summary", "", (record.selectedProposal || record.problem || "Bike Trail vote") +
        " · " + new Date(record.savedAt).toLocaleDateString()));
      if (record.problem) entry.append(node("p", "problem", record.problem));
      entry.append(node("p", "small", progress(record.ballots, record.expected, "ballot") + " · " + dots(record.dotBudget) + " per student"));
      const list = node("ol", "results-list");
      list.setAttribute("aria-label", "Ranked proposals");
      list.append(...record.proposals.map(proposalRow));
      entry.append(list);
      if (record.agreementStarted && Array.isArray(record.agreementCounts) && record.agreementCounts.length === agreementLevels.length) {
        const chart = agreementChart("archived-agreement-" + record.id);
        paintAgreementChart(chart, record.agreementCounts);
        entry.append(chart);
      }
      if (record.concern) {
        const concern = node("div", "result-pick");
        concern.append(node("h3", "", "Concern for Shifting the Burden"), node("p", "leading-text", record.concern));
        entry.append(concern);
      }
      const download = node("button", "secondary", "Download debrief");
      download.type = "button";
      download.addEventListener("click", () => downloadDebrief(record));
      const actions = node("div", "actions");
      actions.append(download);
      entry.append(actions);
      archive.append(entry);
    }
  }

  function publishDisplay(id, view) {
    try {
      const saved = JSON.stringify({ id, ...view });
      if (localStorage.getItem(DISPLAY_KEY) !== saved) localStorage.setItem(DISPLAY_KEY, saved);
    } catch {}
  }

  function openDisplay(id) {
    document.body.classList.add("class-display-page");
    const main = document.querySelector("main");
    main.replaceChildren(document.getElementById("class-display-view").content.cloneNode(true));
    const stage = main.querySelector("#class-display-stage");
    const title = main.querySelector("#class-display-title");
    const instructions = main.querySelector("#class-display-instructions");
    const join = main.querySelector("#class-display-join");
    const status = main.querySelector("#class-display-progress");
    const proposals = main.querySelector("#class-display-proposals");
    const results = main.querySelector("#class-display-agreement");
    let lastCode = null, lastProposals = "";

    function paint() {
      let view = null;
      try { view = JSON.parse(localStorage.getItem(DISPLAY_KEY)); } catch {}
      if (view?.id !== id) view = null;
      stage.textContent = view?.stage || "Bike Trail Dot Voting";
      title.textContent = view?.title || "Waiting for the instructor";
      instructions.textContent = view?.instructions || "Open this display from your current Bike Trail session.";
      status.hidden = !view?.progress;
      if (status.textContent !== (view?.progress || "")) status.textContent = view?.progress || "";
      const code = view?.code || "";
      if (lastCode !== code) {
        lastCode = code;
        join.replaceChildren();
        if (/^\d{7}$/.test(code)) {
          const card = node("div", "live-join");
          const details = node("div", "live-join-details");
          details.append(node("p", "small", "Student session code"), node("strong", "live-code", code.slice(0, 3) + " " + code.slice(3)));
          card.append(details);
          appendQR(card, studentURL(code), 160);
          join.append(card);
        }
      }
      const displayed = view?.proposals || [];
      const signature = JSON.stringify(displayed);
      if (signature !== lastProposals) {
        lastProposals = signature;
        proposals.hidden = !displayed.length;
        proposals.replaceChildren(...displayed.map(proposalRow));
      }
      if (view?.agreementCounts) {
        let chart = results.querySelector("[data-live-agreement]");
        if (!chart) { chart = agreementChart("display-agreement-title"); results.append(chart); }
        paintAgreementChart(chart, view.agreementCounts);
      } else {
        results.replaceChildren();
      }
    }
    window.addEventListener("storage", event => { if (event.key === DISPLAY_KEY) paint(); });
    window.addEventListener("focus", paint);
    paint();
  }

  return { agreementLevels, dots, progress, agreementChart, paintAgreementChart, studentURL, appendQR,
    saveDebrief, archivedDebrief, downloadDebrief, renderArchive, publishDisplay, openDisplay };
})();
