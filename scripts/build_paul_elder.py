import json, uuid, pathlib, math, textwrap

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'interactive-courses' / 'critical-thinking-paul-elder.mayne-course.json'
NS = uuid.UUID('86e7b1fc-6b6c-459e-99d2-7ec7fdb245d3')
def ident(key): return str(uuid.uuid5(NS, key))
serial = 0
def uid():
    global serial
    serial += 1
    return ident(f'entity-{serial}')

P = dict(format='mayne-interactive-course', schemaVersion=1,
    id=ident('paul-elder-course-v1'), title='Critical Thinking: Reason Better, Decide Better',
    description='An original two-hour adult learning course based on Richard Paul and Linda Elder. Analyze reasoning, apply intellectual standards, practice intellectual traits, and defend a decision with evidence.',
    width=1280, height=720, startSlideId='',
    theme=dict(primary='#174a74',accent='#b38b36',background='#edf4fa'),
    variables=[],scenes=[],updatedAt='2026-10-14T03:30:00Z')
P['courseMetadata'] = dict(author='Joshua E. Mayne / Mayne Leadership',
    framework='Paul–Elder',durationMinutes=120,audience='Adult learners, instructors, and workplace leaders',
    version='1.0',assessment='12-question learning assessment; 10/12 required, plus self-attested capstone completion. Device-based practice results, not an LMS grade.',
    attribution='Framework attributed to Richard Paul and Linda Elder. Case data, instructional explanations, activities, questions, and visual composition are original Mayne Leadership course material.')
refs = [
    dict(title='Paul & Elder: The Elements of Reasoning and the Intellectual Standards',url='https://www.criticalthinking.org/pages/critical-thinking-in-a-nutshell/480'),
    dict(title='Elder & Paul: Universal Intellectual Standards',url='https://www.criticalthinking.org/pages/universal.intellectual-standard/527'),
    dict(title='Foundation for Critical Thinking: Nine foundational standards',url='https://www.criticalthinking.org/store/get_file.php?inventories_files_id=407&inventories_id=338'),
    dict(title='Foundation for Critical Thinking: Valuable Intellectual Traits',url='https://www.criticalthinking.org/pages/valuable-intellectual-traits/528'),
    dict(title='Foundation for Critical Thinking: Distinguishing Between Inferences and Assumptions',url='https://www.criticalthinking.org/pages/distinguishing-between-inferences-and-assumptions/484'),
    dict(title='Foundation for Critical Thinking: Virtuous Virtues',url='https://community.criticalthinking.org/virtuousVirtues.php')]
P['courseMetadata']['references'] = refs

def var(name,typ='number',initial=0):
    v=dict(id=ident('variable-'+name),name=name,type=typ,initial=initial)
    P['variables'].append(v);return v['id']
SCORE=var('quiz_score'); ANSWERED=var('quiz_answered'); PERCENT=var('quiz_percent')
READY=var('course_ready','boolean',False); CAPSTONE=var('capstone_done','boolean',False)
def obj(typ,text='',x=60,y=230,w=1160,h=300,font=28,fill='transparent',color='#173653',bold=False,name=None,**kw):
    o=dict(id=uid(),name=name or (text[:65] or typ),type=typ,text=text,
        x=x,y=y,w=w,h=h,rotation=0,fill=fill,color=color,fontSize=font,bold=bold,align='left',radius=16,
        start=0,duration=3600,locked=False,hidden=False,alt='',decorative=typ=='shape',
        initialState='normal',states=dict(normal={},hover={},visited={},disabled={},hidden={}),src='')
    o.update(kw);return o
def trig(s,event,source,action,target='',value='',condition=None,operation='set'):
    t=dict(id=uid(),event=event,source=source,action=action,target=target,value=value,
           operation=operation,enabled=True,at=0)
    if condition:t['condition']=condition
    s['triggers'].append(t);return t
def cond(variable,op,value):return dict(variable=variable,op=op,value=value)
def scene(title,minutes):
    sc=dict(id=uid(),title=title,slides=[]);P['scenes'].append(sc)
    sc['suggestedMinutes']=minutes
    return sc
def slide(sc,title,subtitle='',prompt='Use Next to continue. You can revisit any lesson.',notes=''):
    s=dict(id=uid(),title=title,duration=3600,background='#f7fafc',notes=notes,
           revisit='resume',layers=[dict(id=uid(),name='Base',modal=False,objects=[])],triggers=[])
    s['layers'][0]['objects'] += [
        obj('shape',x=0,y=0,w=1280,h=12,fill='#174a74'),
        obj('text',sc['title'].upper(),x=48,y=25,w=1168,h=48,font=18,color='#5b7085',bold=True),
        obj('text',title,x=48,y=81,w=1170,h=73,font=42 if len(title)<50 else 35,bold=True),
        obj('text',subtitle,x=50,y=154,w=1168,h=80,font=22,color='#436278'),
        obj('text',prompt,x=50,y=627,w=1172,h= sixty(),font=20,color='#5b7085')]
    sc['slides'].append(s);return s
def sixty():return 60
def body(s,text,font=28):s['layers'][0]['objects'].append(obj('text',text,font=font,x=62,y=229,w=1150,h=365))
def cards(s,items):
    n=len(items);gap=22;width=(1160-gap*(n-1))/n
    for i,(heading,text) in enumerate(items):
        x=60+i*(width+gap)
        s['layers'][0]['objects'] += [obj('shape',x=x,y=236,w=width,h=364,fill='#eaf2f8'),
            obj('text',heading,x=x+16,y=252,w=width-32,h=68,font=24,bold=True,color='#174a74'),
            obj('text',text,x=x+16,y=321,w=width-32,h=262,font=24 if n==2 else 22)]
def reveal(s,label,heading,text,x=60,y=530,w=500,h=70):
    b=obj('button',label,x=x,y=y,w=w,h=h,font=23,fill='#174a74',color='#ffffff')
    layer=dict(id=uid(),name=heading,modal=True,objects=[
        obj('shape',x=115,y=115,w=1050,h=490,fill='#ffffff'),
        obj('text',heading,x=155,y=143,w=960,h=83,font=34,bold=True),
        obj('text',text,x=155,y=238,w=960,h=237,font=26)])
    close=obj('button','Return to lesson',x=830,y=514,w=282,h=64,font=22,fill='#174a74',color='#ffffff')
    layer['objects'].append(close);s['layers'].append(layer);s['layers'][0]['objects'].append(b)
    trig(s,'click',b['id'],'show-layer',layer['id']);trig(s,'click',close['id'],'hide-layer',layer['id'])
    return b,layer
