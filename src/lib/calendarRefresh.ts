// Lifecycle triggers only: event loading stays in the page's existing loaders.
export function startCalendarRefresh(refresh:()=>Promise<unknown>,environment={window,document,navigator},intervalMs=60000){
 let stopped=false,pending=false;
 const run=()=>{
  if(stopped||pending||environment.document.hidden||environment.navigator.onLine===false)return;
  pending=true;
  void Promise.resolve().then(refresh).catch(()=>{}).finally(()=>{pending=false});
 };
 const timer=environment.window.setInterval(run,intervalMs);
 const events=['focus','pageshow','online'];
 for(const event of events)environment.window.addEventListener(event,run);
 environment.document.addEventListener('visibilitychange',run);
 run();
 return ()=>{
  stopped=true;environment.window.clearInterval(timer);
  for(const event of events)environment.window.removeEventListener(event,run);
  environment.document.removeEventListener('visibilitychange',run);
 };
}
