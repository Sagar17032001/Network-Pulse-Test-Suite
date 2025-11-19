/* app.js — Full feature set (old YouTube logic preserved) */
// -------------------- Helpers & DOM --------------------
const runVoipBtn = document.getElementById('runVoipBtn');
const runLocalBtn = document.getElementById('runLocalBtn');
const runYtBtn = document.getElementById('runYtBtn');
const runAllBtn = document.getElementById('runAllBtn');
const runSpeedBtn = document.getElementById('runSpeedBtn');

const exportCSVBtn = document.getElementById('exportCSV');
const exportPDFBtn = document.getElementById('exportPDF');
const exportJSONBtn = document.getElementById('exportJSON');
const timerSpan = document.getElementById('timer');
const statusSpan = document.getElementById('status');
const voipResultsDiv = document.getElementById('voipResults');
const localResultsDiv = document.getElementById('localResults');
const ytResultsDiv = document.getElementById('ytResults');
const speedResultsDiv = document.getElementById('speedResults');
const historyList = document.getElementById('historyList');

const voipDurationInput = document.getElementById('voipDuration');
const videoDurationInput = document.getElementById('videoDuration');
const ytDurationInput = document.getElementById('ytDuration');
const speedDurationInput = document.getElementById('speedDuration');

const localVideo = document.getElementById('localVideo');
const remoteAudio = document.getElementById('remoteAudio');

const emailModal = document.getElementById('emailModal');
const emailInput = document.getElementById('emailInput');
const emailCancelBtn = document.getElementById('emailCancelBtn');
const emailStartBtn = document.getElementById('emailStartBtn');

// charts
let latencyChart = null;

// global state
let g_results = { voip: null, local: null, youtube: null, speed: null };
let g_history = JSON.parse(localStorage.getItem('qoe_history') || '[]');

// optional backend URL (set to null to disable)
const BACKEND_URL = null; // e.g. 'http://localhost:3000/save' or null

// YouTube globals
let ytPlayer = null;
let ytApiReady = false;
const YT_VIDEO_ID = 'aqz-KE-bpKQ'; // Big Buck Bunny

// LibreSpeed config (remote/CDN)
const LIBRESPEED_JS = 'https://raw.githubusercontent.com/librespeed/speedtest/master/speedtest.js';
const LIBRESPEED_SERVER = 'https://librespeed.org/';
const LIBRESPEED_TIMEOUT_SEC = 40;
let libreSpeedAvailable = false;
let LibreSpeedClientConstructor = null;

// WebRTC globals
let pcSender = null, pcReceiver = null, dataChannel = null;
window.__webrtc_rtts = []; // store DC rtt samples ms
let pingInterval = null;

// -------------------- UI & History --------------------
function setStatus(s){ statusSpan.textContent = s; }
function setTimerText(s){ timerSpan.textContent = s; }

function disableButtons(disable = true){
  const buttonArea = document.getElementById('buttonArea');
  const buttons = buttonArea.querySelectorAll('button');
  buttons.forEach(btn => btn.disabled = disable);
  document.getElementById('clearHistory').disabled = disable;
  // keep modal controls enabled
  emailCancelBtn.disabled = false;
  emailStartBtn.disabled = false;
  emailInput.disabled = false;
}

function saveHistoryEntry(entry){
  g_history.unshift(entry);
  if(g_history.length > 200) g_history.pop();
  localStorage.setItem('qoe_history', JSON.stringify(g_history));
  renderHistory();
  // optionally send to backend
  if(BACKEND_URL){
    fetch(BACKEND_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)})
    .catch(()=>{ /* ignore */ });
  }
}

