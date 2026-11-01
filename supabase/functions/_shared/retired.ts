// Keep old URLs explicit without retaining a second integration implementation.
export function retiredIntegration(name:string){
 return Response.json({error:name+' has been retired. Use the shared calendars and Brevo invitation settings in Family Calendar.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
