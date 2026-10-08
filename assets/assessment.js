(()=>{'use strict';const $=s=>document.querySelector(s);const questions=[
        ['I can explain the reasoning behind an important decision.','Clarity'],
        ['I actively seek perspectives different from my own.','Clarity'],
        ['I invite feedback about how my actions affect others.','Connection'],
        ['I adapt my communication for the person or situation.','Connection'],
        ['I translate broad priorities into manageable next steps.','Action'],
        ['I follow through on the commitments I make.','Action'],
        ['I regularly reflect on what worked and what did not.','Growth'],
        ['I make time to practice an area I want to improve.','Growth']
      ];
      const options=[['Not yet',1],['Sometimes',2],['Often',3],['Consistently',4]];
      const answers=Array(questions.length).fill(null);let current=0;
      const question=$('#question-text'),choices=$('#choices'),counter=$('#q-counter'),progress=$('#progress-value'),back=$('#back-question'),next=$('#next-question'),area=$('#q-area'),results=$('#assessment-result');
      function drawQuestion(){results.hidden=true;area.hidden=false;$('#q-progress').hidden=false;counter.textContent='Question '+(current+1)+' of 8';progress.style.width=(100*(current+1)/questions.length)+'%';question.textContent=questions[current][0];choices.replaceChildren();
        options.forEach(([label,value])=>{const b=document.createElement('button');b.type='button';b.className='choice';b.textContent=label;b.setAttribute('aria-pressed',String(answers[current]===value));b.addEventListener('click',()=>{answers[current]=value;drawQuestion()});choices.appendChild(b)});
        back.disabled=current===0;next.disabled=answers[current]===null;next.textContent=current===7?'View reflection →':'Next →';
      }
      function drawResults(){area.hidden=true;$('#q-progress').hidden=true;results.hidden=false;counter.textContent='Reflection complete';results.replaceChildren();const domains=['Clarity','Connection','Action','Growth'];const sums=Object.fromEntries(domains.map(d=>[d,0]));questions.forEach((q,i)=>{sums[q[1]]+=answers[i]});const max=domains.reduce((a,b)=>sums[a]>=sums[b]?a:b);const min=domains.reduce((a,b)=>sums[a]<=sums[b]?a:b);const descriptions={Clarity:'How you gather perspectives and explain decisions.',Connection:'How you communicate and build relationships.',Action:'How you turn priorities into consistent follow-through.',Growth:'How you reflect and improve deliberately.'};
        const box=document.createElement('div');box.className='result-box';const label=document.createElement('span');label.className='micro-heading';label.textContent='YOUR REFLECTION';const heading=document.createElement('h3');heading.textContent='Current strength: '+max;const detail=document.createElement('p');detail.textContent=descriptions[max];const focus=document.createElement('p');focus.textContent='Possible development focus: '+min+'. Choose one small behavior to practice this week.';box.append(label,heading,detail,focus);
        const list=document.createElement('div');list.className='result-box';const title=document.createElement('strong');title.textContent='Four areas (out of 8 points each)';list.append(title);domains.forEach(d=>{const row=document.createElement('div');row.className='score-row';const n=document.createElement('span');n.textContent=d;const v=document.createElement('strong');v.textContent=sums[d]+'/8';row.append(n,v);list.appendChild(row)});
        const note=document.createElement('p');note.className='note';note.textContent='This is an informal reflection, not a scientifically validated assessment. Your answers stay on this page.';const again=document.createElement('button');again.type='button';again.className='btn primary';again.textContent='Reflect again ↺';again.addEventListener('click',()=>{answers.fill(null);current=0;drawQuestion()});results.append(box,list,note,again);
      }
      back.addEventListener('click',()=>{if(current>0){current--;drawQuestion()}});
      next.addEventListener('click',()=>{if(answers[current]===null)return;if(current===7)drawResults();else{current++;drawQuestion()}});drawQuestion();
      })();