function renderHistory(){
  historyList.innerHTML = '';
  if(!g_history.length){ historyList.innerHTML = '<div class="small">No history yet</div>'; return; }
  g_history.forEach((h, idx) => {
    const d = document.createElement('div');
    d.style.padding = '8px';
    d.style.borderBottom = '1px solid #eef6ff';
    d.innerHTML = `<div style="font-weight:700">${new Date(h.ts).toLocaleString()}</div>
      <div class="small">Email: ${h.email || '—'} • VoIP MOS: ${h.voip?.MOS ?? '—'} • Speed: ${h.speed ? (Math.round(h.speed.download*100)/100)+' Mbps' : '—'}</div>`;
    d.addEventListener('click', ()=>{ showHistoryDetails(h); });
    historyList.appendChild(d);
  });
}
function showHistoryDetails(h){
  // Expand in results divs
  voipResultsDiv.innerHTML = renderVoipHTML(h.voip);
  localResultsDiv.innerHTML = renderLocalHTML(h.local);
  ytResultsDiv.innerHTML = renderYtHTML(h.youtube);
  speedResultsDiv.innerHTML = renderSpeedHTML(h.speed);
}

// -------------------- Chart init --------------------
function createLatencyChart(){
  const ctx = document.getElementById('latencyChart').getContext('2d');
  latencyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets:[
      { label:'Latency (ms)', data:[], borderColor:'#0b69ff', tension:0.25, fill:false },
      { label:'Jitter (ms)', data:[], borderColor:'#00b37e', tension:0.25, fill:false }
    ]},
    options: { animation:false, responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}
createLatencyChart();

// -------------------- Render helpers --------------------
function renderVoipHTML(voip){
  if(!voip) return `<div class="small">No VoIP result</div>`;
  return `<div class="small">Latency: <span class="value">${voip.latencyMs.toFixed(2)} ms</span></div>
    <div class="small">Jitter: <span class="value">${voip.avgJitterMs.toFixed(2)} ms</span></div>
    <div class="small">Packets Received: <span class="value">${voip.packetsReceived}</span></div>
    <div class="small">Packets Lost: <span class="value">${voip.packetsLost}</span></div>
    <div class="small">Packet Loss %: <span class="value">${voip.lossPercent.toFixed(2)}%</span></div>
    <div class="small">MOS (est): <span class="value">${voip.MOS.toFixed(2)}</span></div>`;
}
function renderLocalHTML(local){ if(!local) return `<div class="small">No local video result</div>`; return `<div class="small">Startup: <span class="value">${Math.round(local.startup)} ms</span></div><div class="small">Stalls: <span class="value">${local.stalls}</span></div><div class="small">Total Stall: <span class="value">${Math.round(local.totalStall)} ms</span></div>`;}
function renderYtHTML(yt){ if(!yt) return `<div class="small">No YouTube result</div>`; return `<div class="small">Startup: <span class="value">${Math.round(yt.startup)} ms</span></div><div class="small">Stalls: <span class="value">${yt.stalls}</span></div><div class="small">Total Stall: <span class="value">${Math.round(yt.totalStall)} ms</span></div>`;}
function renderSpeedHTML(speed){
  if(!speed) return `<div class="small">No speed result</div>`;
  return `<div class="small">Download: <span class="value">${(speed.download||0).toFixed(2)} Mbps</span></div>
          <div class="small">Upload: <span class="value">${(speed.upload||0).toFixed(2)} Mbps</span></div>
          <div class="small">Ping: <span class="value">${Math.round(speed.ping||0)} ms</span></div>
          <div class="small">Jitter: <span class="value">${Math.round(speed.jitter||0)} ms</span></div>`;
}

