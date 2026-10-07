import {body} from '@/lib/store';
import {authorizeMachine} from '@/lib/machine-auth';
import {getResearchQueue,saveResearchResult,AutomationError} from '@/lib/automation';
export const runtime='nodejs';
export async function GET(request:Request){
  const rejected=authorizeMachine(request);if(rejected)return rejected;
  return Response.json(await getResearchQueue({all:new URL(request.url).searchParams.get('all')==='1'}),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const rejected=authorizeMachine(request);if(rejected)return rejected;
  try{return Response.json(await saveResearchResult(await body(request)));}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Request failed.'},{status:e instanceof AutomationError?e.status:400});}
}
