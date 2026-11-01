// Classification and appointment extraction have distinct prompts, but one transport contract.
export function groqCompletion(apiKey:string,system:string,description:string){
 return fetch('https://api.groq.com/openai/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model:'openai/gpt-oss-20b',temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:description}]})
 });
}
