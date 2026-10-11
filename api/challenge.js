// A startup boundary keeps dependency failures observable without exposing student data.
export const config={maxDuration:30};
let implementation;
export default async function handler(req,res){
 try{implementation||=import('../dist/challenge-server.mjs');return await (await implementation).default(req,res);}
 catch(error){
  console.error(JSON.stringify({component:'challenge-startup',name:error.name,message:error.message}));
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'The game service could not start. Please reconnect shortly.'});
 }
}
