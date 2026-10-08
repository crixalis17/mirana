import {cookies} from 'next/headers';
import {config,emailReady,googleReady,user} from '@/lib/auth';
import WorkspaceClient,{type InitialSession} from './workspace-client';

export default async function Home(){
  const cookieStore=await cookies();
  const initialSession:InitialSession={user:null,googleReady:googleReady(),emailReady:emailReady()};
  try{
    const request=new Request(config().APP_ORIGIN||'http://localhost',{
      headers:{cookie:cookieStore.toString()},
    });
    initialSession.user=await user(request);
  }catch{
    initialSession.error='Could not check your session. Please retry.';
  }
  return <WorkspaceClient initialSession={initialSession}/>;
}
