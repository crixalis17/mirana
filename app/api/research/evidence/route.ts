import {user} from '@/lib/auth';
import {getOwnedResearchEvidence} from '@/lib/research/evidence-view';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noCache={'Cache-Control':'private, no-store','Vary':'Cookie'};

export async function GET(request:Request) {
  try {
    const identity=await user(request);
    if(!identity||identity.provider!=='google'||identity.emailVerified!==true||identity.preview!==false||typeof identity.id!=='string'||!identity.id)
      return Response.json({error:'Sign in with Google to view research evidence.'},{status:401,headers:noCache});
    const params=new URL(request.url).searchParams,id=params.get('purchaseId'),includeOriginalText=params.get('includeOriginalText');
    if(!id||id.length>100||[...params.keys()].some(name=>!['purchaseId','includeOriginalText'].includes(name))||
      includeOriginalText!==null&&!['true','false'].includes(includeOriginalText))
      return Response.json({error:'Choose a valid shopping item.'},{status:400,headers:noCache});
    const evidence=await getOwnedResearchEvidence(id,identity.id,{includeOriginalText:includeOriginalText==='true'});
    return evidence?Response.json(evidence,{headers:noCache}):Response.json({error:'Research evidence not found.'},{status:404,headers:noCache});
  }catch{return Response.json({error:'Research evidence is temporarily unavailable.'},{status:503,headers:noCache});}
}
