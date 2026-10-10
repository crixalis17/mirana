import {FunctionTool} from '@google/adk';
import {z} from 'zod';
import type {Schema as VertexSchema} from '@google/genai';
import {vertexSchema} from './provider';

type Schema=Record<string,unknown>;
type Definition={name:string;description:string;inputSchema:Schema};

// Derive strict runtime parameters from the existing provider contracts instead
// of maintaining a second, less restrictive ADK tool schema.
export function createResearchFunctionTool(definition:Definition,execute:(input:Record<string,unknown>)=>Promise<unknown>) {
  const schema=definition.inputSchema;
  if(schema.type!=='object'||schema.additionalProperties!==false)throw new Error('Research tool requires a strict object schema.');
  const properties=schema.properties as Record<string,Schema>,required=schema.required as string[];
  const shape:Record<string,z.ZodTypeAny>={};
  for(const [name,field] of Object.entries(properties)) {
    let parameter:z.ZodTypeAny;
    if(field.type==='string') {
      let value=z.string().trim();
      if(typeof field.minLength==='number')value=value.min(field.minLength);
      if(typeof field.maxLength==='number')value=value.max(field.maxLength);
      if(typeof field.pattern==='string')value=value.regex(new RegExp(field.pattern));
      if(field.format==='uri')value=value.url();
      parameter=value;
    } else if(field.type==='integer') {
      let value=z.number().int();
      if(typeof field.minimum==='number')value=value.min(field.minimum);
      if(typeof field.maximum==='number')value=value.max(field.maximum);
      parameter=value;
    } else throw new Error('Research tool parameter type is unsupported.');
    shape[name]=required.includes(name)?parameter:parameter.optional();
  }
  const parameters=z.object(shape).strict();
  const requests=new Map<string,Promise<unknown>>();
  return new FunctionTool({name:definition.name,description:definition.description,
    parameters:vertexSchema(schema) as VertexSchema,
    // A plain Vertex declaration is descriptive in ADK, so validate the full
    // strict schema here before any quota reservation or provider dispatch.
    execute:input=>{
      const parsed=parameters.parse(input),key=JSON.stringify(parsed);
      let result=requests.get(key);
      if(!result){result=execute(parsed);requests.set(key,result);}
      return result;
    }});
}
