/*
 * One-question-at-a-time navigation for the eight Individual Assessment Studio forms.
 * Keeps every original radio and question in the DOM so scoring and JSON import/export
 * continue to use the original input names and values without modification.
 */
(() => {
  'use strict';

  const types = ['mbti', 'ennea', 'genius', 'strength', 'disc', 'kolb', 'tki', 'eq'];
  const pagers = new Map();

  function initAssessment(type) {
    const form = document.getElementById(type + 'Form');
    const container = document.getElementById(type + 'QuestionsContainer');
    if (!form || !container || pagers.has(type)) return;
    const questions = Array.from(container.children).filter(child => child.classList.contains('question-group'));
    if (!questions.length) return;

    // The question elements and original form submit/reset handlers stay intact.
    const navigation = document.createElement('nav');
    navigation.className = 'assessment-question-nav';
    navigation.setAttribute('aria-label', 'Assessment question navigation');
    navigation.innerHTML = `
      <div class="assessment-question-summary">
        <span class="assessment-question-counter" aria-live="polite"></span>
        <span class="assessment-question-help" aria-live="polite"></span>
      </div>
      <div class="assessment-question-actions">
        <button type="button" class="assessment-previous">← Previous</button>
        <button type="button" class="assessment-next">Next question →</button>
      </div>`;
    container.insertAdjacentElement('afterend', navigation);
    const previous = navigation.querySelector('.assessment-previous');
    const next = navigation.querySelector('.assessment-next');
    const counter = navigation.querySelector('.assessment-question-counter');
    const help = navigation.querySelector('.assessment-question-help');
    const submit = form.querySelector('button[type="submit"]');
    const welcome = document.createElement('section');
    welcome.className = 'assessment-start-card';
    welcome.setAttribute('aria-label', 'Assessment welcome');
    welcome.innerHTML = `
      <span class="assessment-start-eyebrow">READY WHEN YOU ARE</span>
      <h3>Ready to begin your assessment?</h3>
      <p>You'll answer ${questions.length} questions, one at a time. You can use Previous
      to review or change an answer before seeing your results.</p>
      <p class="assessment-start-status" aria-live="polite"></p>
      <button class="assessment-start-button" type="button">Start Assessment →</button>`;
    form.insertBefore(welcome, form.querySelector('.progress-wrapper'));
    const startButton = welcome.querySelector('.assessment-start-button');
    const startStatus = welcome.querySelector('.assessment-start-status');
    let started = false;
    let position = 0;

    function updateWelcome() {
      const answered = questions.filter(isAnswered).length;
      startButton.textContent = answered > 0 ? 'Resume Assessment →' : 'Start Assessment →';
      startStatus.textContent = answered > 0
        ? `${answered} of ${questions.length} already answered. Your previous selections are saved in this session.`
        : `${questions.length} questions · One at a time · Review answers anytime`;
    }

    function isAnswered(question) {
      return !!question.querySelector('input[type="radio"]:checked');
    }

    function showQuestion(index, moveFocus = false) {
      position = Math.max(0, Math.min(questions.length - 1, index));
      questions.forEach((question, i) => {
        question.hidden = !started || i !== position;
        question.setAttribute('aria-label', 'Question ' + (i + 1) + ' of ' + questions.length);
        question.setAttribute('role', 'group');
      });
      navigation.hidden = !started;
      welcome.hidden = started;
      const answered = questions.filter(isAnswered).length;
      const selected = isAnswered(questions[position]);
      const isLast = position === questions.length - 1;

      counter.textContent = 'Question ' + (position + 1) + ' of ' + questions.length;
      previous.disabled = position === 0;
      next.disabled = !selected;
      if (isLast && answered === questions.length) {
        next.textContent = 'View my results →';
        help.textContent = 'All questions answered. Ready to view your profile.';
      } else if (isLast) {
        next.textContent = 'Review unanswered →';
        help.textContent = selected
          ? 'Some questions still need answers.'
          : 'Choose an answer to continue.';
      } else {
        next.textContent = 'Next question →';
        help.textContent = selected
          ? answered + ' of ' + questions.length + ' answered'
          : 'Choose an answer to continue.';
      }
      if (submit) submit.disabled = !started || answered !== questions.length;
      if (!started) {
        updateWelcome();
        return;
      }

      if (moveFocus) {
        const tabs = document.querySelector('.tabs');
        const anchor = form.querySelector('.progress-wrapper') || container;
        const top = window.scrollY + anchor.getBoundingClientRect().top -
          (tabs ? tabs.getBoundingClientRect().height : 0) - 14;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        const focus = questions[position].querySelector('input[type="radio"]:checked') ||
          questions[position].querySelector('input[type="radio"]');
        if (focus) focus.focus({ preventScroll: true });
      }
    }

    startButton.addEventListener('click', () => {
      started = true;
      form.classList.remove('assessment-awaiting-start');
      const firstIncomplete = questions.findIndex(question => !isAnswered(question));
      showQuestion(firstIncomplete < 0 ? questions.length - 1 : firstIncomplete, true);
    });
    previous.addEventListener('click', () => showQuestion(position - 1, true));
    next.addEventListener('click', () => {
      if (!isAnswered(questions[position])) return;
      if (position < questions.length - 1) {
        showQuestion(position + 1, true);
      } else {
        const firstUnanswered = questions.findIndex(question => !isAnswered(question));
        if (firstUnanswered >= 0) {
          showQuestion(firstUnanswered, true);
        } else if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else if (submit) {
          submit.click();
        }
      }
    });

    form.addEventListener('change', showCurrentOnChange);
    function showCurrentOnChange() { showQuestion(position, false); }

    // Prevent an early keyboard or scripted submission from calculating a partial profile.
    form.addEventListener('submit', event => {
      if (!started) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const firstUnanswered = questions.findIndex(question => !isAnswered(question));
      if (firstUnanswered !== -1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showQuestion(firstUnanswered, true);
      }
    }, true);

    form.classList.add('assessment-paged', 'assessment-awaiting-start');
    pagers.set(type, {
      reset() {
        started = false;
        form.classList.add('assessment-awaiting-start');
        showQuestion(0, false);
      },
      show: showQuestion,
      count: questions.length
    });
    showQuestion(0, false);
  }

  function initialize() {
    types.forEach(initAssessment);

    // Both manual Reset and Load Progress call the site's existing resetAssessment.
    // Wrap it rather than altering the scoring, import, or summary implementations.
    if (typeof window.resetAssessment === 'function') {
      const originalReset = window.resetAssessment;
      window.resetAssessment = function(type, silent = false) {
        const result = originalReset(type, silent);
        const pager = pagers.get(type);
        if (pager) pager.reset();
        return result;
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();