"use strict";

function createBikeTrailLive({ stage, getSession, restoreSession, saveSession, render, showTemplate, showGuide, showProblem, element, button }) {
  const ACTIVE_KEY = "bike-trail-active-session-v2";
  const LEGACY_KEY = "bike-trail-live-room-v1";
  const DEFAULT_DOTS = 2;
  const RPC_URL = "https://vteamreihsunsllwcphw.supabase.co";
  const PUBLIC_KEY = "sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud";
  const prep = [
    { id: "problem", label: "Problem", question: "What problem do you see on the bike trail?" },
    { id: "stakeholders", label: "Who is involved?", question: "Who is involved or affected?" },
    { id: "suggestions", label: "Proposals", question: "What solution would you propose?" }
  ];
  const gradients = BikeTrailClassroom.agreementLevels;
  const responseSignatures = new WeakMap();
  const restored = readActive();
  let room = validRoom(restored?.room) || readLegacyRoom();
  let pendingToken = /^[a-f0-9]{64}$/.test(restored?.pendingToken || "") ? restored.pendingToken : null;
  let snapshot = null;
  let busy = false;
  let polling = false;
  let needsSync = Boolean(room);
  let generation = 0;
  let message = room ? "Checking the live session." : "";
  let debriefNotice = "";

  function readActive() {
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY));
      if (saved) return saved;
    } catch {}
    try { return JSON.parse(sessionStorage.getItem(ACTIVE_KEY)); }
    catch { return null; }
  }

  function validRoom(value) {
    return /^[a-f\d-]{36}$/i.test(value?.id) && /^\d{7}$/.test(value.code) &&
      /^[a-f\d]{64}$/.test(value.token) && Array.isArray(value.deck) &&
      value.deck.some(slide => slide?.id === "ballot") && value.deck.some(slide => slide?.id === value.active) &&
      ["open", "paused"].includes(value.status) ? value : null;
  }

  function readLegacyRoom() {
    try { return validRoom(JSON.parse(sessionStorage.getItem(LEGACY_KEY))); }
    catch { return null; }
  }

  function restore() {
    if (!room && !pendingToken) return;
    if (restored?.session) restoreSession(restored.session);
    getSession().setup.method = "live";
  }

  function saveDraft() {
    if (!room && !pendingToken) return;
    const record = JSON.stringify({ room, pendingToken, session: getSession() });
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY));
      if (saved?.room?.id === room?.id && saved?.room?.revision > room?.revision) return;
      if (saved?.room && room && saved.room.id !== room.id) return;
      localStorage.setItem(ACTIVE_KEY, record);
    } catch {}
    try { sessionStorage.setItem(ACTIVE_KEY, record); } catch {}
  }

  function forgetRoom(id) {
    try {
      if (JSON.parse(localStorage.getItem(ACTIVE_KEY))?.room?.id === id) localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
      sessionStorage.removeItem(LEGACY_KEY);
    } catch {}
  }

  function ready() { return Boolean(room && snapshot && !needsSync); }

  async function rpc(name, args) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(RPC_URL + "/rest/v1/rpc/" + name, {
        method: "POST", headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(args), signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The classroom session could not be updated.");
      return data;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError || error instanceof SyntaxError) {
        const interrupted = new Error("Classroom connection interrupted. Checking the current session.");
        interrupted.network = true;
        throw interrupted;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function written(id, question, info = "", accepting = true) {
    return { id, type: "open", question, info, accepting, openLimit: 1000 };
  }

  function initialDeck() {
    return [
      written("problem", prep[0].question, "Read the Bike Trail Turns into Mean Street handout. Write the problem as you see it."),
      written("stakeholders", prep[1].question, "Identify the people or organizations involved. Whose perspective might be missing?"),
      written("suggestions", prep[2].question, "Suggest one action the group could take and what it would change."),
      { id: "ballot", type: "dotvote", question: "", info: "", choices: [{ id: "proposal-1", label: "" }, { id: "proposal-2", label: "" }],
        dotBudget: DEFAULT_DOTS, accepting: false, dotRevealed: false },
      { id: "agreement", type: "scale", question: "How much do you support the selected proposal?",
        info: "Choose the rating that best represents your support.", accepting: false, scaleMin: 1, scaleMax: 8,
        scaleLabels: gradients, agreementRevealed: false, scaleLow: gradients[0], scaleHigh: gradients.at(-1),
        statements: [{ id: "support", label: "" }] },
      written("reservation", "What’s your reason or reservation?", "", false)
    ];
  }

  function receive(data, token, fromPoll = false) {
    const previous = room;
    const deck = data.deck || previous?.deck;
    if (!Array.isArray(deck)) throw new Error("The current classroom state is unavailable.");
    if (fromPoll && previous?.revision !== data.revision) {
      const saved = readActive();
      if (saved?.room?.id === data.id && saved.session) restoreSession(saved.session);
    }
    snapshot = data;
    needsSync = false;
    room = { id: data.id, code: data.code, token, deck, revision: data.revision,
      status: data.status, active: data.active_slide_id };
    const ballot = ballotSlide();
    if (room.active === "ballot" || ballot.dotRevealed) syncBallot(ballot);
    if (ballot.dotRevealed && getSession().round?.liveId !== room.id) collectTally();
    if (["ended", "expired"].includes(data.status)) {
      const round = getSession().round;
      if (round?.complete) {
        const archive = BikeTrailClassroom.archivedDebrief(room.id);
        round.debrief = archive?.closed ? archive : debriefRecord();
        round.concern = round.debrief.concern;
        const saved = archive?.closed || BikeTrailClassroom.saveDebrief(round.debrief);
        debriefNotice = saved ? "Debrief saved on this device." : "Download the debrief to keep a copy.";
      }
      publishClassView(true);
      const id = room.id;
      room = null;
      forgetRoom(id);
      saveSession();
    } else if (!previous || previous.revision !== room.revision || previous.id !== room.id) {
      saveSession();
    }
  }

  async function control(active, deck = null, status = null) {
    const { id, token, revision } = room;
    let data;
    try {
      data = await rpc("crs_bike_trail_control", {
        p_session_id: id, p_host_token: token, p_expected_revision: revision,
        p_deck: deck, p_active_slide: active, p_status: status
      });
    } catch (error) {
      if (error.network) needsSync = true;
      throw error;
    }
    receive(data, token);
    if (data.conflict) throw new Error("The session changed in another tab. Review the current stage before trying again.");
  }

  function ballotSlide() { return room?.deck.find(slide => slide.id === "ballot"); }
  function agreementSlide() { return room?.deck.find(slide => slide.id === "agreement"); }

  function syncBallot(ballot) {
    const setup = getSession().setup;
    setup.proposals = ballot.choices.map(choice => choice.label);
    setup.problem = typeof ballot.groupProblem === "string" ? ballot.groupProblem :
      ballot.question === "Which proposal should the group discuss first?" ? "" : ballot.question;
    setup.dotBudget = String(ballot.dotBudget ?? DEFAULT_DOTS);
    if (Object.hasOwn(ballot, "expectedVoters")) setup.expectedVoters = String(ballot.expectedVoters ?? "");
  }

  function expectedVoters() {
    const expected = Number(getSession().setup.expectedVoters);
    return Number.isInteger(expected) && expected >= 1 && expected <= 2000 ? expected : null;
  }

  function rows(id, kind) {
    return (snapshot?.responses || []).filter(response => response.slide_id === id && response.kind === kind);
  }

  function voting() {
    return room?.active === "ballot" && !getSession().round;
  }

  function amend(id, changes) {
    return room.deck.map(slide => slide.id === id ? { ...slide, ...changes } : slide);
  }

  function command(label, style, action) {
    const node = button(label, style, action);
    node.dataset.liveCommand = "";
    node.disabled = busy || Boolean(room && !ready());
    return node;
  }

  async function run(action, focus = false) {
    if (busy || (room && !ready())) return;
    generation += 1;
    busy = true;
    message = "";
    for (const control of stage.querySelectorAll("[data-live-command]")) control.disabled = true;
    paintError();
    try { await action(); }
    catch (error) { message = error.message; }
    finally {
      busy = false;
      render(focus && !message);
      if (needsSync) poll();
    }
  }

  function paintError() {
    const node = stage.querySelector("[data-live-error]");
    if (!node) return;
    node.hidden = !message;
    node.textContent = message;
  }

  function errorLine() {
    const node = element("p", "error");
    node.dataset.liveError = "";
    node.setAttribute("role", "alert");
    return node;
  }

  function create() {
    const saved = readActive();
    const current = validRoom(saved?.room);
    if (current && !room) {
      room = current;
      pendingToken = null;
      needsSync = true;
      if (saved.session) restoreSession(saved.session);
      getSession().setup.method = "live";
      render(false);
      poll();
      return;
    }
    return run(async () => {
      const retry = saved?.pendingToken;
      if (!pendingToken && /^[a-f0-9]{64}$/.test(retry || "")) pendingToken = retry;
      pendingToken ??= Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      saveDraft();
      const data = await rpc("crs_bike_trail_start", { p_deck: initialDeck(), p_host_token: pendingToken });
      const token = pendingToken;
      pendingToken = null;
      receive(data, token);
    });
  }

  function joinCard() {
    const card = element("div", "live-join");
    const link = BikeTrailClassroom.studentURL(room.code);
    const details = element("div", "live-join-details");
    const code = element("strong", "live-code", room.code.slice(0, 3) + " " + room.code.slice(3));
    const studentPage = element("a", "live-link", "Open student page");
    studentPage.href = link.href;
    studentPage.target = "_blank";
    studentPage.rel = "noopener";
    const display = element("a", "live-link", "Open class display");
    const displayURL = new URL(location.pathname, location.href);
    displayURL.searchParams.set("class-display", room.id);
    display.href = displayURL.href;
    display.target = "_blank";
    display.rel = "noopener";
    const copy = button("Copy link", "quiet", async () => {
      try {
        await navigator.clipboard.writeText(link.href);
        copy.textContent = "Link copied";
      } catch {
        const input = element("input", "text-input");
        input.value = link.href;
        input.readOnly = true;
        input.setAttribute("aria-label", "Student join link");
        copy.replaceWith(input);
        input.select();
      }
    });
    const actions = element("div", "live-actions");
    actions.append(studentPage, display, copy);
    details.append(element("p", "small", "Student session code"), code, actions);
    card.append(details);
    BikeTrailClassroom.appendQR(card, link, 100);
    return card;
  }

  function setup(form) {
    const isLive = getSession().setup.method === "live";
    const section = form.querySelector("#live-prep");
    const start = form.querySelector("#start-vote");
    section.hidden = !isLive;
    form.querySelector("#voters-field").hidden = isLive;
    form.querySelector("#expected-voters-field").hidden = !isLive;
    form.querySelector(".setup-bottom").classList.toggle("live-method-selected", isLive);
    form.querySelector("#live-method").hidden = false;
    for (const option of form.querySelectorAll("input[name=method]")) {
      option.disabled = option.value !== "live" && Boolean(room);
    }
    form.elements.problem.maxLength = isLive ? 220 : 280;
    for (const proposal of form.querySelectorAll(".proposal-edit input")) proposal.maxLength = isLive ? 160 : 180;
    form.querySelector("#add-proposal").disabled = isLive && getSession().setup.proposals.length >= 10;
    if (!isLive) {
      delete start.dataset.liveCommand;
      start.disabled = false;
      return;
    }
    start.dataset.liveCommand = "";
    start.disabled = busy || !ready();
    if (section.childElementCount) { paint(); return; }
    const heading = element("h3", "", "Live classroom");
    section.append(heading);
    if (!room) {
      section.append(element("p", "small", "Create a code so students can share ideas and vote from their own devices."),
        command(pendingToken ? "Recover live session" : "Create live session", "secondary", create), errorLine());
    } else {
      section.append(joinCard(), element("p", "small", "Open each prompt as the class works through Think, Write, Share."));
      const controls = element("div", "live-actions");
      for (const step of prep) {
        const switchPrompt = command(step.label, "secondary", () => run(() => control(step.id)));
        switchPrompt.setAttribute("aria-pressed", String(room.active === step.id));
        controls.append(switchPrompt);
      }
      const responses = element("div", "live-feedback");
      responses.dataset.liveData = "prep";
      section.append(controls, responses, errorLine(),
        command("End live session", "quiet", () => {
          if (window.confirm("End this session? Students will need a new code to join again.")) run(end);
        }));
    }
    paint();
  }

  function addSuggestion(text) {
    const setup = getSession().setup;
    const proposal = text.slice(0, 160).trim();
    const key = value => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    if (setup.proposals.some(value => key(value) === key(proposal))) {
      message = "That proposal is already on the ballot.";
      paintError();
      return;
    }
    const empty = setup.proposals.findIndex(value => !value.trim());
    if (empty < 0 && setup.proposals.length >= 10) {
      message = "Use up to ten proposals. Combine or remove one first.";
      paintError();
      return;
    }
    const index = empty >= 0 ? empty : setup.proposals.length;
    setup.proposals[index] = proposal;
    message = "";
    saveSession();
    render(false);
    stage.querySelector("#proposal-" + (index + 1)).focus();
  }

  function listWritten(target, submissions, stageId) {
    const unique = new Map();
    for (const { answer } of submissions) {
      const text = answer.text?.trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase().replace(/\s+/g, " ");
      const earlier = unique.get(key);
      unique.set(key, { text: earlier?.text || text, count: (earlier?.count || 0) + 1 });
    }
    target.replaceChildren(element("p", "small", BikeTrailClassroom.progress(submissions.length, expectedVoters(), "response")));
    if (!unique.size) return;
    const list = element("ul", "live-responses");
    for (const { text, count } of unique.values()) {
      const row = element("li", "", text);
      if (count > 1) row.append(element("span", "small", " (" + count + " similar submissions)"));
      if (stageId === "suggestions") row.append(command("Use as proposal", "quiet", () => addSuggestion(text)));
      if (stageId === "reservation") row.append(button("Use as concern", "quiet", () => {
        const field = stage.querySelector("#shifting-the-burden-concern");
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      }));
      list.append(row);
    }
    target.append(list);
  }

  function agreementCounts() {
    const counts = gradients.map(() => 0);
    for (const { answer } of rows("agreement", "scale")) {
      const level = answer.ratings?.support;
      if (Number.isInteger(level) && level >= 1 && level <= counts.length) counts[level - 1] += 1;
    }
    return counts;
  }

  function publishClassView(ended = false) {
    if (!room || !snapshot) return;
    const active = room.deck.find(slide => slide.id === room.active);
    const ballot = ballotSlide();
    const agreement = agreementSlide();
    const showingBallot = active.id === "ballot";
    const stageName = showingBallot ? (ballot.dotRevealed ? "Vote results" : ballot.accepting ? "Voting is open" : "Voting is closed")
      : active.id === "agreement" ? "Gradients of Agreement" : active.id === "reservation" ? "Reasons and reservations" : "Think, Write, Share";
    const round = getSession().round;
    const shownProposals = showingBallot ? ballot.choices.map((choice, index) => ({ label: choice.label, number: index + 1 })) : [];
    const safeResults = ballot.dotRevealed && round?.complete ? rankedTally() : shownProposals;
    const kind = showingBallot ? "dotvote" : active.type;
    const noun = showingBallot ? "ballot" : active.id === "agreement" ? "rating" : "response";
    BikeTrailClassroom.publishDisplay(room.id, {
      stage: ended ? "Session ended" : stageName,
      title: active.id === "agreement" ? agreement.statements[0].label : active.question || stageName,
      instructions: ended ? "" : showingBallot && ballot.accepting
        ? "Each student has " + BikeTrailClassroom.dots(ballot.dotBudget ?? DEFAULT_DOTS) + " for this ballot."
        : active.info,
      code: ended ? "" : room.code,
      progress: BikeTrailClassroom.progress(rows(active.id, kind).length, expectedVoters(), noun),
      proposals: showingBallot || ended ? safeResults : [],
      agreementCounts: agreement.agreementRevealed ? agreementCounts() : null
    });
  }

  function paint() {
    paintError();
    if (!room) return;
    publishClassView();
    const agreement = stage.querySelector("#live-debrief [data-live-agreement]");
    if (agreement) BikeTrailClassroom.paintAgreementChart(agreement, agreementCounts(), expectedVoters());
    const revealAgreement = stage.querySelector("#reveal-live-agreement");
    if (revealAgreement) revealAgreement.disabled = busy || !ready() || rows("agreement", "scale").length === 0;
    const target = stage.querySelector("[data-live-data]");
    if (!target) return;
    if (target.dataset.liveData === "vote") {
      const count = rows("ballot", "dotvote").length;
      const text = BikeTrailClassroom.progress(count, expectedVoters(), "ballot");
      if (target.textContent !== text) target.textContent = text;
      const reveal = stage.querySelector("#reveal-live-tally");
      if (reveal) reveal.disabled = busy || !ready() || count === 0;
      const edit = stage.querySelector("#edit-live-ballot");
      if (edit) {
        edit.hidden = count > 0;
        edit.disabled = busy || !ready() || count > 0;
      }
      return;
    }
    const current = rows(room.active, "open");
    const signature = JSON.stringify([room.active, expectedVoters(), current.map(item => item.answer)]);
    if (responseSignatures.get(target) === signature || target.contains(document.activeElement)) return;
    responseSignatures.set(target, signature);
    listWritten(target, current, room.active);
  }

  function startVote(problem, proposals, dotBudget, expected) {
    if (!ready()) return;
    return run(async () => {
      const choices = proposals.map((label, index) => ({ id: "proposal-" + (index + 1), label }));
      await control("ballot", amend("ballot", {
        question: problem || "Which proposal should the group discuss first?",
        groupProblem: problem, expectedVoters: expected, dotBudget,
        info: problem ? "Choose which proposal the group should discuss first." : "",
        choices, accepting: true, dotRevealed: false
      }));
    }, true);
  }

  function collectTally() {
    const ballot = ballotSlide();
    if (!ballot?.dotRevealed) return false;
    const ballots = rows("ballot", "dotvote");
    if (!ballots.length) return false;
    const session = getSession();
    const dotBudget = ballot.dotBudget ?? DEFAULT_DOTS;
    const counts = ballot.choices.map(({ id }) => ballots.reduce((total, row) => total + (row.answer.dots?.[id] || 0), 0));
    if (counts.reduce((total, count) => total + count, 0) !== ballots.length * dotBudget) return false;
    const earlier = session.round;
    session.round = { counts, entries: counts.map(String), ballots: ballots.length, dotBudget, complete: true, liveId: room.id,
      discussionIndex: earlier?.discussionIndex ?? null, concern: earlier?.concern || "", debrief: earlier?.debrief || null };
    return true;
  }

  function rankedTally() {
    const session = getSession();
    return session.setup.proposals.map((label, index) => ({
      label, number: index + 1, dots: session.round.counts[index]
    })).sort((a, b) => b.dots - a.dots || a.number - b.number);
  }

  function debriefRecord() {
    const { setup, round } = getSession();
    const proposals = rankedTally();
    const leaders = proposals.filter(item => item.dots === proposals[0].dots);
    const selected = leaders.length === 1 ? leaders[0] : leaders.find(item => Number.isInteger(round.discussionIndex) && item.number === round.discussionIndex + 1);
    const agreement = agreementSlide();
    return {
      id: room?.id || round.debrief.id, savedAt: new Date().toISOString(),
      closed: room ? ["ended", "expired"].includes(room.status) : true,
      problem: setup.problem, proposals, ballots: round.ballots, dotBudget: round.dotBudget, expected: expectedVoters(),
      selectedProposal: agreement?.statements[0].label || round.debrief?.selectedProposal || selected?.label || "",
      agreementStarted: Boolean(agreement?.statements[0].label || round.debrief?.agreementStarted),
      agreementCounts: room ? agreementCounts() : round.debrief.agreementCounts,
      concern: (round.concern || "").trim()
    };
  }

  function renderVoting() {
    showTemplate(stage, "live-vote-view");
    showGuide("live-vote-guide");
    showProblem();
    const ballot = ballotSlide();
    stage.querySelector("#live-vote-instructions").textContent =
      "Each student has " + BikeTrailClassroom.dots(ballot.dotBudget ?? DEFAULT_DOTS) + " for this ballot.";
    stage.querySelector("#stage-title").textContent = ballot.accepting ? "Voting is open" : "Voting is closed";
    stage.querySelector("#live-vote-join").append(joinCard());
    const list = stage.querySelector("#live-ballot-proposals");
    ballot.choices.forEach(({ label }, index) => {
      const row = element("li", "vote-row");
      row.append(element("span", "proposal-number", index + 1), element("span", "proposal-text", label));
      list.append(row);
    });
    const controls = stage.querySelector("#live-vote-actions");
    if (ballot.dotRevealed) {
      stage.querySelector("#stage-title").textContent = "Preparing the tally";
    } else if (ballot.accepting) {
      controls.append(command("Close voting", "primary", () => run(() => control("ballot", amend("ballot", { accepting: false })))));
    } else {
      const reveal = command("Reveal tally", "primary", () => run(async () => {
        await control("ballot", amend("ballot", { dotRevealed: true }));
        if (!getSession().round?.complete) throw new Error("The tally is temporarily unavailable. Check the session again.");
      }, true));
      reveal.id = "reveal-live-tally";
      const edit = command("Edit setup", "quiet", () => run(() => control("suggestions"), true));
      edit.id = "edit-live-ballot";
      controls.append(edit, command("Reopen voting", "secondary", () => run(() => control("ballot", amend("ballot", { accepting: true })))),
        reveal);
    }
    paint();
  }

  function renderDebrief(ranked, leaders) {
    const { round } = getSession();
    if (!room && !round.debrief) return;
    const root = stage.querySelector("#live-debrief");
    root.hidden = false;
    root.append(element("h3", "", room ? "Live debrief" : "Class debrief"));
    const agreement = agreementSlide();
    const published = Boolean(agreement?.statements[0].label || round.debrief?.agreementStarted);
    const selected = () => leaders.length === 1 ? ranked[0] : leaders.find(row => row.index === round.discussionIndex);
    const controls = element("div", "live-actions");
    if (room) {
      root.append(joinCard());
      if (!published) {
        const openAgreement = command("Open Gradients of Agreement", "primary", async () => {
          const choice = selected();
          if (!choice) return;
          await run(() => control("agreement", amend("agreement", {
            accepting: true, scaleLabels: gradients, agreementRevealed: false,
            info: "Choose the rating that best represents your support.",
            statements: [{ id: "support", label: choice.proposal }]
          })));
          stage.querySelector("#agreement-chart-title")?.focus();
        });
        const updateSelection = () => { openAgreement.disabled = busy || !ready() || !selected(); };
        stage.querySelector("#discussion-choice").addEventListener("change", updateSelection);
        updateSelection();
        controls.append(openAgreement);
      } else {
        const proposal = agreement.statements[0].label;
        stage.querySelectorAll("[name=discussion-proposal]").forEach(input => { input.disabled = true; });
        root.append(element("p", "leading-text", proposal));
        if (!agreement.agreementRevealed) {
          const reveal = command("Reveal agreement results", "secondary", () => run(() =>
            control(room.active, amend("agreement", { accepting: false, agreementRevealed: true }))));
          reveal.id = "reveal-live-agreement";
          controls.append(reveal);
        }
        if (room.active === "agreement") {
          controls.append(command("Collect reasons and reservations", "primary", () => run(() =>
            control("reservation", amend("reservation", {
              accepting: true,
              info: "Proposal under discussion — " + proposal + "\nDescribe what informed your rating. What concern should the group carry into Shifting the Burden?"
            })))));
        } else {
          controls.append(command("Return students to agreement", "secondary", () => run(() => control("agreement"))));
        }
      }
      controls.append(command("End live session", "quiet", () => {
        if (window.confirm("End this session and save the debrief?")) run(end);
      }));
      root.append(controls);
    } else {
      stage.querySelectorAll("[name=discussion-proposal]").forEach(input => { input.disabled = true; });
      root.append(element("p", "small", "Live session ended."));
    }
    if (published) {
      const chart = BikeTrailClassroom.agreementChart();
      root.append(chart);
      if (!room) BikeTrailClassroom.paintAgreementChart(chart, round.debrief.agreementCounts);
      else if (!agreement.agreementRevealed) root.append(element("p", "small", "Reveal agreement results when the class is ready to see the chart."));
    }
    if (room?.active === "reservation") {
      const data = element("div", "live-feedback");
      data.dataset.liveData = "debrief";
      root.append(data);
    }
    const concern = element("div", "field");
    const label = element("label", "", "Concern for Shifting the Burden");
    label.htmlFor = "shifting-the-burden-concern";
    const field = element("textarea", "text-input");
    field.id = label.htmlFor;
    field.rows = 3;
    field.maxLength = 1000;
    field.placeholder = "Record one concern to carry into the next exercise.";
    field.value = round.concern ?? round.debrief?.concern ?? "";
    field.addEventListener("input", () => { round.concern = field.value; saveSession(); });
    concern.append(label, field);
    const saved = element("p", "small", debriefNotice);
    saved.setAttribute("role", "status");
    const archiveActions = element("div", "live-actions");
    archiveActions.append(button("Save debrief", "secondary", () => {
      round.debrief = debriefRecord();
      const stored = BikeTrailClassroom.saveDebrief(round.debrief);
      debriefNotice = stored ? "Debrief saved on this device." : "Download the debrief to keep a copy.";
      saved.textContent = debriefNotice;
      saveSession();
    }), button("Download debrief", "quiet", () => BikeTrailClassroom.downloadDebrief(debriefRecord())));
    root.append(concern, archiveActions, saved, errorLine());
    paint();
  }

  async function end() {
    if (room) await control(room.active, null, "ended");
  }

  function newRound(reset) {
    return run(async () => {
      await end();
      debriefNotice = "";
      reset();
    }, true);
  }

  async function poll() {
    if (!room || polling || busy || document.hidden) return;
    const { id, token, revision } = room;
    const requested = generation;
    const reconnecting = needsSync || !snapshot;
    polling = true;
    try {
      const data = await rpc("crs_bike_trail_state", {
        p_session_id: id, p_host_token: token,
        p_known_revision: Number.isInteger(revision) ? revision : null
      });
      if (requested !== generation) return;
      if (reconnecting) message = "";
      receive(data, token, true);
      if (!room || reconnecting || revision !== room.revision) render(false);
      else paint();
    } catch {
      if (requested !== generation) return;
      const wasReady = ready();
      needsSync = true;
      message = "Classroom connection interrupted. Reconnecting automatically.";
      if (wasReady) render(false);
      else paintError();
    } finally {
      polling = false;
    }
  }

  function connect() {
    poll();
    setInterval(poll, 1800);
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", poll);
  }

  return { restore, saveDraft, setup, voting, startVote, renderVoting, renderDebrief, newRound, connect };
}
