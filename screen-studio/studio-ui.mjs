export function createStudioUI() {
  const $=id=>document.getElementById(id);
  let currentState='ready',hasVideo=false;
  function view(name){
    document.body.dataset.view=name;
    document.querySelectorAll('[data-view-button]').forEach(button=>{const selected=button.dataset.viewButton===name;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    $('page-heading').textContent=name==='edit'?'Your recording':'Record a video';
    $('page-description').textContent=name==='edit'?'Review your video. Edit the words. Make it ready to share.':'Choose your capture mode and devices, then start recording.';
  }
  document.querySelectorAll('[data-view-button]').forEach(button=>button.onclick=()=>view(button.dataset.viewButton));
  $('new-video').onclick=()=>{view('record');$('record').focus();};
  $('open-notes').onclick=()=>{$('speaker-notes').open=true;view('record');$('speaker-notes').scrollIntoView({behavior:'smooth',block:'center'});};
  document.querySelectorAll('[data-capture]').forEach(button=>button.onclick=()=>{$('mode').value=button.dataset.capture;$('mode').dispatchEvent(new Event('change'));});
  view('record');
  return {sync(state,video,busy){
    hasVideo=video;
    if(state!==currentState){if(state==='editing'&&currentState==='stopping')view('edit');if(['recording','ready'].includes(state))view('record');currentState=state;}
    document.body.dataset.recording=String(['recording','paused','stopping'].includes(state));
    document.body.dataset.hasVideo=String(hasVideo);
    document.querySelectorAll('[data-view-button="edit"]').forEach(button=>button.disabled=!hasVideo||busy||['recording','paused','stopping'].includes(state));
    document.querySelectorAll('[data-capture]').forEach(button=>{button.disabled=$('mode').disabled;button.setAttribute('aria-pressed',String(button.dataset.capture===$('mode').value));});
    $('new-video').disabled=busy||['recording','paused','stopping'].includes(state);
  }};
}
