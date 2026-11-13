import React from 'react';
import { Icon } from './icons.jsx';
import { emptyPollDraft, maxOptions, maxWords, optionLimit, pollType, pollTypes, questionLimit, wordLimit } from './quick-poll.js';

function PollComposer({ draft, setDraft, launch, busy }) {
  const type = pollType(draft.type);
  const editableOptions = draft.type === 'choice' || draft.type === 'ranking';
  const patch = fields => setDraft(current => ({ ...current, ...fields }));

  return <form className="poll-form" onSubmit={event => { event.preventDefault(); launch(draft); }}>
    <label className="field">Poll type
      <select value={draft.type} onChange={event => patch({ type: event.target.value })}>
        {pollTypes.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
    <label className="field">Question
      <input value={draft.question} required={!type.question} maxLength={questionLimit}
        placeholder={type.question ?? 'What would you like to ask?'} onChange={event => patch({ question: event.target.value })} />
    </label>
    {editableOptions && <fieldset className="poll-options">
      <legend>Answer options</legend>
      {draft.options.map((option, index) => <div className="poll-option-edit" key={index}>
        <input aria-label={'Option ' + (index + 1)} placeholder={'Option ' + (index + 1)} value={option} maxLength={optionLimit} required
          onChange={event => patch({ options: draft.options.map((item, i) => i === index ? event.target.value : item) })} />
        {draft.options.length > 2 && <button className="icon-button" type="button" aria-label={'Remove option ' + (index + 1)}
          onClick={() => patch({ options: draft.options.filter((_, i) => i !== index) })}><Icon name="close" size={16} /></button>}
      </div>)}
      {draft.options.length < maxOptions && <button className="btn secondary" type="button"
        onClick={() => patch({ options: [...draft.options, ''] })}>Add option</button>}
    </fieldset>}
    {draft.type === 'choice' && <label className="poll-checkbox">
      <input type="checkbox" checked={draft.multiple} onChange={event => patch({ multiple: event.target.checked })} />
      Allow multiple selections
    </label>}
    {type.symbols && <div className="poll-preview" aria-label="Answer options">
      {type.options.map((option, index) => <span key={option}><span aria-hidden="true">{type.symbols[index]}</span> {option}</span>)}
    </div>}
    {draft.type === 'words' && <p className="subtle">Each attendee can enter up to {maxWords} words or short phrases.</p>}
    <div className="form-actions start"><button className="btn primary" disabled={busy}>Launch poll</button></div>
  </form>;
}

function RankBallot({ poll, value, setValue, disabled }) {
  const unranked = poll.options.map((_, index) => index).filter(index => !value.includes(index));
  function move(index, offset) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setValue(next);
  }
  return <>
    <p className="subtle">Choose options in order, starting with your first choice.</p>
    {value.length > 0 && <ol className="poll-ranked" aria-label="Your ranking">
      {value.map((option, index) => <li key={option}>
        <span>{poll.options[option]}</span>
        <button className="icon-button" type="button" disabled={disabled || index === 0}
          aria-label={'Move ' + poll.options[option] + ' up'} onClick={() => move(index, -1)}><Icon name="up" size={17} /></button>
        <button className="icon-button" type="button" disabled={disabled || index === value.length - 1}
          aria-label={'Move ' + poll.options[option] + ' down'} onClick={() => move(index, 1)}><Icon name="down" size={17} /></button>
      </li>)}
    </ol>}
    {unranked.length > 0 && <div className="poll-rank-choices">
      {unranked.map(option => <button className="btn secondary" type="button" key={option} disabled={disabled}
        onClick={() => setValue([...value, option])}>{poll.options[option]}</button>)}
    </div>}
    {value.length > 0 && <button type="button" className="text-button" onClick={() => setValue([])} disabled={disabled}>Reset ranking</button>}
  </>;
}

function PollBallot({ quick }) {
  const { poll, submit, sending, answered, ballot, updateBallot: setAnswer } = quick;
  const type = pollType(poll.type);
  const answer = ballot ?? (poll.type === 'words' ? Array(maxWords).fill('') : []);
  if (answered) return <p className="poll-feedback" role="status"><Icon name="check" size={17} />Response submitted</p>;
  if (!poll.open) return null;

  function toggle(index) {
    if (!poll.multiple) setAnswer([index]);
    else setAnswer(answer.includes(index) ? answer.filter(item => item !== index) : [...answer, index]);
  }
  const canSubmit = poll.type === 'words' ? answer.some(value => value.trim())
    : poll.type === 'ranking' ? answer.length === poll.options.length : answer.length > 0;

  return <form className="poll-form" onSubmit={event => { event.preventDefault(); if (canSubmit) submit(answer); }}>
    {poll.type === 'ranking' ? <RankBallot poll={poll} value={answer} setValue={setAnswer} disabled={sending} />
      : poll.type === 'words' ? <>
        {answer.map((term, index) => <label className="field" key={index}>Word or short phrase {index + 1}
          <input value={term} maxLength={wordLimit} disabled={sending} autoComplete="off"
            onChange={event => setAnswer(answer.map((value, i) => i === index ? event.target.value : value))} />
        </label>)}
      </> : <fieldset className={'poll-ballot-options' + (type.symbols ? ' poll-binary' : '')} disabled={sending}>
        <legend className="subtle">{poll.multiple ? 'Select all that apply' : 'Choose one answer'}</legend>
        {poll.options.map((option, index) => <label className="poll-answer" key={index}>
          <input type={poll.multiple ? 'checkbox' : 'radio'} name="quick-poll-option" aria-label={option} checked={answer.includes(index)}
            onChange={() => toggle(index)} />
          {type.symbols && <span aria-hidden="true" className="poll-answer-symbol">{type.symbols[index]}</span>}
          <span>{option}</span>
        </label>)}
      </fieldset>}
    <div className="form-actions start"><button className="btn primary" disabled={!canSubmit || sending}>
      {sending ? 'Submitting…' : 'Submit response'}
    </button></div>
  </form>;
}

