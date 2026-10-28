// Leadership 101 | Managing Conflict: From Tension to Teamwork.
// Full, editable class video storyboard. Does not spend paid AI credits.
import {makeId,makeScene,normalizeProject} from './video-studio-core.js';

const chapter=(title,subtitle,script,theme,layout,person='',duration=25)=>({
 title,subtitle,script,theme,layout,duration,
 photoAssetId:person?'mayne-character-'+person+'-professional':'',
 presenter:person?'Alex':'None',
 localVoice:({sofia:'af_bella',daniel:'am_michael',priya:'af_heart',amara:'af_nova',kenji:'am_fenrir'})[person]||'af_heart'
});

const dialogue=(name,subtitle,script,person,emotion='thoughtful',duration=22)=>chapter(
 name,emotion.toUpperCase()+' · '+subtitle,script,person==='sofia'?'sunset':person==='daniel'?'slate':'navy',
 person==='sofia'?'presenter-left':'presenter-right',person,duration);

export const CONFLICT_VIDEO_SCENES=Object.freeze([
 chapter('Conflict is a leadership signal',
 'Turn tension into clarity, trust, and progress.',
 'Two capable employees disagree in front of their team. The tension is spreading, and work is slowing down. As the supervisor, what do you do? Conflict is not always a failure. It can be a signal that people care about something important. The goal is to respond clearly, calmly, and constructively.',
 'navy','presenter-right','priya',24),

 chapter('Name the real conflict',
 'A disagreement about the work can become a disagreement about people.',
 'Task conflict concerns priorities, deadlines, or how work should be done. Relationship conflict becomes personal. It involves blame, disrespect, or damaged trust. As a leader, separate what happened from the stories people tell about one another. Unclear goals, roles, and communication often add fuel to the problem.',
 'blue','split','amara',26),

 chapter('A deadline. Two perspectives.',
 'Sofia needs an answer. Daniel needs reliable information.',
 'Sofia and Daniel are preparing a time-sensitive deliverable. Sofia is accountable for the deadline. Daniel provides the technical information. As requirements change, communication breaks down. Watch how a task disagreement becomes personal, then notice how the supervisor helps them recover.',
 'slate','presenter-right','sofia',25),

 dialogue('Sofia | I am under pressure',
 'The delivery deadline is approaching.',
 'Daniel, I need the completed numbers today. This is the third time I have had to ask. I cannot explain another delay to the customer.',
 'sofia','concerned',18),

 dialogue('Daniel | Requirements keep changing',
 'He has not had the full picture.',
 'I want to meet the deadline, Sofia, but the requirements changed again yesterday. I cannot finish accurate numbers when the scope changes without warning.',
 'daniel','defensive',20),

 dialogue('Sofia | The disagreement escalates',
 'A task issue becomes personal.',
 'You always have an excuse. If you communicated better, we would not be in this position. I need accountability, not another explanation.',
 'sofia','frustrated',17),

 dialogue('Daniel | The relationship is damaged',
 'He starts defending his character.',
 'That is unfair. You send changes after I have started the work. I am doing my best, and it feels like you have already decided I am the problem.',
 'daniel','hurt',19),

 chapter('Your first move?',
 'A: Pick a side. B: Ignore it. C: Listen and clarify.',
 'Pause and choose your first move. Would you tell the team who is right, hope the disagreement resolves itself, or meet with each person and clarify the facts? The strongest starting point is usually to listen, lower the temperature, and identify the shared problem. The goal is not to win the argument. It is to improve the work and the relationship.',
 'sunset','title','',26),

 dialogue('Supervisor | Reset the conversation',
 'Acknowledge frustration without taking sides.',
 'I can hear that both of you are frustrated. I want us to step away from blame and understand the work. Let us talk about the deadline, the changes, and what each of you needs to succeed.',
 'priya','calm',25),

 chapter('Five ways people handle conflict',
 'Avoid · Accommodate · Compete · Compromise · Collaborate',
 'The Thomas Kilmann model describes five conflict approaches. Avoiding delays engagement. Accommodating puts the other concern first. Competing pursues a firm position. Compromising trades concessions. Collaborating works to meet important interests on both sides. None fits every situation. Consider urgency, relationships, stakes, and the need for a lasting solution.',
 'blue','text-only','',30),

 chapter('CLEAR · CALM · CONSTRUCTIVE',
 'Regulate emotion before you try to solve the issue.',
 'Before any difficult conversation, manage your own reaction. Speak privately and respectfully. Use neutral language, ask open questions, and acknowledge the concerns you hear. Avoid assigning motives. Psychological safety means people can raise a concern without being humiliated. It does not mean avoiding accountability.',
 'forest','presenter-left','priya',25),

 chapter('1 · Separate people from the problem',
 'Describe observable facts, not character judgments.',
 'Principled negotiation starts by separating the people from the problem. Instead of saying, Daniel is unreliable, name the observable issue: our last two updates were submitted after the deadline. Ask both employees to explain what happened. Listen for missing information, unclear roles, or changes in expectations.',
 'navy','presenter-right','daniel',25),

 chapter('2 · Focus on interests',
 'Ask what matters underneath each position.',
 'Positions are what people demand. Interests are why those demands matter. Sofia wants a firm deadline because she is accountable to the customer. Daniel needs earlier notice because late changes create rework. The leader can respect both interests without endorsing blame. Ask, what do you need in order to succeed?',
 'blue','presenter-left','sofia',24),

 dialogue('Sofia | From blame to interests',
 'She explains why the deadline matters.',
 'The customer has promised to use these numbers on Friday. I need a reliable date, and I need to know early if something will change. I do not want to surprise them.',
 'sofia','listening',23),

 dialogue('Daniel | What he really needs',
 'The true obstacle becomes clearer.',
 'I can deliver reliable numbers if we agree on the requirements first. When a new request arrives, I need someone to tell me what changes and what gets deprioritized.',
 'daniel','explaining',23),

 chapter('3 · Generate options together',
 'Look beyond either-or decisions.',
 'Invite both employees to suggest options before judging them. They might agree on a shared change log, a weekly planning check-in, or a cutoff for new requirements. Build on their ideas. Then use objective criteria such as quality requirements, workload, customer needs, and actual deadlines to choose a workable plan.',
 'forest','split','amara',25),

 chapter('4 · Agree, assign, and follow up',
 'Make the resolution specific and observable.',
 'A good conversation is not enough. Agree on who owns each task, what will happen next, and when progress will be checked. For example, Sofia shares changes by noon, Daniel confirms the revised schedule by three, and both review open questions each Thursday. Revisit the agreement in two weeks and adjust what is not working.',
 'slate','presenter-right','kenji',25),

 dialogue('A workable agreement',
 'Sofia and Daniel commit to clear shared expectations.',
 'Here is our agreement. Sofia will document changes by noon. Daniel will flag the impact and confirm the revised deadline by three. You will review open issues together each Thursday. We will check progress in two weeks.',
 'priya','confident',29),

 chapter('What a leader can actually say',
 'Facts + curiosity + shared next step.',
 'I noticed our last two status meetings became tense, and we had two late updates. I want to understand the facts without placing blame. Sofia, what deadline are you responsible for? Daniel, which changes affected the work? What solution will you both commit to, and when should we check progress?',
 'navy','presenter-left','priya',26),

 chapter('Apply it to your next conversation',
 'Be clear. Stay calm. Build a constructive agreement.',
 'Before your next difficult conversation, pause and identify whether the disagreement concerns tasks, relationships, or both. Think about the five Thomas Kilmann approaches. Listen for the interests underneath each position. Ask a neutral question, agree on a specific action, and schedule a follow-up. You are not trying to win a conflict. You are helping your team move forward together.',
 'sunset','title','',28)
]);