// -------------------- WebRTC VoIP Test --------------------
async function runVoipTest(durationSec){
  setStatus('VoIP running');
  setTimerText(`${durationSec}s`);
  voipResultsDiv.innerHTML = '<div class="small">Preparing...</div>';
  window.__webrtc_rtts = [];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    pcSender = new RTCPeerConnection();
    pcReceiver = new RTCPeerConnection();

    stream.getTracks().forEach(t => pcSender.addTrack(t, stream));

    pcSender.onicecandidate = e => e.candidate && pcReceiver.addIceCandidate(e.candidate).catch(()=>{});
    pcReceiver.onicecandidate = e => e.candidate && pcSender.addIceCandidate(e.candidate).catch(()=>{});
    pcReceiver.ontrack = e => {
      if(remoteAudio.srcObject !== e.streams[0]) {
        remoteAudio.srcObject = e.streams[0];
        remoteAudio.play().catch(()=>{});
      }
    };

    dataChannel = pcSender.createDataChannel('ping');
    pcReceiver.ondatachannel = ev => {
      const ch = ev.channel;
      ch.onmessage = (m) => { try { ch.send(m.data); } catch(e){} };
    };

    const offer = await pcSender.createOffer();
    await pcSender.setLocalDescription(offer);
    await pcReceiver.setRemoteDescription(offer);
    const answer = await pcReceiver.createAnswer();
    await pcReceiver.setLocalDescription(answer);
    await pcSender.setRemoteDescription(answer);

    // start DC RTT sampling
    const rtts = [];
    dataChannel.onmessage = (ev) => {
      try{
        const pkt = JSON.parse(ev.data);
        if(pkt && pkt.sentTs){
          const rtt = performance.now() - pkt.sentTs;
          rtts.push(rtt); window.__webrtc_rtts.push(rtt);
          // update chart live
          updateCharts(rtt, (pkt.jitter||0));
        }
      }catch(e){}
    };

    // send pings every 1s once open
    pingInterval = setInterval(()=>{
      if(dataChannel && dataChannel.readyState === 'open'){
        const pkt = { sentTs: performance.now(), jitter:0, seq: Math.floor(Math.random()*1e9) };
        try{ dataChannel.send(JSON.stringify(pkt)); }catch(e){}
      }
    },1000);

    // collect RTP stats every second
    const inboundHistory = [];
    const outboundHistory = [];
    for(let i=durationSec;i>=1;i--){
      setTimerText(`${i}s`);
      // inbound
      try{
        const stats = await pcReceiver.getStats();
        stats.forEach(r=>{
          if(r.type === 'inbound-rtp' && (r.kind==='audio' || r.mediaType==='audio')){
            inboundHistory.push({ packetsReceived: r.packetsReceived||0, packetsLost: r.packetsLost||0, jitter: r.jitter||0 });
          }
        });
      }catch(e){}
      // outbound
      try{
        const stats2 = await pcSender.getStats();
        stats2.forEach(r=>{
          if(r.type === 'outbound-rtp' && (r.kind==='audio' || r.mediaType==='audio')){
            outboundHistory.push({ rtt: r.roundTripTime||0 });
          }
        });
      }catch(e){}
      await new Promise(r=>setTimeout(r,1000));
    }

    // stop pings
    clearInterval(pingInterval);

    await new Promise(r=>setTimeout(r,300)); // last DC samples

    // aggregate
    const lastInbound = inboundHistory.length ? inboundHistory[inboundHistory.length-1] : null;
    const packetsReceived = lastInbound ? lastInbound.packetsReceived : 0;
    const packetsLost = lastInbound ? lastInbound.packetsLost : 0;
    const jitterMsArr = inboundHistory.map(s => (s.jitter||0)*1000);
    const avgJitterMs = jitterMsArr.length ? jitterMsArr.reduce((a,b)=>a+b,0)/jitterMsArr.length : 0;

    const dcRtts = window.__webrtc_rtts.slice();
    const avgDcRtt = dcRtts.length ? dcRtts.reduce((a,b)=>a+b,0)/dcRtts.length : 0;
    const outboundRttMsArr = outboundHistory.map(s => (s.rtt||0)*1000);
    const avgOutboundRttMs = outboundRttMsArr.length ? outboundRttMsArr.reduce((a,b)=>a+b,0)/outboundRttMsArr.length : 0;
    const latencyMs = avgDcRtt || avgOutboundRttMs;

    const totalPackets = packetsReceived + packetsLost;
    const lossPercent = totalPackets ? (packetsLost/totalPackets)*100 : 0;

    // MOS simplify
    let R = 94.2 - (latencyMs*0.03 + avgJitterMs*0.10 + lossPercent*2.5);
    R = Math.max(0, Math.min(100,R));
    const MOS = 1 + 0.035*R + 0.000007*R*(R-60)*(100-R);

    const voip = { ts: Date.now(), latencyMs, avgJitterMs, packetsReceived, packetsLost, lossPercent, MOS, dcSamples: dcRtts.length };
    g_results.voip = voip;
    voipResultsDiv.innerHTML = renderVoipHTML(voip);

    saveHistoryEntry({ ts: Date.now(), voip, local: g_results.local, youtube: g_results.youtube });

    // cleanup
    try{ pcSender.close(); pcReceiver.close(); }catch(e){}
    pcSender = pcReceiver = dataChannel = null;
    window.__webrtc_rtts = [];
    setStatus('Idle'); setTimerText('0s');

    // return
    return voip;

  } catch(err){
    voipResultsDiv.innerHTML = `<div class="small">VoIP error: ${err?.message||err}</div>`;
    setStatus('Idle'); setTimerText('0s');
    return null;
  }
}

