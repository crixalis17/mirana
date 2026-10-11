import type {MiranaTool} from '../webmcp';

export function createResearchAllowanceTools(request:(grant:boolean)=>Promise<unknown>):MiranaTool[]{
  return [false,true].map(grant=>({
    name:grant?'mirana_admin_refresh_test_limit':'mirana_admin_research_allowance',
    description:grant?'Allow the verified Mirana owner one extra research job when the rolling daily limit is reached. It does not start research, reset provider credits, erase usage or change public limits. Starting the next test can consume paid credits.':'Read the verified Mirana owner’s rolling research counts and pending one-test allowance.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:!grant,untrustedContentHint:true,consequentialHint:grant},
    execute:async(input:unknown)=>{
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return {ok:false,error:'Use an empty input object.',kind:'validation'};
      try{return await request(grant);}catch{return {ok:false,error:'Owner research allowance is unavailable.',kind:'request'};}
    },
  }));
}