questions=[]
def choice(sc,title,question,options,prompt='Choose an answer. Read the feedback, then continue.',assessed=False,number=None,notes=''):
    s=slide(sc,title,question,prompt,notes)
    response=var(f'quiz_q{number:02d}',initial=-1) if assessed else None
    buttons=[];layers=[];correct=None
    for i,(text,is_correct,explanation) in enumerate(options):
        b=obj('button',f'{chr(65+i)}. {text}',x=60,y=234+i*88,w=1160,h=80,font=24,
            fill='#eaf2f8',color='#174a74',name=f'Answer {chr(65+i)}: {text}')
        b['states']['selected']=dict(fill='#174a74',color='#ffffff',bold=True)
        b['states']['hover']=dict(fill='#dae8f4')
        layer=dict(id=uid(),name=('Reasoning feedback' if not assessed else f'Question {number} feedback')+f' {chr(65+i)}',modal=True,
            objects=[obj('shape',x=110,y=115,w=1060,h=490,fill='#ffffff'),
                obj('text','Sound reasoning' if is_correct else 'Reconsider this choice',x=150,y=148,w=960,h=72,font=36,bold=True,color='#236247' if is_correct else '#795822'),
                obj('text',explanation,x=150,y=234,w=960,h=236,font=26)])
        close=obj('button','Return to question',x=817,y=520,w=300,h=64,font=22,fill='#174a74',color='#ffffff')
        layer['objects'].append(close);trig(s,'click',close['id'],'hide-layer',layer['id'])
        buttons.append(b);layers.append(layer)
        if is_correct:correct=b['id']
    s['layers'][0]['objects']+=buttons;s['layers']+=layers
    for i,b in enumerate(buttons):
        if response:trig(s,'click',b['id'],'variable',response,1 if options[i][1] else 0)
        for other in buttons:trig(s,'click',b['id'],'state',other['id'],'normal')
        trig(s,'click',b['id'],'state',b['id'],'selected');trig(s,'click',b['id'],'show-layer',layers[i]['id'])
    if assessed:questions.append(dict(slide=s['id'],variable=response,correct=correct,buttons=[b['id'] for b in buttons]))
    return s

intro=scene('01 · Start with your own thinking',10)
s=slide(intro,'Critical Thinking','Reason better. Decide better. An original course using the Paul–Elder framework.',
    'Suggested time: 120 minutes, including reflection and the decision brief.',
    'FACILITATOR: Open with a recent decision you revised. Ask what evidence changed your mind. Explain that questioning a conclusion is a professional skill. This course teaches the framework, then applies it to fictional service and technology decisions. Invite participants to use the companion workbook or paper. Do not treat the quiz as an externally verified qualification.')
cards(s,[('ANALYZE','Identify the eight elements within a claim or decision.'),('ASSESS','Use nine intellectual standards to improve the reasoning.'),('DEVELOP','Practice intellectual traits that help you question your own conclusions.')])
P['startSlideId']=s['id']
s=slide(intro,'What you will be able to do','Five outcomes you can demonstrate at the end of this course.')
body(s,'1. Map the purpose, question, information, inferences, assumptions, concepts, viewpoints, and implications of a decision.\n2. Improve a claim using intellectual standards.\n3. Separate recorded information from interpretations and assumptions.\n4. Question your own position fairly and revise it when justified.\n5. Write a defensible decision brief with limits and a review trigger.',font=27)
s=slide(intro,'A repeatable reasoning practice','The elements identify parts; the standards assess quality; the traits support your habits.',
    'Apply this sequence to your thinking before you critique someone else’s.',
    'FACILITATOR: Ask learners to explain the difference between naming an assumption and judging its quality. Example: The tool caused delays is an inference. Accuracy asks which records support it. Humility helps acknowledge that the explanation is still uncertain. Avoid treating the three framework components as separate memorization lists.')
cards(s,[('1 · MAKE IT VISIBLE','State the decision. Identify the parts of the reasoning that produced it.'),('2 · TEST ITS QUALITY','Check what is vague, unsupported, incomplete, inconsistent, or unfair.'),('3 · IMPROVE & REVISIT','Revise the conclusion, seek missing evidence, and decide what would change your mind.')])
s=slide(intro,'Case file: the Client Services Desk','All case data are fictional. The desk introduced new queue software this month.',
    'WORKBOOK 1 · Record your first conclusion and your confidence before seeing more information.',
    'FACILITATOR: Give 90 seconds for an individual first conclusion. Avoid correcting learners yet. Last month: 120 requests, 96 timely, 80%. This month: 180 requests, 126 timely, 70%. Staffing stayed at six. Director claims the software damaged performance. Ask: What is known, and what has been inferred?')
cards(s,[('LAST MONTH','120 requests\n96 completed on time\n80% timely\n6 staff'),('THIS MONTH','180 requests\n126 completed on time\n70% timely\n6 staff'),('THE CLAIM','“The new software caused our decline. Remove it immediately.”\n\nWhat does the evidence support so far?')])
choice(intro,'Diagnostic: choose your first move','What is the strongest first response to the director’s claim?',[
    ('Remove the software because the timely rate fell.',False,'The fall is documented, but the software’s causal role is not established. Other changes may have contributed. Separate the outcome from the explanation before choosing a remedy.'),
    ('Keep it because timely completions increased.',False,'Timely completions increased from 96 to 126, yet the timely rate fell from 80% to 70%. More output does not settle service quality or explain the cause.'),
    ('Clarify the decision and compare workload, case mix, and process evidence.',True,'Start with the purpose and question, then test competing explanations. Request volume increased 50%. That matters, but neither the volume change nor the software launch alone proves causation.'),
    ('Ask the most senior employee to settle the dispute.',False,'Experience can suggest questions and provide relevant evidence. Rank alone does not establish which explanation is best supported.')])
s=slide(intro,'Observation, conclusion, confidence','A confident claim can still rest on an untested explanation.')
cards(s,[('RECORDED INFORMATION','The timely rate fell by 10 percentage points. Request volume rose from 120 to 180.\n\nThese are descriptions of the records.'),('AN EXPLANATION TO TEST','The software caused the decline.\n\nThis interpretation needs evidence that distinguishes it from workload, case mix, and other causes.')])
s=slide(intro,'Take a two-minute reasoning baseline','Use a real decision, or stay with the Client Services Desk.',
    'WORKBOOK 1 · Keep this baseline. You will revise it after the evidence exercise.',
    'FACILITATOR: Allow two minutes. Ask for a conclusion, two supporting observations, a confidence rating, and one condition that would change the learner’s mind. This is a self-reflection rather than a validated critical-thinking diagnostic.')
