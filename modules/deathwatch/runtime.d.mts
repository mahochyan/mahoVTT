export type Request = {method:string;tail:string[];readBody:()=>Promise<unknown>};
export type Descriptor = {id:string;name:string;subtitle:string;rulesetId:string;route:string;creationRoute:string;phase:'experimental';description:string;features:string[];disclaimer:string};
export const descriptor:Descriptor;
export function createRuntime(deps:{dataDir:string;getConfig:()=>any}):{descriptor:Descriptor;close():void;handle(req:Request):Promise<{data:unknown;status:number}>};
