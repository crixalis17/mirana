export const runtime="nodejs";
import {cookie,hash,cookieHeader} from '@/lib/auth';import {body,db,fail} from '@/lib/store';
export async function POST(request:Request){try{await body(request);const token=cookie(request,'mirana_session');if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await hash(token)).run();return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader(request,'mirana_session','',0)}})}catch(e){return fail(e)}}