body(s,'Write four short responses:\n\n• My current conclusion is…\n• The two strongest observations supporting it are…\n• My confidence is low / moderate / high because…\n• I would revise my conclusion if…',font=30)

elements=scene('02 · Analyze the eight elements',18)
s=slide(elements,'Eight elements within every decision','Use the elements to inspect the structure of your reasoning.',
    'The elements interact. A new question can change which information matters.')
cards(s,[('DIRECTION','Purpose\nQuestion at issue\n\nWhat are we trying to achieve and determine?'),('FOUNDATIONS','Information\nConcepts\nAssumptions\n\nWhat evidence and ideas are we using?'),('INTERPRETATION & EFFECT','Inferences\nPoint of view\nImplications and consequences\n\nWhat follows, for whom, and with what limits?')])
el_data=[
('Purpose','The result you are trying to achieve.','Desk example: deliver timely, accurate service while using staff capacity responsibly.','A hidden purpose to defend a favorite tool can distort the analysis.','What outcome are we trying to improve, and whose needs does it serve?'),
('Question at issue','The question your reasoning must answer.','Desk example: what changes would improve timely service without increasing errors?','“Who is to blame?” steers inquiry differently from “What conditions are causing delay?”','What decision must be made, by when, and within what boundaries?'),
('Information','The observations and evidence you are using.','Desk example: request counts, deadlines, error logs, processing times, and interviews.','A precise-looking number may use an inconsistent definition or incomplete records.','Which records support this claim, and how were they produced?'),
('Inferences and interpretations','The conclusions you draw from information.','Desk example: the software may be one contributor to delay.','Moving from “after the launch” to “because of the launch” needs additional support.','Which conclusion follows, and what alternative explanation remains plausible?'),
('Assumptions','What your reasoning takes for granted.','Desk example: last month and this month used comparable deadlines.','A useful assumption can still require checking when the context changes.','What must be true for this explanation to work?'),
('Concepts','The ideas and definitions shaping the reasoning.','Desk example: timely service means meeting the published deadline, not merely closing a request.','Different definitions of performance can create disagreement about the same records.','How are we defining success, delay, quality, and capacity?'),
('Point of view','The perspective from which you understand the issue.','Desk example: staff see rework; clients see waiting; managers see service commitments.','A perspective can reveal an important constraint without capturing the whole problem.','Whose reasoning have I not yet understood?'),
('Implications and consequences','What follows if you accept or act on the reasoning.','Desk example: removing the tool may reduce one error and increase manual routing time.','Evaluate expected benefits, tradeoffs, unintended effects, and uncertainty.','What could happen next if this explanation is correct—or wrong?')]
for name,meaning,example,risk,question in el_data:
    s=slide(elements,name,meaning,'WORKBOOK 2 · Apply this element to your selected decision.',
        f'FACILITATOR: Explain the element in your own words. Invite an example from the desk case and one from learners’ work. Ask: {question} Keep identification separate from judgment. The same item may connect multiple elements; learners should explain the role it plays.')
    cards(s,[('IN THE DESK CASE',example),('CHECK YOUR REASONING',risk+'\n\n'+question)])
choice(elements,'Practice: identify the hidden assumption','“The timely rate fell, so the new tool must be responsible.” Which assumption is most central?',[
    ('The new tool is the main relevant change affecting the timely rate.',True,'The explanation assumes that the software, rather than workload, case mix, staffing availability, or measurement changes, explains the decline. That assumption needs testing.'),
    ('There were 180 requests this month.',False,'That is recorded information in the case. An assumption is what the reasoning takes for granted to connect information to a conclusion.'),
    ('The organization wants timely service.',False,'That is a plausible purpose. It does not provide the missing bridge between the lower rate and the claim that software caused it.'),
    ('Removing the tool may create manual routing work.',False,'That is a possible consequence of a proposed action. It is important, but it is not the central assumption behind this causal explanation.')])
s=slide(elements,'Build your reasoning map','One sentence for each element is enough to expose gaps.',
    'WORKBOOK 2 · Spend four minutes mapping the eight elements. Mark missing evidence.',
    'FACILITATOR: Give four minutes. Ask pairs to exchange maps. Each partner identifies one vague question, one untested assumption, and one missing perspective. Treat different maps as hypotheses to examine, not as automatically correct or incorrect.')
body(s,'Purpose → Question → Information → Inference\n\nThen inspect the supports: assumptions and concepts.\nThen expand the view: perspectives and consequences.\n\nAsk a partner: “Which part of my map would you want me to explain or support before acting?”',font=30)

standards=scene('03 · Assess reasoning with standards',18)
s=slide(standards,'Standards are tests of reasoning quality','Apply them to the elements. Knowing a label is only the starting point.')
cards(s,[('MAKE THE CLAIM TESTABLE','Clarity · Accuracy · Precision\n\nCan we understand the claim and check it at the detail needed?'),('EXAMINE THE ANALYSIS','Relevance · Depth · Breadth\n\nDoes it address the decision, its complexity, and other viewpoints?'),('JUDGE THE WHOLE','Logic · Significance · Fairness\n\nDoes it fit together, address what matters, and treat people impartially?')])
std_data=[
('Clarity','Make the meaning understandable.','“Performance is worse” could refer to speed, accuracy, workload, or client experience.','Which aspect of performance changed?'),
('Accuracy','Check whether a claim matches trustworthy evidence.','Reconcile the count of late requests against dated records and a common deadline rule.','Which records could verify the timely rate?'),
('Precision','Add the detail the decision requires.','State the month, number of requests, deadline definition, and size of the change.','Which team, time period, and measure are involved?'),
('Relevance','Connect evidence to the question being decided.','The vendor’s brand recognition does not show whether routing errors caused delay.','How would this information affect our service decision?'),
('Depth','Address the difficult features and their interactions.','Case complexity, training, rework, capacity, and deadlines may interact.','Which obstacle makes a simple explanation inadequate?'),
('Breadth','Examine relevant alternative perspectives.','Compare what clients, staff, managers, and technical support see.','What would a careful critic of my position point out?'),
('Logic','Check whether the parts support one another.','A launch preceded delays; that sequence alone does not prove the launch caused them.','What connects these observations to this conclusion?'),
('Significance','Focus on what matters most to the decision.','An occasional cosmetic issue may matter less than routing errors that miss deadlines.','Which unresolved fact could most change our action?'),
('Fairness','Apply a defensible standard without favoring your own interests.','Compare evidence for the tool and against it using the same rules.','Would I accept this evidence if it supported the opposing view?')]
for names in [(0,1,2),(3,4,5),(6,7,8)]:
    s=slide(standards,' · '.join(std_data[i][0] for i in names),'Use these questions to improve a specific claim.',
        'Select a standard to see a worked example.',
        'FACILITATOR: Ask learners to use one standard on one element. Do not accept “we need more depth” without naming the complexity to examine. These nine are selected foundational standards, not an exhaustive list of all standards.')
    for j,i in enumerate(names):
        name,meaning,example,question=std_data[i]
        x=60+j*392
        s['layers'][0]['objects'] += [obj('shape',x=x,y=235,w=370,h=266,fill='#eaf2f8'),
            obj('text',name,x=x+14,y=252,w=342,h=58,font=30,bold=True),
            obj('text',meaning+'\n\n'+question,x=x+14,y=305,w=342,h=192,font=20)]
        reveal(s,'Example: '+name,name+' in the desk case',example,x=x,y=523,w=370,h=74)
