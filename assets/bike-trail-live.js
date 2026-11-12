"use strict";

function createBikeTrailLive({ stage, getSession, saveSession, render, showTemplate, showGuide, showProblem, element, button }) {
  const STORAGE_KEY = "bike-trail-live-room-v1";
  const DOTS = 2;
  const RPC_URL = "https://vteamreihsunsllwcphw.supabase.co";
  const PUBLIC_KEY = "sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud";
  const prep = [
    { id: "problem", label: "Problem", question: "What problem do you see on the bike trail?" },
    { id: "stakeholders", label: "Who is involved?", question: "Who is involved or affected?" },
    { id: "suggestions", label: "Proposals", question: "What solution would you propose?" }
  ];
  const gradients = [
    "Wholehearted endorsement", "Agreement with a minor point of contention", "Support with reservations",
    "Abstain", "More discussion needed", "Don’t like but will support", "Serious disagreement", "Veto"
  ];
  const gradientInstructions = gradients.map((label, index) => (index + 1) + " — " + label).join(" · ");
  const responseSignatures = new WeakMap();
  let room = readRoom();
  let snapshot = null;
  let busy = false;
  let polling = false;
  let generation = 0;
  let message = "";

  function readRoom() {
    try {
      const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (/^[a-f\d-]{36}$/i.test(record?.id) && /^\d{7}$/.test(record.code) &&
          /^[a-f\d]{64}$/.test(record.token) && Array.isArray(record.deck) &&
          record.deck.some(slide => slide?.id === "ballot") && record.deck.some(slide => slide?.id === record.active) &&
          ["open", "paused"].includes(record.status)) return record;
    } catch {}
    return null;
  }

  function saveRoom() {
    try {
      if (room) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(room));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

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
      if (error.name === "AbortError") throw new Error("The connection timed out. Try again.");
      if (error instanceof TypeError || error instanceof SyntaxError) {
        throw new Error("The classroom connection was interrupted. Try again.");
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
      { id: "ballot", type: "dotvote", question: "", info: "", choices: [{ id: "proposal-1", label: "" }, { id: "proposal-2", label: "" }], accepting: false, dotRevealed: false },
      { id: "agreement", type: "scale", question: "How much do you support the selected proposal?",
        info: gradientInstructions, accepting: false, scaleMin: 1, scaleMax: 8,
        scaleLow: gradients[0], scaleHigh: gradients.at(-1), statements: [{ id: "support", label: "" }] },
      written("reservation", "What’s your reason or reservation?", "", false)
    ];
  }

  function receive(data, deck, token) {
    snapshot = data;
    if (["ended", "expired"].includes(data.status)) room = null;
    else if (room?.id === data.id && room.deck === deck && room.active === data.active_slide_id && room.status === data.status) return;
    else room = { id: data.id, code: data.code, token, deck, status: data.status, active: data.active_slide_id };
    saveRoom();
  }

  async function control(active, deck = room.deck, status = null) {
    const { id, token } = room;
    const data = await rpc("crs_control_session", {
      p_session_id: id, p_host_token: token, p_deck: deck, p_active_slide: active,
      p_status: status, p_action: null, p_pacing: "instructor"
    });
    receive(data, deck, token);
  }

  function ballotSlide() { return room?.deck.find(slide => slide.id === "ballot"); }

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
    return node;
  }

  async function run(action, focus = false) {
    if (busy) return;
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
    return run(async () => {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const deck = initialDeck();
      const data = await rpc("crs_create_session", {
        p_deck: deck, p_active_slide: "problem", p_host_token: token, p_pacing: "instructor"
      });
      receive(data, deck, token);
    });
  }

  function joinCard() {
    const card = element("div", "live-join");
    const link = new URL("word-cloud-respond.html", location.href);
    link.searchParams.set("code", room.code);
    const details = element("div", "live-join-details");
    const code = element("strong", "live-code", room.code.slice(0, 3) + " " + room.code.slice(3));
    const studentPage = element("a", "live-link", "Open student page");
    studentPage.href = link.href;
    studentPage.target = "_blank";
    studentPage.rel = "noopener";
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
    actions.append(studentPage, copy);
    details.append(element("p", "small", "Student session code"), code, actions);
    card.append(details);
    if (typeof window.QRCode === "function") {
      const qr = element("div", "live-qr");
      qr.setAttribute("role", "img");
      qr.setAttribute("aria-label", "QR code for this student session");
      try {
        new window.QRCode(qr, { text: link.href, width: 100, height: 100 });
        qr.removeAttribute("title");
        card.append(qr);
      } catch {}
    }
    return card;
  }

  function setup(form) {
    const isLive = getSession().setup.method === "live";
    const section = form.querySelector("#live-prep");
    const start = form.querySelector("#start-vote");
    section.hidden = !isLive;
    form.querySelector("#voters-field").hidden = isLive;
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
    start.disabled = busy || !room;
    if (section.childElementCount) return;
    const heading = element("h3", "", "Live classroom");
    section.append(heading);
    if (!room) {
      section.append(element("p", "small", "Create a code so students can share ideas and vote from their own devices."),
        command("Create live session", "secondary", create), errorLine());
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

  function listWritten(target, submissions, suggestions) {
    const unique = new Map();
    for (const { answer } of submissions) {
      const text = answer.text?.trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase().replace(/\s+/g, " ");
      const earlier = unique.get(key);
      unique.set(key, { text: earlier?.text || text, count: (earlier?.count || 0) + 1 });
    }
    target.replaceChildren(element("p", "small", submissions.length + (submissions.length === 1 ? " response" : " responses")));
    if (!unique.size) return;
    const list = element("ul", "live-responses");
    for (const { text, count } of unique.values()) {
      const row = element("li", "", text);
      if (count > 1) row.append(element("span", "small", " (" + count + " similar submissions)"));
      if (suggestions) row.append(command("Use as proposal", "quiet", () => addSuggestion(text)));
      list.append(row);
    }
    target.append(list);
  }

  function paint() {
    paintError();
    const target = stage.querySelector("[data-live-data]");
    if (!target || !room) return;
    if (target.dataset.liveData === "vote") {
      const count = rows("ballot", "dotvote").length;
      const text = count + (count === 1 ? " ballot submitted" : " ballots submitted");
      if (target.textContent !== text) target.textContent = text;
      const reveal = stage.querySelector("#reveal-live-tally");
      if (reveal) reveal.disabled = busy || count === 0;
      const edit = stage.querySelector("#edit-live-ballot");
      if (edit) {
        edit.hidden = count > 0;
        edit.disabled = busy || count > 0;
      }
      return;
    }
    const ratings = room.active === "agreement";
    const current = rows(room.active, ratings ? "scale" : "open");
    const signature = JSON.stringify([room.active, current.map(item => item.answer)]);
    if (responseSignatures.get(target) === signature || target.contains(document.activeElement)) return;
    responseSignatures.set(target, signature);
    if (ratings) {
      const counts = gradients.map((_, index) => current.filter(row => row.answer.ratings?.support === index + 1).length);
      const list = element("ol", "live-ratings");
      gradients.forEach((label, index) => {
        const row = element("li", "", label + " ");
        row.append(element("b", "", counts[index]));
        list.append(row);
      });
      target.replaceChildren(element("p", "small", current.length + (current.length === 1 ? " rating submitted" : " ratings submitted")), list);
    } else {
      listWritten(target, current, room.active === "suggestions");
    }
  }

  function startVote(problem, proposals) {
    if (!room) return;
    return run(async () => {
      const choices = proposals.map((label, index) => ({ id: "proposal-" + (index + 1), label }));
      await control("ballot", amend("ballot", {
        question: problem || "Which proposal should the group discuss first?",
        info: "Use both dots. You can put them on the same proposal.",
        choices, accepting: true, dotRevealed: false
      }));
      Object.assign(getSession().setup, { proposals, problem });
      saveSession();
    }, true);
  }

  function collectTally() {
    const ballot = ballotSlide();
    if (!ballot?.dotRevealed) return false;
    const ballots = rows("ballot", "dotvote");
    if (!ballots.length) return false;
    const session = getSession();
    const counts = ballot.choices.map(({ id }) => ballots.reduce((total, row) => total + (row.answer.dots?.[id] || 0), 0));
    if (counts.reduce((total, count) => total + count, 0) !== ballots.length * DOTS) return false;
    session.setup.proposals = ballot.choices.map(choice => choice.label);
    session.round = { counts, entries: counts.map(String), ballots: ballots.length, complete: true, discussionIndex: null };
    saveSession();
    return true;
  }

  function renderVoting() {
    showTemplate(stage, "live-vote-view");
    showGuide("live-vote-guide");
    showProblem();
    const ballot = ballotSlide();
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
        if (!collectTally()) throw new Error("The tally is temporarily unavailable. Check the session again.");
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
    if (!room) return;
    const root = stage.querySelector("#live-debrief");
    root.hidden = false;
    const session = getSession();
    const selected = () => leaders.length === 1 ? ranked[0] : leaders.find(row => row.index === session.round.discussionIndex);
    root.append(element("h3", "", "Live debrief"), joinCard());
    const controls = element("div", "live-actions");
    const published = room.deck.find(slide => slide.id === "agreement").accepting;
    if (!published) {
      const openAgreement = command("Open Gradients of Agreement", "primary", () => run(async () => {
        const choice = selected();
        if (!choice) return;
        await control("agreement", amend("agreement", { accepting: true, statements: [{ id: "support", label: choice.proposal }] }));
      }));
      const updateSelection = () => { openAgreement.disabled = busy || !selected(); };
      stage.querySelector("#discussion-choice").addEventListener("change", updateSelection);
      updateSelection();
      controls.append(openAgreement);
    } else {
      const proposal = room.deck.find(slide => slide.id === "agreement").statements[0].label;
      stage.querySelectorAll("[name=discussion-proposal]").forEach(input => { input.disabled = true; });
      root.append(element("p", "leading-text", proposal));
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
      if (window.confirm("End this session? The tally will stay available on this device.")) run(end);
    }));
    root.append(controls);
    if (published) {
      const data = element("div", "live-feedback");
      data.dataset.liveData = "debrief";
      root.append(data);
    }
    root.append(errorLine());
    paint();
  }

  async function end() {
    if (room) await control(room.active, room.deck, "ended");
  }

  function newRound(reset) {
    return run(async () => {
      await end();
      reset();
    }, true);
  }

  async function poll() {
    if (!room || polling || busy || document.hidden) return;
    const { id, token, deck } = room;
    const requested = generation;
    polling = true;
    try {
      const data = await rpc("crs_host_snapshot", { p_session_id: id, p_host_token: token });
      if (requested !== generation) return;
      const prior = room.active;
      receive(data, deck, token);
      if (!room || (ballotSlide()?.dotRevealed && !getSession().round && collectTally()) || prior !== room.active) render(false);
      else paint();
    } catch {
      if (requested === generation && !message) {
        const node = stage.querySelector("[data-live-error]");
        if (node) {
          node.hidden = false;
          node.textContent = "Classroom connection interrupted. Reconnecting automatically.";
        }
      }
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

  return { setup, voting, startVote, renderVoting, renderDebrief, newRound, connect };
}
