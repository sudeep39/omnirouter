// Worker timers keep the compositor drawing when the recorder tab is hidden.
// Screen-only and camera-only recordings use the source track directly.
const timer = setInterval(() => postMessage('frame'), 1000 / 30);
onmessage = event => { if (event.data === 'stop') { clearInterval(timer); close(); } };
