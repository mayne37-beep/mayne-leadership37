/** Curated, local emoji library for classroom broadcast overlays. No external
 * emoji service, network request or font asset required; native OS emoji fonts
 * are used by the video canvas and color glyphs may vary by platform. */
export const EMOJI_GROUPS = {
  reactions: { name:'Reactions', items:[
    ['😀','Big smile'],['😃','Happy face'],['😄','Beaming smile'],['😁','Big grin'],
    ['😂','Laughing tears'],['🤣','Rolling laughing'],['😊','Warm smile'],['😍','Heart eyes'],
    ['🥰','Smiling with hearts'],['😎','Cool sunglasses'],['🤩','Star struck'],
    ['🤔','Thinking face'],['🧐','Curious face'],['😮','Surprised face'],['😲','Amazed face'],
    ['😱','Shocked face'],['😅','Nervous laugh'],['🙃','Upside down'],['😬','Grimace'],
    ['😢','Crying face'],['😭','Loud crying'],['🥹','Happy tears'],['🥳','Party face'],
    ['🤯','Mind blown'],['😴','Sleepy face'],['😤','Determined face'],['😜','Winking tongue'],
    ['😇','Angel face'],['😉','Wink'],['😌','Relieved face']
  ]},
  gestures: { name:'Gestures', items:[
    ['👍','Thumbs up'],['👎','Thumbs down'],['👏','Clapping hands'],['🙌','Hands raised'],
    ['👋','Waving hand'],['👌','Okay hand'],['✌️','Victory fingers'],['🤝','Handshake'],
    ['🤙','Call me hand'],['✋','Raised hand'],['🖐️','Open hand'],['👊','Fist bump'],
    ['🤜','Right-facing fist'],['🤛','Left-facing fist'],['💪','Strong arm'],['🙏','Thank you hands'],
    ['🤞','Fingers crossed'],['🫶','Heart hands'],['🙋','Person raising hand'],
    ['🙇','Bowing person'],['🤦','Face palm'],['🤷','Shrug'],['👀','Eyes'],
    ['👉','Point right'],['👈','Point left'],['👆','Point up'],['👇','Point down']
  ]},
  classroom: { name:'Classroom', items:[
    ['📚','Books'],['📖','Open book'],['📘','Blue book'],['📒','Notebook'],
    ['📝','Writing notes'],['✏️','Pencil'],['💡','Great idea'],['🧠','Brainstorming'],
    ['🎓','Graduation cap'],['🏫','School'],['📊','Bar chart'],['📈','Growth chart'],
    ['📉','Declining chart'],['🗣️','Speaking head'],['💬','Speech bubble'],['🗨️','Chat bubble'],
    ['🎤','Microphone'],['🎯','Target'],['🧩','Puzzle piece'],['🔍','Magnifying glass'],
    ['⏰','Alarm clock'],['⏳','Hourglass'],['⌛','Time elapsed'],['📅','Calendar'],
    ['📌','Pushpin'],['🗂️','File dividers'],['🖥️','Desktop computer'],['💻','Laptop']
  ]},
  celebration: { name:'Celebrate', items:[
    ['🎉','Confetti celebration'],['🎊','Confetti ball'],['🏆','Trophy'],['🥇','Gold medal'],
    ['🥈','Silver medal'],['🥉','Bronze medal'],['🏅','Medal'],['⭐','Star'],
    ['🌟','Glowing star'],['✨','Sparkles'],['💫','Dizzy stars'],['🔥','Fire'],
    ['🚀','Rocket'],['🎁','Gift'],['🎈','Balloon'],['🎂','Birthday cake'],
    ['🎵','Musical note'],['🎶','Music notes'],['💯','100 percent'],['✅','Success check'],
    ['☑️','Checked box'],['✔️','Check mark'],['🥂','Celebration toast']
  ]},
  symbols: { name:'Symbols', items:[
    ['❤️','Red heart'],['🧡','Orange heart'],['💛','Yellow heart'],['💚','Green heart'],
    ['💙','Blue heart'],['💜','Purple heart'],['🖤','Black heart'],['🤍','White heart'],
    ['💖','Sparkling heart'],['💔','Broken heart'],['❗','Exclamation'],['❓','Question'],
    ['❌','Wrong answer'],['⭕','Circle'],['⚠️','Warning'],['🚫','Not allowed'],
    ['🔔','Bell'],['📢','Megaphone'],['💥','Impact'],['⚡','Lightning'],
    ['🔑','Key'],['🔒','Lock'],['🔓','Unlocked'],['🏁','Finish flag']
  ]},
  directions: { name:'Arrows', items:[
    ['⬆️','Up arrow'],['⬇️','Down arrow'],['⬅️','Left arrow'],['➡️','Right arrow'],
    ['↗️','Up right arrow'],['↘️','Down right arrow'],['↙️','Down left arrow'],
    ['↖️','Up left arrow'],['↔️','Horizontal arrows'],['↕️','Vertical arrows'],
    ['🔄','Repeat arrows'],['🔁','Loop arrows'],['🔴','Red circle'],['🟡','Yellow circle'],
    ['🟢','Green circle'],['🔵','Blue circle'],['⚫','Black circle'],['🟣','Purple circle'],
    ['🛑','Stop sign'],['🚦','Traffic signal']
  ]},
  fun: { name:'Fun', items:[
    ['🐻','Bear'],['🦉','Owl'],['🦅','Eagle'],['🐶','Dog'],['🐱','Cat'],
    ['🦊','Fox'],['🦋','Butterfly'],['🐝','Bee'],['🐢','Turtle'],['🦆','Duck'],
    ['☕','Coffee'],['🍕','Pizza'],['🍎','Apple'],['🍿','Popcorn'],['🍩','Donut'],
    ['⚽','Soccer ball'],['🏀','Basketball'],['🏈','Football'],['🎮','Game controller'],
    ['🎲','Dice'],['🪄','Magic wand'],['🌈','Rainbow'],['☀️','Sun'],
    ['🌙','Moon'],['🌍','Globe'],['🏕️','Camping'],['🎨','Art palette'],
    ['🧲','Magnet']
  ]},
};
export const EMOJI_LIST = Object.entries(EMOJI_GROUPS).flatMap(([category,group]) =>
  group.items.map(([emoji,label])=>({emoji,label,category})));
const EMOJI_BY_GLYPH = new Map(EMOJI_LIST.map(item=>[item.emoji,item]));
export const DEFAULT_EMOJI = '👏';
export function findEmoji(value) { return EMOJI_BY_GLYPH.get(value) || null; }
export function emojiOptions(category = 'all', query = '') {
  const term=String(query).trim().toLowerCase();
  return EMOJI_LIST.filter(item=>(category==='all' || item.category===category)
    && (!term || (item.label+' '+EMOJI_GROUPS[item.category].name+' '+item.emoji)
      .toLowerCase().includes(term)));
}