// Matching defaults for the 20-scene Kokoro narration release (actual voice lengths rounded up).
// These settings are editable. Existing projects are not modified.
export const CONFLICT_ANIMATED_DURATIONS=Object.freeze([
 24,26,25,11,13,12,14,26,14,32,27,28,27,13,14,24,25,19,22,29
]);
const CONFLICT_BULLET_SUBTITLES=Object.freeze({
  7:'• Pick a side • Ignore the disagreement • Listen and clarify',
  9:'• Avoid or accommodate • Compete or compromise • Collaborate',
  10:'• Speak from observable facts • Regulate your response • Invite solutions'
});
export function conflictLeadershipProject(){
 return normalizeProject({
  id:makeId(),
  name:'Leadership 101 — Managing Conflict: Animated Motion Edition',
  scenes:CONFLICT_VIDEO_SCENES.map((c,i)=>makeScene({
   ...c,id:makeId(),
   duration:CONFLICT_ANIMATED_DURATIONS[i],
   titleMotion:Object.hasOwn(CONFLICT_BULLET_SUBTITLES,i)?'bullet-build':i===3||i===4||i===5||i===6?'fade':'word-by-word',
   subtitle:Object.hasOwn(CONFLICT_BULLET_SUBTITLES,i)?CONFLICT_BULLET_SUBTITLES[i]:c.subtitle,
   presenterMotion:i%4===0?'zoom':i%2===0?'slide-left':'slide-right',
   transition:['dissolve','slide-left','wipe','zoom'][i%4],
   motionDuration:[1.2,1.5,1.8][i%3],
   motionDelay:i>=3&&i<=6?.1:.3,
   subtitleDelay:i===7||i===9||i===10?.8:.4
  }))
 });
}
