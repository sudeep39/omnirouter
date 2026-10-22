import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile,unlink,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
const root=fileURLToPath(new URL('../',import.meta.url)), data=path.join(root,'recordings');
const run=(bin,args)=>new Promise((resolve,reject)=>{const child=spawn(bin,args,{windowsHide:true});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('close',c=>c?reject(new Error(stderr)):resolve(stdout));});
test('recorder and transcript workflows in Edge with fixture capture and injected AI', {timeout:120000}, async()=>{
  process.env.PORT='4319';const {server,render}=await import('../server.mjs');
  const dir=await mkdtemp(path.join(tmpdir(),'screen-studio-browser-'));let browser;
  const uploaded=[],outputs=[],pageErrors=[];let replacements=0,transcriptions=0;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4319,'127.0.0.1',resolve);});
  try {
    const speech=path.join(dir,'replacement.wav');await run(ffmpeg,['-y','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','0.4',speech]);
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage({viewport:{width:1450,height:1100}});page.on('pageerror',e=>pageErrors.push(e.message));page.on('dialog',d=>d.accept());
    // Real MediaRecorder/compositor, fake webcam/mic, real HTTP upload and FFmpeg.
    // The OS screen picker, recognition service and paid provider are fixtures.
    await page.addInitScript(()=>{
      window.displayCalls=0;
      navigator.mediaDevices.getDisplayMedia=async()=>{window.displayCalls++;const c=document.createElement('canvas');c.width=640;c.height=360;const context=c.getContext('2d');let frame=0;setInterval(()=>{context.fillStyle=frame++%2?'#4aa5d0':'#1f375b';context.fillRect(0,0,640,360);context.fillStyle='white';context.fillRect(frame%550,100,80,80);},30);return c.captureStream(30);};
      class Recognition {
        start(){this.timers=[setTimeout(()=>this.onspeechstart?.(),100),setTimeout(()=>{const result=Object.assign([{transcript:'Hello rolling'}],{isFinal:false});this.onresult?.({resultIndex:0,results:[result]});},250),setTimeout(()=>{const result=Object.assign([{transcript:'Hello rolling transcript.'}],{isFinal:true});this.onresult?.({resultIndex:0,results:[result]});},600)];}
        abort(){this.timers?.forEach(clearTimeout);} stop(){this.abort();}
      }
      window.SpeechRecognition=Recognition;
    });
    await page.route('**/api/status',route=>route.fulfill({json:{ai:true}}));
    await page.route('**/api/transcribe',async route=>{transcriptions++;await route.fulfill({json:{segments:[{start:0,end:2.5,text:'Hello wrong world again.',action:'keep',words:[{text:'Hello',start:.2,end:.6},{text:'wrong',start:.7,end:1},{text:'world',start:1.1,end:1.5},{text:'again.',start:1.6,end:2.1}]}],language:'english'}});});
    await page.route('**/api/analyze-gaps',route=>route.fulfill({json:{duration:3,candidates:[{start:2.2,end:2.5,kind:'gap',text:'Quiet audio gap',selected:true}]}}));
    await page.route('**/api/render',async route=>{
      const {id,segments,voice,cleanupCuts=[]}=route.request().postDataJSON();
      const result=await render(path.join(data,id),segments,voice,async(endpoint,payload)=>{assert.equal(endpoint,'speech');assert.equal(payload.input,'Updated');replacements++;return new Response(await readFile(speech));},cleanupCuts);
      outputs.push(result.filename);await route.fulfill({json:result});
    });
    page.on('response',async response=>{if(response.url().endsWith('/api/recordings')&&response.status()===200)uploaded.push(await response.json());});
    await page.goto('http://127.0.0.1:4319');await page.waitForFunction(()=>document.querySelector('#ai-note').textContent.includes('AI connected'));
    await mkdir(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','recorder-qa.png'),fullPage:true});
    await page.click('#open-notes');
    // Teleprompter rehearsal, manual scrolling, settings, focus and persisted script.
    await page.fill('#prompt-script',Array.from({length:40},(_,i)=>`Paragraph ${i+1}. Speak naturally and keep a steady pace.`).join('\n\n'));
    await page.check('#prompt-enabled');await page.click('#prompt-play');
    await page.waitForFunction(()=>document.querySelector('#prompt-scroll').scrollTop>10);
    await page.click('#prompt-play');const promptPaused=await page.evaluate(()=>{const d=documentPictureInPicture.window?.document||document;return d.querySelector('#prompt-scroll').scrollTop;});
    await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>{const d=documentPictureInPicture.window?.document||document;return d.querySelector('#prompt-scroll').scrollTop;}),promptPaused);
    await page.locator('#prompt-pace').fill('180');assert.match(await page.locator('#prompt-pace-label').textContent(),/180/);
    await page.check('#prompt-mirror');assert.match(await page.locator('#prompt-text').getAttribute('class'),/mirrored/);
    await page.click('#prompt-focus');assert.ok(await page.locator('#teleprompter').evaluate(el=>el.classList.contains('prompt-focused')));
    await page.locator('#prompt-scroll').press('ArrowDown');assert.ok(await page.evaluate(()=>{const d=documentPictureInPicture.window?.document||document;return d.querySelector('#prompt-scroll').scrollTop;})>promptPaused);
    await page.locator('#prompt-scroll').press('Escape');assert.equal(await page.locator('#teleprompter').evaluate(el=>el.classList.contains('prompt-focused')),false);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#ai-note').textContent.includes('AI connected'));
    assert.match(await page.locator('#prompt-script').inputValue(),/Paragraph 40/);assert.equal(await page.locator('#prompt-pace').inputValue(),'180');
    // Real Document PiP: controls and animation live in the floating window.
    assert.ok(await page.evaluate(()=>!!window.documentPictureInPicture?.requestWindow));
    await page.click('#open-notes');await page.click('#prompt-float');await page.waitForFunction(()=>!document.querySelector('.prompt-home').hidden);
    assert.equal(await page.locator('#prompt-reader').count(),0);
    assert.ok(await page.evaluate(()=>documentPictureInPicture.window.document.querySelector('#prompt-reader')));
    await page.evaluate(()=>{const d=documentPictureInPicture.window.document;d.querySelector('#prompt-pace').value='40';d.querySelector('#prompt-pace').dispatchEvent(new Event('input'));d.querySelector('#prompt-play').click();});
    const other=await browser.newPage();await other.goto('about:blank');await other.bringToFront();
    await page.waitForFunction(()=>documentPictureInPicture.window.document.querySelector('#prompt-scroll').scrollTop>10,{}, {polling:100,timeout:5000});
    await page.evaluate(()=>{const doc=documentPictureInPicture.window.document;doc.querySelector('#prompt-play').click();doc.querySelector('#prompt-pace').value='150';doc.querySelector('#prompt-pace').dispatchEvent(new Event('input'));});
    assert.match(await page.evaluate(()=>documentPictureInPicture.window.document.querySelector('#prompt-pace-label').textContent),/150/);
    await page.evaluate(()=>documentPictureInPicture.window.close());await page.waitForFunction(()=>document.querySelector('#prompt-reader'));
    assert.match(await page.locator('#prompt-script').inputValue(),/Paragraph 40/);assert.equal(await page.locator('#prompt-pace').inputValue(),'150');
    await other.close();await page.bringToFront();await page.check('#prompt-enabled');
    await page.click('#record');if(await page.locator('#status').textContent().then(t=>t.includes('Speaker notes opened.')))await page.click('#record');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='● Recording');
    await page.waitForFunction(()=>documentPictureInPicture.window.document.querySelector('#prompt-play').textContent==='Pause scrolling',{}, {polling:100});
    assert.equal(await page.locator('#prompt-reader').count(),0);
    await page.waitForFunction(()=>document.querySelector('#interim').textContent==='Hello rolling');
    await page.waitForFunction(()=>document.querySelector('#segments').textContent.includes('Hello rolling transcript.'));
    await page.waitForTimeout(800);await page.click('#pause');
    const pausedClock=await page.locator('#clock').textContent();const pausedPrompt=await page.evaluate(()=>{const d=documentPictureInPicture.window?.document||document;return d.querySelector('#prompt-scroll').scrollTop;});await page.waitForTimeout(1500);assert.equal(await page.locator('#clock').textContent(),pausedClock);assert.equal(await page.locator('#pause').textContent(),'Resume');assert.equal(await page.evaluate(()=>{const d=documentPictureInPicture.window?.document||document;return d.querySelector('#prompt-scroll').scrollTop;}),pausedPrompt);
    await page.click('#pause');await page.waitForTimeout(1500);await page.click('#stop');
    try{await page.waitForFunction(()=>!document.querySelector('#download').disabled,{},{timeout:30000});}catch(e){console.log('Finish diagnostics',await page.locator('#status').textContent(),pageErrors);throw e;}
    await page.evaluate(()=>documentPictureInPicture.window.close());await page.waitForFunction(()=>document.querySelector('#prompt-reader'));
    assert.equal(await page.locator('body').getAttribute('data-view'),'edit');assert.equal(transcriptions,1);assert.equal(uploaded.length,1);assert.ok(uploaded[0].duration>2.5&&uploaded[0].duration<4.3,`Unexpected pause-aware duration ${uploaded[0].duration}`);
    assert.equal(await page.locator('.word').count(),4);assert.equal(await page.locator('#playback track').count(),1);
    await page.waitForFunction(()=>document.querySelector('#playback').readyState>=2);
    assert.equal(await page.evaluate(()=>[...document.querySelector('#playback').textTracks].filter(t=>t.mode==='showing').length),1);
    await page.fill('#find','wrong');await page.fill('#correction','right');await page.click('#correct-all');assert.match(await page.locator('.word-list').textContent(),/right/);
    await page.click('#undo');assert.match(await page.locator('.word-list').textContent(),/wrong/);await page.click('#redo');assert.match(await page.locator('.word-list').textContent(),/right/);
    await page.fill('#find','');await page.locator('.word').nth(1).click();await page.locator('.word').nth(2).click({modifiers:['Shift']});
    assert.equal(await page.locator('.word.selected').count(),2);await page.click('#trim-selection');assert.equal(await page.locator('.segment.cut').count(),1);
    await page.click('#apply');await page.waitForFunction(()=>!document.querySelector('#download').disabled,{},{timeout:30000});
    const cutInfo=JSON.parse(await run(ffprobe.path,['-v','error','-show_format','-of','json',path.join(data,outputs.at(-1))]));assert.ok(Math.abs(Number(cutInfo.format.duration)-(uploaded[0].duration-.8))<.15);
    await page.locator('.word').first().click();await page.click('#replace-selection');await page.fill('#replacement-text','Updated');await page.click('#save-replacement');
    await page.click('#apply');await page.waitForFunction(()=>!document.querySelector('#download').disabled,{},{timeout:30000});assert.equal(replacements,1);assert.match(await page.locator('#export-note').textContent(),/AI-generated/);
    await page.click('#reset');assert.equal(await page.locator('.segment.cut').count(),0);assert.equal(await page.locator('.word').count(),4);
    await page.waitForFunction(()=>document.querySelector('#playback').readyState>=2);
    await page.evaluate(async()=>{const video=document.querySelector('#playback');video.currentTime=.3;await video.play();});await page.waitForTimeout(300);await page.evaluate(()=>document.querySelector('#playback').pause());
    assert.equal(await page.evaluate(()=>[...document.querySelector('#playback').textTracks].filter(t=>t.mode==='showing').length),1);
    await mkdir(path.join(root,'artifacts'),{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(root,'artifacts','browser-qa.png'),fullPage:true});
    await page.click("#cleanup-tab");
    // Cleanup suggestions, preview, deselection, undo/redo, combined MP4 and revert.
    await page.selectOption('#filler-preset','custom');await page.fill('#custom-fillers','wrong');await page.click('#scan-fillers');assert.equal(await page.locator('#cleanup-candidates input').count(),1);assert.equal(await page.locator('.word.cleanup-cut').count(),1);
    await page.locator('#cleanup-candidates input').first().uncheck();assert.match(await page.locator('#cleanup-summary').textContent(),/No cleanup/);
    await page.click('#undo');assert.equal(await page.locator('#cleanup-candidates input').isChecked(),true);await page.click('#redo');assert.equal(await page.locator('#cleanup-candidates input').isChecked(),false);await page.locator('#cleanup-candidates input').check();
    await page.fill('#gap-minimum','0.2');await page.fill('#gap-padding','0.05');await page.click('#scan-gaps');await page.waitForFunction(()=>document.querySelectorAll('#cleanup-candidates input').length===2);assert.match(await page.locator('#cleanup-summary').textContent(),/0.60 seconds/);
    await page.locator('#cleanup-candidates button').first().click();await page.evaluate(()=>document.querySelector('#playback').pause());
    await page.click('#apply');await page.waitForFunction(()=>!document.querySelector('#download').disabled,{},{timeout:30000});
    const cleanedInfo=JSON.parse(await run(ffprobe.path,['-v','error','-show_format','-of','json',path.join(data,outputs.at(-1))]));assert.ok(Math.abs(Number(cleanedInfo.format.duration)-(uploaded[0].duration-.6))<.15);
    await page.click('#clear-cleanup');assert.equal(await page.locator('#cleanup-candidates input').count(),0);assert.equal(await page.locator('.word').count(),4);await page.click('#undo');assert.equal(await page.locator('#cleanup-candidates input').count(),2);await page.click('#reset');assert.equal(await page.locator('#cleanup-candidates input').count(),0);assert.equal(await page.locator('.word').count(),4);
    await page.click('[data-view-button="record"]');
    // All modes, restart from a paused take, cancellation without upload.
    await page.click('[data-capture="camera"]');assert.equal(await page.locator('#mode').inputValue(),'camera');await page.click('#record');if(await page.locator('#status').textContent().then(t=>t.includes('Speaker notes opened.')))await page.click('#record');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='● Recording');assert.equal(await page.evaluate(()=>window.displayCalls),1);await page.click('#pause');await page.click('#restart');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='● Recording');await page.click('#cancel');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='Ready to record');
    await page.click('[data-capture="screen"]');await page.click('#record');if(await page.locator('#status').textContent().then(t=>t.includes('Speaker notes opened.')))await page.click('#record');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='● Recording');assert.equal(await page.evaluate(()=>window.displayCalls),2);await page.click('#cancel');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='Ready to record');assert.equal(uploaded.length,1);assert.deepEqual(pageErrors,[]);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  } finally {
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    for(const item of uploaded)await unlink(path.join(data,`${item.id}.webm`)).catch(()=>{});
    for(const name of outputs){await unlink(path.join(data,name)).catch(()=>{});const work=path.resolve(data,name.slice(37,-4));assert.ok(work.startsWith(path.resolve(data)+path.sep));await rm(work,{recursive:true,force:true});}
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});
  }
});
