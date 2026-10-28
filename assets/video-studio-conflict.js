// Leadership 101 | Managing Conflict: From Tension to Teamwork.
// Full, editable class video storyboard. Does not spend paid AI credits.
import {makeId,makeScene,normalizeProject} from './video-studio-core.js';

const chapter=(title,subtitle,script,theme,layout,person='',duration=25)=>({
 title,subtitle,script,theme,layout,duration,
 photoAssetId:person?'mayne-character-'+person+'-professional':'',
 presenter:person?'Alex':'None',
 localVoice:'af_heart'
});

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
 'Imagine Sofia and Daniel are preparing a team deliverable. Sofia says Daniel keeps missing deadlines. Daniel says changes are happening without his input. Their meetings are becoming tense. Both want to succeed, but each sees a different cause. The leader must understand the issue without deciding who is wrong too soon.',
 'slate','presenter-right','sofia',25),

 chapter('Your first move?',
 'A: Pick a side. B: Ignore it. C: Listen and clarify.',
 'Pause and choose your first move. Would you tell the team who is right, hope the disagreement resolves itself, or meet with each person and clarify the facts? The strongest starting point is usually to listen, lower the temperature, and identify the shared problem. The goal is not to win the argument. It is to improve the work and the relationship.',
 'sunset','title','',26),

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

 chapter('3 · Generate options together',
 'Look beyond either-or decisions.',
 'Invite both employees to suggest options before judging them. They might agree on a shared change log, a weekly planning check-in, or a cutoff for new requirements. Build on their ideas. Then use objective criteria such as quality requirements, workload, customer needs, and actual deadlines to choose a workable plan.',
 'forest','split','amara',25),

 chapter('4 · Agree, assign, and follow up',
 'Make the resolution specific and observable.',
 'A good conversation is not enough. Agree on who owns each task, what will happen next, and when progress will be checked. For example, Sofia shares changes by noon, Daniel confirms the revised schedule by three, and both review open questions each Thursday. Revisit the agreement in two weeks and adjust what is not working.',
 'slate','presenter-right','kenji',25),

 chapter('What a leader can actually say',
 'Facts + curiosity + shared next step.',
 'Here is one way to begin. I have noticed tension during our status meetings and two late updates. I want to understand what is getting in the way for each of you. What are you experiencing? What matters most to the outcome? What can we agree to change this week? This keeps the conversation focused on responsibility and joint problem solving.',
 'navy','presenter-left','priya',26),

 chapter('Apply it to your next conversation',
 'Be clear. Stay calm. Build a constructive agreement.',
 'Think of a low-risk disagreement in your own workplace. Is the real issue task related, relationship related, or both? Which conflict approach fits the situation? What interests are underneath the positions? Choose one respectful question you can ask, and one follow-up action that will make progress visible. Conflict handled well can strengthen trust and performance.',
 'sunset','title','',28)
]);

export function conflictLeadershipProject(){
 return normalizeProject({
  id:makeId(),
  name:'Leadership 101 — Managing Conflict: From Tension to Teamwork',
  scenes:CONFLICT_VIDEO_SCENES.map(c=>makeScene({...c,id:makeId()}))
 });
}