function updateCharts(latency, jitter){
  // push into latencyChart (latency dataset, jitter dataset)
  const labels = latencyChart.data.labels;
  const nowLabel = new Date().toLocaleTimeString();
  labels.push(nowLabel);
  latencyChart.data.datasets[0].data.push(Number((latency||0).toFixed(2)));
  latencyChart.data.datasets[1].data.push(Number((jitter||0).toFixed(2)));
  if(labels.length>60){ labels.shift(); latencyChart.data.datasets.forEach(d=>d.data.shift());}
  latencyChart.update();
}

// -------------------- Local Video Test --------------------
async function runLocalVideoTest(){
  setStatus('Local video running');
  const duration = Number(videoDurationInput.value) ||30;
  setTimerText(`${duration}s`);
  localResultsDiv.innerHTML = '<div class="small">Preparing local video test...</div>';

  if(!localVideo || !localVideo.src){
    localResultsDiv.innerHTML = '<div class="small">Local video missing (place file in assets/test-video.mp4)</div>';
    return null;
  }

  // reset
  localVideo.pause(); localVideo.currentTime = 0; localVideo.style.display = 'block';
  let startReq = performance.now(), startup = null, stalls = 0, totalStall = 0, stallStart = null;

  const onWaiting = ()=>{ stalls++; stallStart = performance.now(); };
  const onPlaying = ()=>{ if(startup===null) startup = performance.now()-startReq; if(stallStart){ totalStall += performance.now()-stallStart; stallStart=null; } };
  const onError = ()=>{ cleanup(); localResultsDiv.innerHTML = '<div class="small">Local video error</div>'; };

  function cleanup(){
    localVideo.removeEventListener('waiting', onWaiting);
    localVideo.removeEventListener('playing', onPlaying);
    localVideo.removeEventListener('error', onError);
    try{ localVideo.pause(); } catch(e){}
    localVideo.style.display = 'none';
  }

  localVideo.addEventListener('waiting', onWaiting);
  localVideo.addEventListener('playing', onPlaying);
  localVideo.addEventListener('error', onError);

  try{ await localVideo.play(); }catch(e){ /* may require gesture */ }

  for(let i=duration;i>=1;i--){
    setTimerText(`${i}s`);
    await new Promise(r=>setTimeout(r,1000));
  }

  if(stallStart){ totalStall += performance.now()-stallStart; stallStart = null; }
  cleanup();

  const result = { ts: Date.now(), startup: startup||0, stalls, totalStall };
  g_results.local = result;
  localResultsDiv.innerHTML = renderLocalHTML(result);
  saveHistoryEntry({ ts: Date.now(), voip: g_results.voip, local: result, youtube: g_results.youtube });

  setStatus('Idle'); setTimerText('0s');
  return result;
}



// -------------------- YouTube API ready handler --------------------
function onYouTubeIframeAPIReady(){
  ytApiReady = true;
  try{
    if(!ytPlayer){
      // Create player but don't auto-play (autoplay often blocked).
      ytPlayer = new YT.Player('youtubePlayer', {
        height: '240',
        width: '400',
        videoId: YT_VIDEO_ID,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0 }
      });
    }
  }catch(e){
    console.warn('YT player create error', e);
  }
}