choice(standards,'Practice: sharpen a vague claim','A supervisor says, “The tool is creating lots of delays.” Which request first improves precision?',[
    ('Specify how many delays, in which period, for which request types.',True,'This request supplies the necessary detail: count, period, and case categories. You can then check accuracy and examine whether the evidence supports the causal claim.'),
    ('Ask whether anyone likes the tool.',False,'Preferences may help explain adoption issues, but this question does not specify the asserted delays.'),
    ('Ask the supervisor to say the same thing more forcefully.',False,'Strength of delivery does not improve the claim’s detail or evidential support.'),
    ('Ask which competitor has the best marketing.',False,'Marketing information is not connected to measuring the desk’s delays. Relevance would also be a concern.')])
choice(standards,'Practice: examine another viewpoint','The analysis includes only the manager’s dashboard. Which question most directly adds breadth?',[
    ('Can we make the dashboard font larger?',False,'A clearer display can help reading, but it does not add a different perspective on the problem.'),
    ('What do clients, frontline staff, and support specialists report?',True,'Their perspectives may reveal waiting, rework, or technical issues the dashboard misses. Breadth requires understanding relevant viewpoints, not merely counting opinions.'),
    ('Can we repeat the manager’s explanation?',False,'Repeating one viewpoint does not test alternatives or add another perspective.'),
    ('Is the manager certain?',False,'Confidence can be discussed, but certainty is not a substitute for considering other perspectives.')])
s=slide(standards,'Audit this proposed decision','“Only 70% were timely. Ban the software tomorrow. Everyone knows it is bad.”',
    'WORKBOOK 3 · Rewrite the claim. Use three named standards to explain your improvements.',
    'FACILITATOR: Give three minutes. Request an original revision rather than copying the example. Ask partners to identify which element each standard improves. Multiple revisions can be defensible.')
cards(s,[('QUESTIONS TO ASK','Accuracy: are deadlines comparable?\nLogic: what establishes the cause?\nBreadth: whose evidence is absent?\nFairness: are we testing both sides?'),('A POSSIBLE REVISION','“The timely rate fell from 80% to 70%. Before choosing a remedy, compare case complexity, routing errors, and staff availability using the same measures.”')])
s=slide(standards,'Use the standards together','A claim may be clear and precise while remaining inaccurate or unfair.')
body(s,'Example: “Four of six employees complained on Tuesday” is specific.\n\nWe still need to know what they reported, how it was recorded, whether the reports address the decision, what perspectives are missing, and what conclusion the evidence supports.\n\nImprove the reasoning as a whole rather than awarding credit for one polished sentence.',font=28)

evidence=scene('04 · Test evidence and assumptions',17)
s=slide(evidence,'Separate information, inference, assumption','The same observation can support more than one explanation.')
cards(s,[('INFORMATION','Three requests reached the wrong queue.\n\nA recorded event, subject to verification.'),('INFERENCE','Routing errors may have contributed to delay.\n\nA conclusion drawn from the records.'),('ASSUMPTION','Those requests would otherwise have met their deadlines.\n\nA premise requiring a check.')])
choice(evidence,'Classify the statement','“The queue log records three requests sent to the wrong team.” What role does this play?',[
    ('Information to verify and interpret.',True,'The statement describes a record. Check its accuracy and meaning before using it. Its causal significance is a separate inference.'),
    ('Proof that all delays were caused by software.',False,'Three logged routing errors do not establish the cause of every late request.'),
    ('A complete decision about replacing the tool.',False,'Recorded information contributes to a decision; it does not supply all the needed reasoning.'),
    ('A prediction about next year’s staffing.',False,'The statement reports a current record, not a future staffing implication.')])
s=slide(evidence,'New evidence: the mix of requests changed','Compare categories before explaining an aggregate rate.',
    'WORKBOOK 4 · Update your baseline. Do not discard the decline in complex-case performance.',
    'FACILITATOR: Show the new figures. Simple cases: 84/96 = 87.5% last month; 96/108 = 88.9% this month. Complex cases: 12/24 = 50%; 30/72 = 41.7%. Complex-case share rose from 20% to 40%. The aggregate decline is not a uniform decline across categories. Neither this comparison nor the launch timing establishes the complete cause.')
cards(s,[('LAST MONTH','Simple: 84 timely / 96\nComplex: 12 timely / 24\n\nComplex requests: 20% of the workload.'),('THIS MONTH','Simple: 96 timely / 108\nComplex: 30 timely / 72\n\nComplex requests: 40% of the workload.'),('WHAT CHANGED?','Simple-case timeliness held steady. Complex-case timeliness fell. Complex requests became a larger share.\n\nWe still need process evidence.')])
choice(evidence,'Revise the explanation','What is the best conclusion after seeing the case-mix evidence?',[
    ('There is no service problem because simple cases improved.',False,'Complex-case timeliness fell, and the overall timely rate is lower. One improving category does not erase the service problem.'),
    ('Software is definitely harmless.',False,'Case mix matters, but the new evidence does not rule out a contribution from software errors or learning effects.'),
    ('The decline involves case mix and complex-case performance; investigate causes.',True,'This interpretation preserves what the records show while limiting the causal claim. Compare complex-case processing, rework, staffing availability, and routing errors.'),
    ('Complex requests should be ignored to improve the rate.',False,'That would change the measure by excluding a difficult group instead of improving service. It also fails to consider fairness and the actual purpose.')])
s=slide(evidence,'Design an assumption test','Choose a check that could change your conclusion.',
    'WORKBOOK 4 · Name one assumption, its test, and the finding that would lead you to revise it.')