export function PollResults({ poll, results, title = 'Results', announce = true }) {
  if (!results) return null;
  const { count } = results;
  let details;
  if (!count) {
    details = <p className="subtle">{poll.open ? 'Responses will appear here.' : 'No responses were submitted.'}</p>;
  } else if (poll.type === 'words') {
    const largest = results.words[0]?.[1] || 1;
    details = <>
      <ul className="poll-word-cloud" aria-label="Word cloud">
        {results.words.map(([word, votes]) => <li key={word} title={votes + (votes === 1 ? ' mention' : ' mentions')}
          style={{ fontSize: (1 + 0.85 * Math.sqrt(votes / largest)) + 'rem' }}>
          {word}{' '}<span className="poll-word-count">{votes}</span>
        </li>)}
      </ul>
      {results.totalWords > results.words.length && <p className="subtle">Showing the {results.words.length} most common entries.</p>}
    </>;
  } else if (poll.type === 'ranking') {
    const ranked = poll.options.map((option, index) => ({ option, score: results.values[index] / count }))
      .sort((a, b) => a.score - b.score);
    let place = 1;
    details = <>
      <p className="subtle">Average rank. A lower number means a higher preference.</p>
      <ol className="poll-rank-results">{ranked.map(({ option, score }, index) => {
        if (score !== ranked[index - 1]?.score) place = index + 1;
        return <li key={option} value={place}>
          <span>{option}</span>{' '}<strong>{score.toFixed(1)}</strong>
        </li>;
      })}</ol>
    </>;
  } else {
    const symbols = pollType(poll.type).symbols;
    details = <ul className="poll-bars">{poll.options.map((option, index) => {
      const value = results.values[index];
      const percent = Math.round(value / count * 100);
      return <li key={option}>
        <span>{symbols?.[index]} {option}</span><strong>{value} · {percent}%</strong>
        <div aria-hidden="true" className="poll-bar"><span style={{ width: percent + '%' }} /></div>
      </li>;
    })}</ul>;
  }
  return <section className="poll-results" aria-label="Poll results">
    <div className="poll-result-heading"><h3>{title}</h3><span role={announce ? 'status' : undefined}>
      {count} {count === 1 ? 'response' : 'responses'}</span></div>
    {details}
  </section>;
}

export function QuickPolls({ quick, organizer, draft, setDraft }) {
  const poll = quick.poll;
  const type = poll && pollType(poll.type);
  return <div className="side-content poll-panel">
    {poll ? <>
      <div className="poll-heading">
        <span className="subtle">{type.label} <span aria-hidden="true">·</span> {poll.open ? 'Open' : 'Closed'}</span>
        <h3>{poll.question}</h3>
      </div>
      {organizer ? <>
        <PollResults poll={poll} results={quick.results} />
        <div className="form-actions start">
          {poll.open ? <button className="btn primary" type="button" disabled={quick.busy} onClick={quick.close}>Close poll</button> : <>
            {poll.results ? <span className="poll-feedback" role="status"><Icon name="check" size={17} />Results posted to chat</span>
              : <button className="btn primary" type="button" disabled={quick.busy} onClick={quick.share}>Share results</button>}
            <button className="btn secondary" type="button" disabled={quick.busy} onClick={async () => {
              if (await quick.newPoll()) setDraft({ ...emptyPollDraft, type: poll.type });
            }}>New poll</button>
          </>}
        </div>
      </> : <>
        {quick.canVote ? <PollBallot key={poll.id} quick={quick} />
          : poll.open && <p className="subtle">Observers can view shared results.</p>}
        {poll.results && <PollResults poll={poll} results={poll.results} />}
        {!poll.open && !poll.results && <p className="subtle">Voting has ended. Results will appear when the organizer shares them.</p>}
      </>}
    </> : organizer ? <PollComposer draft={draft} setDraft={setDraft} launch={quick.launch} busy={quick.busy} />
      : <p className="subtle">Polls will appear here when the organizer launches one.</p>}
    {quick.error && <p className="poll-error" role="alert">{quick.error}</p>}
  </div>;
}