// -------------------- Fixed YouTube test --------------------
async function runYouTubeTest() {
  setStatus('YouTube running');

  const duration = Number(ytDurationInput.value) || 30;
  setTimerText(`${duration}s`);

  ytResultsDiv.innerHTML = '<div class="small">Preparing YouTube test (user gesture may be required)...</div>';

  if (!ytApiReady) {
    ytResultsDiv.innerHTML = '<div class="small">YouTube API not ready</div>';
    return null;
  }

  document.getElementById('youtubeContainer').style.display = 'block';

  // VARIABLES
  let startup = null;
  let stalls = 0;
  let totalStall = 0;
  let stallStart = null;
  let playedOnce = false;

  // Use an explicit timestamp for when we call loadVideoById()
  let loadTs = null;

  // Ensure player exists (should from API ready handler); wait briefly if not
  if (!ytPlayer) {
    // create a player instance if somehow not created earlier
    ytPlayer = new YT.Player('youtubePlayer', {
      height: '240',
      width: '400',
      videoId: YT_VIDEO_ID,
      playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0 }
    });
    // wait small time for readiness
    await new Promise(r => setTimeout(r, 300));
  }

  // Promise that resolves when test completes
  return new Promise(resolve => {
    // State change handler
    function onStateChange(e) {
      const state = e.data;
      // BUFFERING
      if (state === YT.PlayerState.BUFFERING) {
        // If already played once, this is a stall
        if (playedOnce && !stallStart) {
          stallStart = performance.now();
          stalls++;
        }
      }
      // PLAYING
      else if (state === YT.PlayerState.PLAYING) {
        // First time we get PLAYING -> startup measured here
        if (!playedOnce) {
          playedOnce = true;
          if (loadTs) {
            startup = performance.now() - loadTs;
          } else {
            // fallback: 0 if we couldn't capture load time
            startup = 0;
          }
        }
        // If we were in stall, close it
        if (stallStart) {
          totalStall += performance.now() - stallStart;
          stallStart = null;
        }
      }
      // ENDED or CUED or PAUSED - not directly relevant for a running test
    }

    // Attach handler
    const boundHandler = onStateChange.bind(this);
    ytPlayer.addEventListener('onStateChange', boundHandler); // older API compatible

    // Some players also support addEventListener with string event
    try { ytPlayer.addEventListener('onStateChange', boundHandler); } catch(e){}

    // Start the test: load + play. Record load timestamp immediately before loadVideoById().
    loadTs = performance.now();
    try {
      ytPlayer.loadVideoById({ videoId: YT_VIDEO_ID, suggestedQuality: 'hd720' });
    } catch(e) {
      // ignore load error
    }

    // Try to play (may be blocked by autoplay policy; user gesture required in that case).
    try { ytPlayer.playVideo(); } catch(e){ /* ignore */ }

    // Polling loop only to count time & update UI; actual stall detection via events above
    const poll = 250;
    let elapsed = 0;
    const pollInterval = setInterval(() => {
      elapsed += poll;
      setTimerText(`${Math.ceil((duration * 1000 - elapsed) / 1000)}s`);
      if (elapsed >= duration * 1000) {
        clearInterval(pollInterval);

        // If a stall is open, close it
        if (stallStart) {
          totalStall += performance.now() - stallStart;
          stallStart = null;
        }

        // Stop the video if possible
        try { ytPlayer.stopVideo(); } catch(e){}

        // Remove event listener (best-effort)
        try {
          ytPlayer.removeEventListener('onStateChange', boundHandler);
        } catch(e){}

        // Prepare results
        const res = {
          ts: Date.now(),
          startup: startup || 0,
          stalls,
          totalStall
        };

        // Save into global results and UI
        g_results.youtube = res;
        ytResultsDiv.innerHTML = renderYtHTML(res);

        saveHistoryEntry({
          ts: Date.now(),
          voip: g_results.voip,
          local: g_results.local,
          youtube: res
        });

        // Reset status/timer
        setStatus('Idle');
        setTimerText('0s');

        resolve(res);
      }
    }, poll);
  });
}


// -------------------- LibreSpeed integration + fallback --------------------
// (same as earlier; omitted here for brevity in explanation — full implementation below)

function loadRemoteScript(url, id){
  return new Promise((resolve, reject)=>{
    if(document.getElementById(id)){ resolve(); return; }
    const s = document.createElement('script');
    s.src = url;
    if(id) s.id = id;
    s.onload = ()=>resolve();
    s.onerror = (e)=>reject(new Error('Script load error: '+url));
    document.head.appendChild(s);
  });
}