cards(s,[('ASSUMPTION','Deadline rules stayed the same.\n\nTest: compare policy dates and a sample of request due dates.'),('ASSUMPTION','Staff availability stayed the same.\n\nTest: compare hours available for processing, training time, and absences.'),('ASSUMPTION','Routing errors account for many delays.\n\nTest: trace affected requests and compare their elapsed times.')])
s=slide(evidence,'Seek evidence that could challenge you','Support for your view is useful; a deliberate challenge may be more revealing.',
    'WORKBOOK 4 · Write a rival explanation and the evidence that would distinguish the two.')
cards(s,[('YOUR CURRENT VIEW','“Routing errors are the main cause.”\n\nAsk what you would expect to see if that were true.'),('A RIVAL VIEW','“Complex-case workload exceeds available capacity.”\n\nCompare error-free cases, workload patterns, and staff time. Both causes may contribute.')])
s=slide(evidence,'Revise with calibrated confidence','Make a decision while clearly stating what remains uncertain.',
    'WORKBOOK 4 · Rewrite your initial conclusion and explain what changed.',
    'FACILITATOR: Give two minutes. Ask participants to distinguish a lower confidence level from inaction. A provisional, reversible intervention can be justified while gathering evidence. The course does not demand that all uncertainty disappear.')
body(s,'A stronger statement: “We have a service problem concentrated in complex cases. Case mix and capacity need investigation, and routing errors may contribute. I recommend a short review of delayed cases and a reversible error correction while we compare explanations.”\n\nWhat changed in your conclusion? Which new record mattered most?',font=29)

traits=scene('05 · Build intellectual character',12)
s=slide(traits,'Reasoning skills need disciplined habits','Intellectual traits help you apply standards when the issue matters to you.')
cards(s,[('CHECK YOURSELF','Humility · Integrity\n\nAcknowledge limits and use the same evidence rules on your own claims.'),('ENGAGE OTHERS','Courage · Empathy · Fairmindedness\n\nExamine uncomfortable ideas and represent other views fairly.'),('KEEP THINKING','Autonomy · Perseverance · Confidence in reason\n\nForm reasoned judgments and stay with a difficult inquiry.')])
s=slide(traits,'Humility, integrity, and autonomy','Practice them as observable actions.')
cards(s,[('HUMILITY','“The log supports a concern, but I do not yet know its full impact.”\n\nName a limit before presenting your recommendation.'),('INTEGRITY','“I will apply the same comparison rules to my preferred option.”\n\nInspect evidence that makes your own proposal look weak.'),('AUTONOMY','“I value that advice; here is why I accept part of it.”\n\nExplain your judgment instead of relying on popularity or rank.')])
s=slide(traits,'Courage, empathy, and fairmindedness','Try to understand a competing position before evaluating it.')
cards(s,[('COURAGE','Ask about an uncomfortable explanation, including a mistake by your own team.'),('EMPATHY','Describe a client’s or colleague’s reasoning in terms they would recognize.'),('FAIRMINDEDNESS','Give a rival proposal a fair hearing and judge it by the same standards as yours.')])
s=slide(traits,'Perseverance and confidence in reason','Stay with uncertainty and let better reasons improve the decision.')
cards(s,[('PERSEVERANCE','When records conflict, identify the disagreement and pursue the next useful check.\n\nDo not replace inquiry with frustration.'),('CONFIDENCE IN REASON','Use reasons and evidence to settle the question as far as possible.\n\nKeep a justified recommendation open to revision when stronger evidence arrives.')])
choice(traits,'When your group agrees too quickly','Your team wants a fast rollout. A colleague identifies an untested assumption. What best demonstrates intellectual courage and integrity?',[
    ('Dismiss the concern to keep the team unified.',False,'Agreement may be comfortable but does not resolve the assumption. Unity is weaker when relevant doubts cannot be examined.'),
    ('Invite a test of the assumption, including evidence against your preference.',True,'You are willing to examine a difficult possibility and hold your own proposal to the same standards you would apply to a rival one.'),
    ('Reject every part of the rollout automatically.',False,'Intellectual independence does not require opposing the group. Evaluate the proposal and concern on their reasons.'),
    ('Ask the colleague to stop questioning after the vote.',False,'A vote can settle an action procedurally, but it does not make the underlying evidence stronger or resolve the assumption.')])
s=slide(traits,'Use a Socratic conversation','Follow a claim with questions that expose and improve the reasoning.',
    'WORKBOOK 5 · Pair up. One explains a decision; the other asks four questions without supplying the answer.',
    'FACILITATOR: Give four minutes in pairs. Questions must follow the partner’s actual claim. Model a curious tone. Process: Which question changed the reasoning? Which sounded like an accusation? Avoid presenting this short sequence as a complete reproduction of Paul and Elder’s Socratic questioning method.')
body(s,'“What exactly are you recommending?” → clarify the question.\n“Which evidence supports that?” → inspect information.\n“What are we taking for granted?” → examine assumptions.\n“How would another stakeholder understand this?” → broaden perspective.\n“What would make us revise the recommendation?” → test and revisit.',font=28)
s=slide(traits,'Watch for self-serving and group-serving reasoning','Treat your own position as something to examine.',
    'WORKBOOK 5 · Choose one habit to practice in your next meeting.')
cards(s,[('A SIGNAL TO NOTICE','“My experience is enough.”\n“Everyone on our team agrees.”\n“That finding cannot be right.”\n\nThese claims call for inspection, not automatic rejection.'),('A HABIT TO PRACTICE','Name your stake in the decision.\nInvite a reasoned challenge.\nSummarize a competing view fairly.\nRecord evidence that would change your mind.')])

cap=scene('06 · Capstone: the ClearPath decision',25)
s=slide(cap,'Capstone: expand a workflow pilot?','A second fictional case. Your team advises a director on a proposed organization-wide rollout.',
    'WORKBOOK 6 · Produce a 250–400 word decision brief. Suggested time: 25 minutes.',
    'FACILITATOR: Explain that ClearPath is a separate fictional case from the desk example. Allocate 3 minutes to orient, 5 to the reasoning map, 5 to an evidence audit, 5 to revision and implications, 4 to the brief, and 3 to a paired critique. A bounded pilot is an example, not the only acceptable recommendation; assess the quality and limits of the reasoning.')
cards(s,[('THE PROPOSAL','Expand ClearPath, a new workflow tool, to every service team next month.'),('THE PROMISE','A volunteer pilot team reported faster completion and fewer handoffs.'),('YOUR TASK','Recommend an action. Explain the evidence, uncertainty, stakeholder effects, and condition for review.')])
s=slide(cap,'Evidence packet A: the pilot report','A vendor compares one pilot team with one team using the existing workflow.',
    'WORKBOOK 6 · Identify what the comparison does and does not establish.')
