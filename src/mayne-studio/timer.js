// Shared classroom countdown state. The clock is global; displaying it is
// controlled independently by an explicit timer layer in each scene.
export const TIMER_STYLES = {
  digital: 'Digital', ring: 'Circular', bar: 'Progress bar',
  traffic: 'Traffic light', fullscreen: 'Full screen',
};
export const TIMER_ENDINGS = { stop: 'Stop at zero', overtime: 'Count up overtime' };
export const TIMER_BACKGROUNDS = {
  solid: 'Dark panel', glass: 'Translucent panel', transparent: 'Transparent',
};
export const MAX_TIMER_SECONDS = 86399;
export const BUILTIN_TIMER_PRESETS = [1, 3, 5, 10, 15, 30];
export function timerParts(seconds) {
  const n=Math.max(0,Math.min(MAX_TIMER_SECONDS,Math.floor(Number(seconds)||0)));
  return {
    h: String(Math.floor(n/3600)).padStart(2,'0'),
    m: String(Math.floor(n%3600/60)).padStart(2,'0'),
    s: String(n%60).padStart(2,'0'),
  };
}
export function parseTimerFields(h,m,s) {
  const items=[h,m,s].map(n=>String(n ?? '').trim());
  if(items.some(x=>!/^\d{1,2}$/.test(x)))return null;
  const [hours,minutes,seconds]=items.map(Number);
  if(hours>23||minutes>59||seconds>59)return null;
  const n=hours*3600+minutes*60+seconds;
  return n>0&&n<=MAX_TIMER_SECONDS?n:null;
}
export function timerText(seconds, forceHours = false) {
  const value=Math.max(0,Math.floor(Math.abs(seconds)));
  const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;
  const two=n=>String(n).padStart(2,'0');
  return (forceHours||h>0 ? two(h)+':' : '')+two(m)+':'+two(s);
}
export function newTimer(duration=300, visible=false) {
  return {visible,deadline:0,remaining:duration,total:duration,finished:false,completedAt:0};
}
/** Advance using a monotonic deadline, immune to scene switches or render lag.
 * Returns true exactly once on completion so audio cues are not repeated.
 */
export function tickTimer(timer,now,end='stop') {
  if(!timer.deadline)return false;
  timer.remaining=(timer.deadline-now)/1000;
  if(timer.remaining>0)return false;
  const newlyFinished=!timer.finished;
  if(newlyFinished){timer.finished=true;timer.completedAt=now;}
  if(end!=='overtime'){
    timer.remaining=0;
    timer.deadline=0;
  }
  return newlyFinished;
}
export function pauseTimer(timer,now) {
  if(!timer.deadline)return false;
  timer.remaining=(timer.deadline-now)/1000;
  timer.deadline=0;
  return true;
}
export function startTimer(timer,now,duration) {
  if(timer.deadline)return false;
  // A paused overtime count resumes counting up from its negative offset.
  if(timer.remaining<=0 && !(timer.finished && timer.remaining<0)){
    timer.remaining=duration;timer.finished=false;timer.completedAt=0;
  }
  timer.total=timer.total || duration;
  timer.deadline=now+timer.remaining*1000;
  timer.visible=true;
  return true;
}
export function resetTimer(timer,duration) {
  timer.deadline=0;timer.remaining=duration;timer.total=duration;
  timer.finished=false;timer.completedAt=0;
}
export function setTimerDuration(timer,seconds,now) {
  resetTimer(timer,seconds);
  // Do not silently restart an already running countdown on duration editing.
  return timer;
}
export function adjustTimer(timer,delta,now,max=MAX_TIMER_SECONDS) {
  // For overtime, adding seconds should be able to bring the timer back above zero.
  const value=Math.max(-max,Math.min(max,timer.deadline
    ? (timer.deadline-now)/1000+delta:timer.remaining+delta));
  timer.remaining=value;
  if(value>0){timer.finished=false;timer.completedAt=0;}
  if(timer.deadline)timer.deadline=now+value*1000;
  return timer.remaining;
}