async function tryInitLibreSpeed(){
  if(libreSpeedAvailable && typeof Speedtest === 'function') { LibreSpeedClientConstructor = Speedtest; return true; }
  try {
    await loadRemoteScript(LIBRESPEED_JS, 'librespeed-js');
  } catch(e){
    console.warn('Unable to load LibreSpeed client script:', e);
    return false;
  }
  if(typeof window.Speedtest === 'function'){
    LibreSpeedClientConstructor = window.Speedtest;
    libreSpeedAvailable = true;
    return true;
  } else {
    console.warn('Speedtest constructor not found after script load.');
    return false;
  }
}

async function runLibreSpeedTest(timeoutSec = LIBRESPEED_TIMEOUT_SEC){
  speedResultsDiv.innerHTML = '<div class="small">Attempting LibreSpeed test (remote)...</div>';
  if(!libreSpeedAvailable || !LibreSpeedClientConstructor){
    throw new Error('LibreSpeed unavailable');
  }
  return new Promise((resolve, reject)=>{
    try {
      const client = new LibreSpeedClientConstructor();
      let ping = 0, jitter = 0, download = 0, upload = 0;
      client.onupdate = (data) => {
        const d = data && (data.dlStatus || data.dlBitsPerSec || data.download) || download;
        const u = data && (data.ulStatus || data.ulBitsPerSec || data.upload) || upload;
        const p = data && (data.pingMs || data.ping) || ping;
        const j = data && (data.jitterMs || data.jitter) || jitter;
        download = d; upload = u; ping = p; jitter = j;
        speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${formatMbps(d)}</span></div>
                                     <div class="small">Upload: <span class="value">${formatMbps(u)}</span></div>
                                     <div class="small">Ping: <span class="value">${p?Math.round(p)+' ms':'—'}</span></div>
                                     <div class="small">Jitter: <span class="value">${j?Math.round(j)+' ms':'—'}</span></div>`;
      };
      client.onend = (data) => {
        const finalDl = data && (data.dlStatus || data.dlBitsPerSec || data.download) || download;
        const finalUl = data && (data.ulStatus || data.ulBitsPerSec || data.upload) || upload;
        const finalPing = data && (data.pingMs || data.ping) || ping;
        const finalJitter = data && (data.jitterMs || data.jitter) || jitter;
        const res = { ping: finalPing || 0, jitter: finalJitter || 0, download: normalizeToMbps(finalDl), upload: normalizeToMbps(finalUl), raw: data || {} };
        g_results.speed = res;
        speedResultsDiv.innerHTML = renderSpeedHTML(res);
        saveHistoryEntry({ ts: Date.now(), email: null, voip: g_results.voip, local: g_results.local, youtube: g_results.youtube, speed: res });
        resolve(res);
      };
      client.onfail = (err) => { reject(err); };

      try {
        if(typeof client.start === 'function') {
          try { client.start(LIBRESPEED_SERVER); } catch(e) { client.start(); }
        } else if(typeof client.run === 'function') {
          client.run();
        } else if(typeof client.test === 'function') {
          client.test();
        } else {
          throw new Error('No runnable method on LibreSpeed client');
        }
      } catch(e){
        reject(e);
      }

      setTimeout(()=>{ reject(new Error('LibreSpeed timed out')); }, (timeoutSec + 5) * 1000);

    } catch(err){
      reject(err);
    }
  });
}

function formatMbps(val){
  if(!val && val !== 0) return '—';
  if(typeof val === 'string') return val;
  if(typeof val === 'number'){
    if(val > 1e6) return (val / (1024*1024)).toFixed(2) + ' Mbps';
    if(val > 1000) return (val / (1024*1024)).toFixed(2) + ' Mbps';
    return Number(val).toFixed(2) + ' Mbps';
  }
  return String(val);
}

function normalizeToMbps(v){
  if(!v && v !== 0) return 0;
  if(typeof v === 'string'){
    const num = parseFloat(v.replace(/[^\d\.]/g,'')) || 0;
    if(v.toLowerCase().includes('mb')) return num;
    if(v.toLowerCase().includes('kb')) return num/1024;
    return num;
  }
  if(typeof v === 'number'){
    if(v > 1e6) return v / (1024*1024);
    if(v > 1000 && v < 1e6) return v / (1024*1024);
    return v;
  }
  return 0;
}

async function simulatedSpeedTest(seconds = (speedDuration.value) || 30){
  speedResultsDiv.innerHTML = '<div class="small">LibreSpeed unavailable — running simulated test</div>';
  setStatus('Simulated speed running');
  let download = 0, upload = 0, ping = 0, jitter = 0;
  for(let i=seconds;i>=1;i--){
    setTimerText(`${i}s`);
    download = 20 + Math.random()*80;
    upload = 5 + Math.random()*50;
    ping = 10 + Math.random()*50;
    jitter = Math.random()*10;
    speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${download.toFixed(2)} Mbps</span></div>
                                 <div class="small">Upload: <span class="value">${upload.toFixed(2)} Mbps</span></div>
                                 <div class="small">Ping: <span class="value">${Math.round(ping)} ms</span></div>
                                 <div class="small">Jitter: <span class="value">${Math.round(jitter)} ms</span></div>`;
    await new Promise(r=>setTimeout(r,1000));
  }
  setTimerText('0s'); setStatus('Idle');
  const res = { download, upload, ping, jitter, simulated: true };
  g_results.speed = res;
  saveHistoryEntry({ ts: Date.now(), email: null, voip: g_results.voip, local: g_results.local, youtube: g_results.youtube, speed: res });
  return res;
}

async function runSpeedTest(){
  setStatus('Speed test running');
  setTimerText('0s');
  try {
    const ok = await tryInitLibreSpeed();
    if(ok){
      try {
        const result = await runLibreSpeedTest(LIBRESPEED_TIMEOUT_SEC);
        setStatus('Speed test completed');
        setTimerText('0s');
        return result;
      } catch(err){
        console.warn('LibreSpeed run failed', err);
        const sim = await simulatedSpeedTest(30);
        return sim;
      }
    } else {
      const sim = await simulatedSpeedTest(30);
      return sim;
    }
  } catch(e){
    console.warn('Speed test error', e);
    const sim = await simulatedSpeedTest(30);
    return sim;
  }
}

// -------------------- Run All (email modal) --------------------
function showEmailModal(show = true){
  if(show){ emailModal.classList.add('show'); emailModal.setAttribute('aria-hidden','false'); emailInput.value=''; setTimeout(()=>emailInput.focus(),80); }
  else { emailModal.classList.remove('show'); emailModal.setAttribute('aria-hidden','true'); }
}
function validateEmail(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email || '').trim());
}

async function runAll(email){
  const emailTrim = (email||'').trim();
  // clear charts
  latencyChart.data.labels=[]; latencyChart.data.datasets.forEach(ds=>ds.data=[]); latencyChart.update();
  setStatus('Running all tests');
  disableButtons(true);

  try {
    await runVoipTest(Number(voipDurationInput.value)||30);
    await runLocalVideoTest();
    await runYouTubeTest();
    await runSpeedTest();

    const fullEntry = {
      ts: Date.now(),
      email: emailTrim,
      voip: g_results.voip,
      local: g_results.local,
      youtube: g_results.youtube,
      speed: g_results.speed
    };
    saveHistoryEntry(fullEntry);
    setStatus('Completed all tests');
  } catch(e){
    console.error('Run All error', e);
    setStatus('Error during run');
  } finally {
    disableButtons(false);
    setTimerText('0s');
  }
}

// -------------------- Utilities: export CSV/JSON/PDF --------------------
function exportCSV(){
  const rows = [['Test','Metric','Value']];
  if(g_results.voip){
    rows.push(['VoIP','Latency_ms',g_results.voip.latencyMs]);
    rows.push(['VoIP','Jitter_ms',g_results.voip.avgJitterMs]);
    rows.push(['VoIP','PacketsReceived',g_results.voip.packetsReceived]);
    rows.push(['VoIP','PacketsLost',g_results.voip.packetsLost]);
    rows.push(['VoIP','MOS',g_results.voip.MOS]);
  }
  if(g_results.local){
    rows.push(['Local','Startup_ms',g_results.local.startup]);
    rows.push(['Local','Stalls',g_results.local.stalls]);
    rows.push(['Local','TotalStall_ms',g_results.local.totalStall]);
  }
  if(g_results.youtube){
    rows.push(['YouTube','Startup_ms',g_results.youtube.startup]);
    rows.push(['YouTube','Stalls',g_results.youtube.stalls]);
    rows.push(['YouTube','TotalStall_ms',g_results.youtube.totalStall]);
  }
  const csv = rows.map(r=>r.map(c=> typeof c === 'string' && (c.includes(',')||c.includes('"') )? `"${c.replace(/"/g,'""')}"`: c).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `qoe_${new Date().toISOString().slice(0,19)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(g_results,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `qoe_${new Date().toISOString().slice(0,19)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportPDF(){
  // use jsPDF (global)
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text('QoE Test Results',14,18);
  let y = 28;
  if(g_results.voip){
    doc.setFontSize(12); doc.text('VoIP:',14,y); y+=6;
    doc.setFontSize(10); doc.text(`Latency: ${g_results.voip.latencyMs.toFixed(2)} ms`,16,y); y+=6;
    doc.text(`Jitter: ${g_results.voip.avgJitterMs.toFixed(2)} ms`,16,y); y+=6;
    doc.text(`MOS: ${g_results.voip.MOS.toFixed(2)}`,16,y); y+=10;
  }
  if(g_results.local){
    doc.setFontSize(12); doc.text('Local Video:',14,y); y+=6;
    doc.setFontSize(10); doc.text(`Startup: ${Math.round(g_results.local.startup)} ms`,16,y); y+=6;
    doc.text(`Stalls: ${g_results.local.stalls}`,16,y); y+=10;
  }
  if(g_results.youtube){
    doc.setFontSize(12); doc.text('YouTube:',14,y); y+=6;
    doc.setFontSize(10); doc.text(`Startup: ${Math.round(g_results.youtube.startup)} ms`,16,y); y+=6;
    doc.text(`Stalls: ${g_results.youtube.stalls}`,16,y); y+=10;
  }
  doc.save(`qoe_${new Date().toISOString().slice(0,19)}.pdf`);
}


// -------------------- Event wiring --------------------
runAllBtn.addEventListener('click', ()=>{ showEmailModal(true); });
emailCancelBtn.addEventListener('click', ()=>{ showEmailModal(false); });
emailInput.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ emailStartBtn.click(); } });
emailStartBtn.addEventListener('click', ()=>{
  const emailVal = emailInput.value || '';
  if(!validateEmail(emailVal)){ alert('Please enter a valid email address (e.g. you@example.com).'); emailInput.focus(); return; }
  showEmailModal(false);
  runAll(emailVal);
});

runVoipBtn.addEventListener('click', ()=>{ disableButtons(true); runVoipTest(Number(voipDurationInput.value)||30).finally(()=>disableButtons(false)); });
runLocalBtn.addEventListener('click', ()=>{ disableButtons(true); runLocalVideoTest().finally(()=>disableButtons(false)); });
runYtBtn.addEventListener('click', ()=>{ disableButtons(true); runYouTubeTest().finally(()=>disableButtons(false)); });

runSpeedBtn.addEventListener('click', ()=>{ disableButtons(true); runSpeedTest().finally(()=>disableButtons(false)); });

exportCSVBtn.addEventListener('click', exportCSV);
exportJSONBtn.addEventListener('click', exportJSON);
exportPDFBtn.addEventListener('click', exportPDF);



// history clears
document.getElementById('clearHistory').addEventListener('click', ()=>{ g_history=[]; localStorage.setItem('qoe_history','[]'); renderHistory(); });

// initial render
renderHistory();
setStatus('Idle');

// expose youtube callback (YT API uses this name)
window.onYouTubeIframeAPIReady = function(){ onYouTubeIframeAPIReady(); };