cards(s,[('PILOT TEAM','60 requests\n54 completed on time\n90% timely\n\n6 complex requests\n6 volunteer employees'),('COMPARISON TEAM','80 requests\n56 completed on time\n70% timely\n\n32 complex requests\n6 employees'),('REPORT LIMITS','Two-week observation\nNo random assignment\nDifferent request mix\nVolunteers in the pilot\n\nError and rework rates not reported')])
choice(cap,'Decision checkpoint: what does 90% establish?','Which interpretation best fits the pilot report?',[
    ('The tool proved a 20 percentage-point causal improvement.',False,'The observed difference is 20 percentage points, but unequal case mix, volunteer selection, and other conditions limit the causal inference.'),
    ('The pilot is promising, but comparability and missing quality data need checking.',True,'The reported outcome supports further investigation. It does not isolate the tool’s effect or establish performance for harder work and a wider workforce.'),
    ('No result from a pilot can ever inform a decision.',False,'Limited evidence can inform a provisional action. The task is to describe its limits and seek a better comparison, not discard it automatically.'),
    ('The director’s preference settles whether the evidence is accurate.',False,'The director can choose an action, but the quality of the evidence must still be examined on its merits.')])
s=slide(cap,'Evidence packet B: three stakeholder views','Each viewpoint identifies something worth examining.',
    'WORKBOOK 6 · Represent each viewpoint fairly before choosing an action.')
cards(s,[('FRONTLINE STAFF','The tool reduces handoffs on routine work. Staff worry that complex requests need extra checks and training.'),('CLIENT REPRESENTATIVE','Faster response matters. Clients also need correct answers and a way to escalate unusual requests.'),('TECHNICAL SUPPORT','The pilot had dedicated support. The full rollout would have less support per team and unresolved exception routing.')])
s=slide(cap,'An evidence update changes the decision','An audit finds four duplicate pilot closures. Two were counted as timely completions.',
    'WORKBOOK 6 · Revise your analysis and identify the next useful checks.',
    'FACILITATOR: Do not silently recompute the rate without clarifying what counts as a request and which records are duplicates. If exactly two timely completions are invalid with the denominator unchanged, 52/60 = 86.7%; a denominator correction could produce a different rate. Reward learners who ask for reconciliation rather than invent a clean figure.')
cards(s,[('WHAT WE KNOW','The reported figures contain duplicate closures. Two affected the timely-completion count.'),('WHAT TO CLARIFY','Are duplicate closures extra status events or duplicate request records? Reconcile numerator, denominator, and the deadline rule.'),('WHY IT MATTERS','Accuracy changes the apparent benefit. The issue may also reveal a quality or measurement risk that should shape rollout conditions.')])
s=slide(cap,'Choose an action and defend its limits','Compare benefits, costs, reversibility, evidence needs, and stakeholder effects.',
    'WORKBOOK 6 · A defensible brief can recommend any option supported by the reasoning.')
cards(s,[('EXPAND NOW','What evidence is strong enough for the wider commitment? What safeguards and rollback triggers are needed?'),('PAUSE','Which unresolved issue justifies delay? What is the cost of waiting, and what evidence would restart the decision?'),('CONTINUE A BOUNDED PILOT','Which matched comparisons, quality checks, training conditions, and review date would resolve the major uncertainty?')])
s=slide(cap,'Write your decision brief','Use all three framework components. State a recommendation and show how you reached it.',
    'WORKBOOK 6 · Write your brief, compare it with the rubric, then confirm that you completed it.',
    'FACILITATOR: Assess eight criteria, each 0–2: purpose/question; evidence accuracy; information/inference separation; assumption testing; standards application; competing viewpoints/fairness; consequences/action; revision trigger. 0 = absent, 1 = partial or asserted, 2 = specific and supported. 12/16 is a suggested instructor review benchmark, not an automatically awarded course grade. Completion below is the learner’s own confirmation.')
s['layers'][0]['objects'].append(obj('text','Include: purpose and question; strongest evidence and its limits; two assumptions and tests; three standards applied; a fair competing viewpoint; consequences; your action; and evidence that would change your mind.\n\nSuggested review benchmark: 12/16 using the eight-criterion rubric in the workbook.',x=62,y=224,w=1150,h=246,font=27))
b=obj('button','I have completed and reviewed my decision brief',x=60,y=525,w=1000,h=70,font=24,fill='#174a74',color='#ffffff');s['layers'][0]['objects'].append(b)
trig(s,'click',b['id'],'variable',CAPSTONE,True)
done_layer=dict(id=uid(),name='Capstone completion recorded',modal=True,objects=[obj('shape',x=115,y=145,w=1050,h=405,fill='#ffffff'),obj('text','Your capstone confirmation is recorded.',x=160,y=185,w=955,h=95,font=34,bold=True),obj('text','This records your own confirmation, not an instructor grade. Continue to the learning assessment. Keep your brief for feedback and future comparison.',x=160,y=286,w=955,h=170,font=28)])
cb=obj('button','Continue',x=860,y=466,w=240,h=65,font=23,fill='#174a74',color='#ffffff');done_layer['objects'].append(cb);s['layers'].append(done_layer);trig(s,'click',b['id'],'show-layer',done_layer['id']);trig(s,'click',cb['id'],'hide-layer',done_layer['id'])

quiz=scene('07 · Check your learning',15)
s=slide(quiz,'Learning assessment','12 questions · 10 correct required · feedback and retries available.',
    'Use all 12 questions. You can change an answer; your latest choice counts.',
    'FACILITATOR: This is a formative learning assessment, not a secure qualification exam. Each answer overwrites its question variable, so repeated clicking never increases total points. Results are recomputed from the 12 current responses. Skipped questions cannot qualify for completion. Use explanations to discuss the reasoning behind answers.')
