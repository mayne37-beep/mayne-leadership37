// A startup boundary keeps dependency failures observable without exposing student data.
export const config={maxDuration:30};
let implementation;
export default async function handler(req,res){
 try{implementation||=import('../dist/challenge-server.mjs');return await (await implementation).default(req,res);}
 catch(error){
  console.error(JSON.stringify({component:'challenge-startup',name:error.name,message:error.message}));
  res.setHeader('Cache-Control','no-store');
  let diagnostic=false;try{diagnostic=process.env.CHALLENGE_STUDIO_GATEWAY_KEY&&req.headers['x-lcs-diagnostic']===process.env.CHALLENGE_STUDIO_GATEWAY_KEY&&new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{}
  return res.status(503).json({error:'The game service could not start. Please reconnect shortly.',...(diagnostic?{diagnostic:{name:error.name,message:error.message}}:{})});
 }
}
