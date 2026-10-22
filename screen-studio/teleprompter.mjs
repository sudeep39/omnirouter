export function createTeleprompter(host) {
  host.innerHTML = `<div class="prompt-head"><h3>Teleprompter</h3><label><input id="prompt-enabled" type="checkbox"> Preview in app</label></div>
    <div id="prompt-settings"><label class="prompt-script">Your script <textarea id="prompt-script" rows="5" placeholder="Paste your script here. Practice at your own pace, then record." maxlength="100000"></textarea></label>
    <div class="prompt-options"><label>Pace <input id="prompt-pace" type="range" min="40" max="240" step="5" value="120"><output id="prompt-pace-label">120 words/min</output></label><label>Text size <input id="prompt-size" type="range" min="20" max="64" value="32"></label><label><input id="prompt-mirror" type="checkbox"> Mirror text</label><label><input id="prompt-sync" type="checkbox" checked> Follow recording</label></div></div>
    <div id="prompt-reader" hidden><div class="prompt-guide" aria-hidden="true">▶</div><div id="prompt-scroll" tabindex="0" role="region" aria-label="Teleprompter script. Space to pause, arrow keys to scroll."><div id="prompt-text"></div></div></div>
    <div class="prompt-actions"><button id="prompt-play" disabled>Start scrolling</button><button id="prompt-rewind">Back to start</button><button id="prompt-float" class="primary">Float over shared screen</button><button id="prompt-focus">Focus reader</button><span id="prompt-status" role="status">Paste a script to get started.</span></div><p class="prompt-hint">Space: play/pause · ↑/↓: scroll · +/−: change pace · Esc: leave focus. Scroll manually anytime. Reader is separate from the recording canvas; sharing this tab or entire screen can still capture it.</p>`;
  let floatingWindow = null;
  const animationWindow = () => floatingWindow || window;
  const el = id => host.querySelector(`#${id}`);
  let running = false, frame = 0, previous = null, recordingState = 'ready', lastState = 'ready';
  let position = 0, pixelsPerWord = 0;
  const save = () => {try {localStorage.setItem('screen-studio-prompter', JSON.stringify({script:el('prompt-script').value,pace:+el('prompt-pace').value,size:+el('prompt-size').value,mirror:el('prompt-mirror').checked,sync:el('prompt-sync').checked,enabled:el('prompt-enabled').checked}));} catch {}};
  try {const saved = JSON.parse(localStorage.getItem('screen-studio-prompter')); if(saved){el('prompt-script').value=String(saved.script||'').slice(0,100000);el('prompt-pace').value=Math.min(240,Math.max(40,Number(saved.pace)||120));el('prompt-size').value=Math.min(64,Math.max(20,Number(saved.size)||32));for(const k of ['mirror','sync','enabled'])if(typeof saved[k]==='boolean')el(`prompt-${k}`).checked=saved[k];}} catch {}
  const hasText = () => !!el('prompt-script').value.trim();
  function measure(){const text=el('prompt-text');pixelsPerWord=text.offsetHeight/Math.max(1,el('prompt-script').value.trim().split(/\s+/u).length);}
  function status(message){el('prompt-play').textContent=running?'Pause scrolling':'Start scrolling';el('prompt-play').disabled=!hasText();el('prompt-status').textContent=message||(running?'Scrolling':hasText()?'Ready to read':'Paste a script to get started.');}
  function pause(message){running=false;animationWindow().cancelAnimationFrame(frame);previous=null;status(message);}
  function tick(now){if(!running)return;const viewport=el('prompt-scroll');if(previous!==null){position+=Math.min((now-previous)/1000,.1)*pixelsPerWord*Number(el('prompt-pace').value)/60;viewport.scrollTop=position;}previous=now;if(viewport.scrollTop>=viewport.scrollHeight-viewport.clientHeight-1){pause('End of script');return;}frame=animationWindow().requestAnimationFrame(tick);}
  function play(){if(running||!hasText())return;el('prompt-enabled').checked=true;update();measure();const viewport=el('prompt-scroll');if(viewport.scrollTop>=viewport.scrollHeight-viewport.clientHeight-1)viewport.scrollTop=0;position=viewport.scrollTop;running=true;previous=null;status();frame=animationWindow().requestAnimationFrame(tick);}
  function rewind(){el('prompt-scroll').scrollTop=0;position=0;previous=null;status();}
  function update(){el('prompt-reader').hidden=!el('prompt-enabled').checked;el('prompt-text').textContent=el('prompt-script').value;el('prompt-text').style.fontSize=`${el('prompt-size').value}px`;el('prompt-text').classList.toggle('mirrored',el('prompt-mirror').checked);el('prompt-pace-label').textContent=`${el('prompt-pace').value} words/min`;measure();position=el('prompt-scroll').scrollTop;status();save();}
  el('prompt-script').addEventListener('input',()=>{pause();update();rewind();});
  for(const k of ['pace','size','mirror','sync'])el(`prompt-${k}`).addEventListener('input',update);
  el('prompt-enabled').addEventListener('change',()=>{if(!el('prompt-enabled').checked){pause();host.classList.remove('prompt-focused');}update();});
  el('prompt-play').onclick=()=>running?pause():play();el('prompt-rewind').onclick=rewind;
  el('prompt-focus').onclick=()=>{el('prompt-enabled').checked=true;host.classList.toggle('prompt-focused');el('prompt-focus').textContent=host.classList.contains('prompt-focused')?'Leave focus':'Focus reader';update();el('prompt-scroll').focus();};
  el('prompt-scroll').addEventListener('wheel',()=>pause('Manual scroll — start scrolling to continue'),{passive:true});
  el('prompt-scroll').addEventListener('pointerdown',()=>pause('Manual scroll — start scrolling to continue'));
  host.addEventListener('keydown',event=>{if(event.target.matches('textarea,input,select')||event.ctrlKey||event.metaKey||event.altKey)return;if(event.key==='Escape'){host.classList.remove('prompt-focused');el('prompt-focus').textContent='Focus reader';measure();return;}if(event.code==='Space'){event.preventDefault();running?pause():play();}if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();pause();el('prompt-scroll').scrollTop+=event.key==='ArrowUp'?-80:80;}if(['+','=','-'].includes(event.key)){event.preventDefault();el('prompt-pace').value=Math.min(240,Math.max(40,Number(el('prompt-pace').value)+(event.key==='-'?-5:5)));update();}});
  const observer=new ResizeObserver(()=>{measure();position=el('prompt-scroll').scrollTop;});observer.observe(el('prompt-scroll'));
  const home=document.createElement('div');host.before(home);home.hidden=true;home.className='prompt-home';
  const homeNote=document.createElement('p');homeNote.textContent='Teleprompter is floating over your presentation. Drag its title bar to the shared display and resize its edges.';
  const homeButton=document.createElement('button');homeButton.textContent='Return teleprompter to app';homeButton.onclick=()=>floatingWindow?.close();home.append(homeNote,homeButton);
  function restore(){if(!floatingWindow)return;pause();host.remove();home.after(host);host.classList.remove('prompt-floating');floatingWindow=null;home.hidden=true;el('prompt-float').textContent='Float over shared screen';el('prompt-enabled').checked=false;update();status('Floating reader closed. Open it again to continue.');}
  async function openFloating(){
    if(floatingWindow&&!floatingWindow.closed){floatingWindow.focus();return true;}
    if(!hasText()){status('Paste a script before opening the floating reader.');el('prompt-script').focus();return;}
    const wasRunning=running;pause();
    try{
      let target;
      if(window.documentPictureInPicture?.requestWindow){target=await window.documentPictureInPicture.requestWindow({width:640,height:440});}
      else{target=window.open('','screen-studio-teleprompter','popup,width=640,height=440');if(!target)throw new Error('Allow popups to open the reader.');}
      floatingWindow=target;target.document.title='Screen Studio — Teleprompter';
      const style=target.document.createElement('style');style.textContent=[...document.styleSheets].map(sheet=>[...sheet.cssRules].map(rule=>rule.cssText).join('')).join('');target.document.head.append(style);
      target.document.body.classList.add('prompt-window');host.classList.remove('prompt-focused');host.classList.add('prompt-floating');target.document.body.append(host);home.hidden=false;
      el('prompt-enabled').checked=true;el('prompt-float').textContent='Return to app';update();status(window.documentPictureInPicture?'Always on top — drag this window over your presentation.':'Floating popup — keep this window visible; this browser cannot pin it on top.');
      target.addEventListener('pagehide',restore,{once:true});target.addEventListener('resize',measure);
      if(wasRunning)play();target.focus();return true;
    }catch(error){if(floatingWindow){floatingWindow.close();restore();}status(`Could not open floating reader. ${error.message}`);throw error;}
  }
  el('prompt-float').onclick=()=>{if(floatingWindow&&!floatingWindow.closed)floatingWindow.close();else openFloating().catch(()=>{});};
  window.addEventListener('pagehide',()=>floatingWindow?.close());
  document.addEventListener('visibilitychange',()=>{previous=null;});
  update();
  return {async prepareForRecording(enabled){if(!enabled||!hasText()||(floatingWindow&&!floatingWindow.closed))return false;await openFloating();return true;},sync(next){recordingState=next;if(recordingState===lastState)return;const prior=lastState;lastState=next;if(!el('prompt-sync').checked)return;if(next==='recording'){if(prior!=='paused')rewind();if(el('prompt-enabled').checked)play();}else if(['paused','stopping','editing','ready'].includes(next))pause(next==='paused'?'Recording paused':undefined);},restart(){if(el('prompt-sync').checked){rewind();if(el('prompt-enabled').checked)play();}}};
}