body(s,'Apply the framework to new claims and decisions.\n\nYou will see immediate feedback after each choice. Use Previous to reconsider a question, then return to Results to recalculate your score.\n\nCourse completion requires every question answered, at least 10 correct, and your capstone completion confirmation.',font=30)
qdata=[
('Purpose','Which statement most clearly states the purpose of a service review?',[
('Identify the employee to blame.',False,'That narrows inquiry to a presumed culprit without establishing what service outcome the review should achieve.'),
('Improve timely, accurate service while using capacity responsibly.',True,'This names the desired outcome and an important operating constraint. It can guide the question, information needs, and assessment of options.'),
('Prove that last year’s decision was correct.',False,'Defending a previous decision can distort the review. The purpose should serve the current problem rather than protect a conclusion.'),
('Collect as many charts as possible.',False,'Charts are a possible means of analysis, not the service outcome the review seeks.')]),
('Question at issue','Which question best opens an inquiry into recurring delays?',[
('Why are our employees careless?',False,'This presupposes a character-based explanation. That assumption should be tested instead of built into the question.'),
('Which manager deserves the credit?',False,'Credit allocation does not directly address what is producing delay or which remedy would help.'),
('Which conditions are contributing to delay, and which changes could improve service?',True,'The question invites competing explanations and connects the inquiry to action. It does not assume a cause before examining evidence.'),
('How can we make the report look better?',False,'Presentation alone does not address the service problem and can encourage a misleading measure.')]),
('Information and inference','A training session preceded a rise in errors. “The training caused the errors” is primarily…',[
('A causal inference that needs testing.',True,'The timing is information. Attributing the increase to training is an inference; competing changes and the causal mechanism require investigation.'),
('A verified observation about causation.',False,'The observation establishes sequence, not the training’s causal role.'),
('A complete statement of purpose.',False,'The statement explains an alleged cause. It does not state the outcome the inquiry is trying to achieve.'),
('A guarantee of future performance.',False,'It does not establish a reliable prediction, and the underlying causal explanation remains untested.')]),
('Assumptions','“Remote staff deliver less because they are not in the office.” What most needs testing?',[
('Whether the office has meeting rooms.',False,'That detail is not the main bridge supporting the conclusion about productivity.'),
('Whether visibility in the office is a sound indicator of delivered work.',True,'The explanation treats physical visibility as evidence of productivity. Compare work outputs, quality, workload, and comparable conditions.'),
('Whether employees have names.',False,'That premise does not explain the asserted relationship between location and performance.'),
('Whether managers prefer paper reports.',False,'A preference about report format does not establish the productivity inference.')]),
('Clarity and precision','“Many complaints came in recently.” Which revision best improves precision?',[
('“The complaints were very serious.”',False,'That adds an evaluation but no count, period, or defined category.'),
('“Everyone is unhappy.”',False,'The statement becomes broader without providing detail or supporting evidence.'),
('“The manager knows what happened.”',False,'Reference to authority does not specify the complaint data.'),
('“We recorded 18 response-time complaints between 1 and 14 September.”',True,'The count, category, and time window make the claim more specific. Accuracy still requires checking the records.')]),
('Accuracy','Two dashboards report different totals. Which response best applies accuracy?',[
('Choose the total that supports your proposal.',False,'Selecting a convenient result makes the conclusion self-serving and leaves the discrepancy unexplained.'),
('Average the totals without examining them.',False,'An average can conceal different definitions, duplicate records, or periods. Resolve the discrepancy first.'),
('Reconcile source records, date ranges, definitions, and duplicate handling.',True,'This checks how each figure was produced and determines which count fits the agreed measure.'),
('Use whichever dashboard looks more professional.',False,'Visual polish does not verify the underlying data.')]),
('Depth and breadth','Which action most directly improves breadth in a scheduling decision?',[
('Include relevant staff and client perspectives alongside the manager’s view.',True,'This adds perspectives that may reveal different needs and constraints. Examine their reasoning fairly rather than counting opinions.'),
('Add more decimal places to the average.',False,'Extra numerical detail relates to precision when warranted; it does not add a perspective.'),
('Repeat the same explanation three times.',False,'Repetition does not expand the viewpoints considered.'),
('Make the decision document longer.',False,'Length by itself does not establish broader consideration or deeper analysis.')]),
('Logic','Which conclusion follows most cautiously from a successful volunteer pilot?',[
('The tool will work equally well for every team.',False,'The pilot does not establish performance under all staffing, workload, and support conditions.'),
('The result warrants further testing under comparable and wider conditions.',True,'This preserves the favorable observation while recognizing limits in comparison and generalization.'),
('The comparison team must be less competent.',False,'A difference in outcomes does not establish a competence difference. Case mix and support may also differ.'),
('The vendor’s full claim has been proved.',False,'A limited observation cannot establish every causal and organization-wide claim.')]),
('Significance','You have time for one further check before a rollout decision. Which is most significant?',[
('Whether the report’s border is blue or gold.',False,'The report’s decoration has little bearing on the rollout’s service and quality effects.'),
('Whether a slide title could be shorter.',False,'Presentation can be improved later. It does not address the uncertainty most likely to change this decision.'),
('Whether the tool produces serious routing errors on complex requests.',True,'This fact could change the action, safeguards, and costs. It is closely connected to the decision’s main risks and intended outcome.'),
('Whether everyone liked the launch refreshments.',False,'That preference does not resolve the core service or implementation question.')]),
('Fairness and integrity','Which practice best demonstrates fairness and intellectual integrity?',[
('Demand stronger evidence from opponents than from your own team.',False,'That applies inconsistent standards according to whose interests the evidence serves.'),
('Remove contrary findings from the briefing.',False,'Omitting relevant contrary evidence prevents a fair assessment of the decision.'),
('Assume every position is equally supported.',False,'Fair consideration does not require treating weak and strong evidence as equivalent.'),
('Apply the same evidence rules to your proposal and competing proposals.',True,'You give alternatives a fair assessment and hold your own reasoning to the standards you ask of others.')]),
('Intellectual traits','Which statement best demonstrates intellectual humility?',[
('“I have never been wrong about this.”',False,'That claim discourages examination of limits or contrary evidence.'),
('“I cannot decide until uncertainty disappears completely.”',False,'Humility acknowledges limits while allowing proportionate, reasoned action. Complete certainty is rarely available.'),
('“My view is provisional; these two unresolved findings could change it.”',True,'You acknowledge what is not yet established and specify how evidence could revise your position.'),
('“The senior person’s belief must be true.”',False,'Uncritical reliance on rank does not demonstrate awareness of the limits of your knowledge.')]),
('Implications and revision','Which recommendation best accounts for implications and future revision?',[
('“Proceed, because that is what we already promised.”',False,'A promise may create a constraint but does not assess consequences or justify the action with current evidence.'),
('“Continue a bounded pilot, monitor accuracy and timeliness, and review if errors exceed the agreed limit.”',True,'The recommendation links action to outcomes, safeguards, and a condition for reassessment. The exact threshold should be justified and specified in the decision brief.'),
('“Do nothing and never revisit the issue.”',False,'This leaves consequences and future evidence unexamined.'),
('“Expand now and remove the reporting process.”',False,'Removing reporting weakens the ability to detect harm or revise the decision.')])]
for i,(title,question,options) in enumerate(qdata,1):choice(quiz,f'{i:02d} / 12 · {title}',question,options,assessed=True,number=i,notes=f'FACILITATOR: Assess applied reasoning rather than recall. The correct answer is {next(chr(65+j) for j,o in enumerate(options) if o[1])}. Use the choice-specific feedback to discuss misconceptions. Latest response counts; source question variable quiz_q{i:02d}.')
s=slide(quiz,'Your learning results','Your latest responses determine the current result.',
    'Use Review questions to revise a response. Return here to update the score.',
    'FACILITATOR: Enter triggers recompute score and response count. All 12 answered plus 10 correct plus capstone confirmation enables completion. These are local practice results; no server grade or LMS completion transfer is claimed.')
for vid in [SCORE,ANSWERED,PERCENT]:trig(s,'enter',s['id'],'variable',vid,0)
trig(s,'enter',s['id'],'variable',READY,False)
for q in questions:
    trig(s,'enter',s['id'],'variable',SCORE,1,cond(q['variable'],'eq',1),'add')
    trig(s,'enter',s['id'],'variable',ANSWERED,1,cond(q['variable'],'gte',0),'add')
for n in range(13):trig(s,'enter',s['id'],'variable',PERCENT,round(n/12*100),cond(SCORE,'eq',n))
trig(s,'enter',s['id'],'variable',READY,True,cond(SCORE,'gte',10))
trig(s,'enter',s['id'],'variable',READY,False,cond(ANSWERED,'lt',12))
trig(s,'enter',s['id'],'variable',READY,False,cond(CAPSTONE,'eq',False))
cards(s,[('KNOWLEDGE CHECK','Correct: {{quiz_score}} / 12\nScore: {{quiz_percent}}%\nAnswered: {{quiz_answered}} / 12'),('COMPLETION REQUIREMENTS','Answer all 12 questions.\nEarn at least 10 correct.\nConfirm your capstone brief.\n\nCapstone confirmed: {{capstone_done}}')])
# Move score panels up to leave clear button space.
for o in s['layers'][0]['objects'][5:]:
    if o['type']=='shape':o['h']-=70
    elif o['h']>200:o['h']-=65
review=obj('button','Review questions',x=60,y=543,w=480,h=65,font=23,fill='#e1ebf3',color='#174a74')
finish=obj('button','Complete course',x=620,y=543,w=550,h=65,font=23,fill='#174a74',color='#ffffff',initialState='disabled')
s['layers'][0]['objects'] += [review,finish]
trig(s,'enter',s['id'],'state',finish['id'],'disabled')
trig(s,'enter',s['id'],'state',finish['id'],'normal',cond(READY,'eq',True))
trig(s,'click',review['id'],'navigate',questions[0]['slide'])
trig(s,'click',finish['id'],'complete',condition=cond(READY,'eq',True))
results_id=s['id'];finish_id=finish['id']

transfer=scene('08 · Transfer and resources',5)
s=slide(transfer,'A seven-day transfer challenge','Choose one real decision and practice the framework deliberately.',
    'WORKBOOK 7 · Set a date and identify a colleague who can challenge your reasoning.')
cards(s,[('BEFORE THE DECISION','State your purpose and question. Identify one assumption and a test. Invite a relevant missing viewpoint.'),('DURING THE DISCUSSION','Use two standards on your own proposal. Summarize the strongest competing argument fairly.'),('AFTER THE DECISION','Record consequences and remaining uncertainty. Revisit the decision when your review trigger occurs.')])
s=slide(transfer,'Explain how your reasoning improved','Compare your final reasoning with your first conclusion.',
    'This reflection is a learning record. Keep it with your brief for future feedback.')
body(s,'Finish these sentences:\n\n• I initially thought…\n• The information or question that changed my reasoning was…\n• The assumption I now test is…\n• The standard I will use more deliberately is…\n• The intellectual trait I will practice is…\n• I will revisit my next decision when…',font=29)
s=slide(transfer,'Framework attribution and further study','Based on Richard Paul and Linda Elder’s critical thinking framework.',
    'Select Sources in the learner package for official reference links. Return to Results to complete.',
    'FACILITATOR: The framework belongs to its authors. All instructional cases and assessments here are original adaptations. This course is not an official Foundation for Critical Thinking certification. Do not reproduce proprietary guide pages or diagrams without permission. The official reference links are retained in courseMetadata.references.')
body(s,'The Foundation for Critical Thinking provides original resources on the elements of reasoning, intellectual standards, intellectual traits, and the distinction between inferences and assumptions.\n\nThis course uses original fictional cases and activities to practice those ideas. Continue using the framework on your own reasoning; one short course does not establish mastery of intellectual character.',font=28)
b=obj('button','Return to Results',x=60,y=550,w=400,h=60,font=23,fill='#174a74',color='#ffffff');s['layers'][0]['objects'].append(b);trig(s,'click',b['id'],'navigate',results_id)

P['courseMetadata']['assessmentSlides']=questions
P['courseMetadata']['resultsSlideId']=results_id
P['courseMetadata']['finishObjectId']=finish_id
P['courseMetadata']['capstoneSlideId']=cap['slides'][-1]['id']
P['courseMetadata']['capstoneObjectId']=cap['slides'][-1]['layers'][0]['objects'][-1]['id']
P['courseMetadata']['capstoneObjectId']=next(o['id'] for o in cap['slides'][-1]['layers'][0]['objects'] if o['type']=='button')
P['courseMetadata']['capstoneRubric']=[
    ('Purpose and question','State the outcome and a bounded question that guides the recommendation.'),
    ('Evidence and accuracy','Use case figures correctly; address duplicates and comparison limits.'),
    ('Information versus inference','Separate recorded observations from causal and predictive conclusions.'),
    ('Assumptions and tests','Identify two important assumptions and useful checks.'),
    ('Intellectual standards','Apply three named standards to improve specific parts of the reasoning.'),
    ('Viewpoints and fairness','Represent a competing perspective fairly and apply consistent evidence rules.'),
    ('Consequences and action','Compare benefits, risks, stakeholder effects, and a proportionate action.'),
    ('Revision and intellectual traits','Acknowledge limits and specify evidence or a review trigger that would change the decision.')]
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(P,ensure_ascii=False,separators=(',',':'))+'\n')
stats=dict(scenes=len(P['scenes']),slides=sum(len(sc['slides']) for sc in P['scenes']),variables=len(P['variables']),
    questions=len(questions),minutes=sum(sc['suggestedMinutes'] for sc in P['scenes']),bytes=OUT.stat().st_size)
print(json.dumps(stats))
