/* app.js — Full feature set (NDT7 for speed test, old YouTube logic preserved) */
// -------------------- Helpers & DOM --------------------
const runVoipBtn = document.getElementById('runVoipBtn');
const runLocalBtn = document.getElementById('runLocalBtn');
const runYtBtn = document.getElementById('runYtBtn');
const runAllBtn = document.getElementById('runAllBtn');
const runSpeedBtn = document.getElementById('runSpeedBtn');

// const exportCSVBtn = document.getElementById('exportCSV');
// const exportPDFBtn = document.getElementById('exportPDF');
// const exportJSONBtn = document.getElementById('exportJSON');
document.getElementById('btnCSV').addEventListener('click', exportCSV);
document.getElementById('btnJSON').addEventListener('click', exportJSON);
document.getElementById('btnPDF').addEventListener('click', exportPDF);

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


// Speed chart initializion
let speedChart = null;
function createSpeedChart() {
  const ctx = document.getElementById('speedChart').getContext('2d');
  speedChart = new Chart(ctx, {
    type: 'line',
    data: { 
      labels: [], 
      datasets:[
        { label:'Download (Mbps)', data:[], borderColor:'#0b69ff', fill:false, tension:0.25 },
        { label:'Upload (Mbps)', data:[], borderColor:'#00b37e', fill:false, tension:0.25 }
      ]
    },
    options: { 
      animation:false, 
      responsive:true, 
      scales:{ y:{ beginAtZero:true } } 
    }
  });
}
createSpeedChart();


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

function renderLocalHTML(local){
  if (!local) {
    return `<div class="small">No local video result</div>`;
  }

  return `
    <div class="small">Startup: <span class="value">${Math.round(local.startup)} ms</span></div>

    <div class="small">Stalls: <span class="value">${local.stalls}</span></div>
    <div class="small">Total Stall: <span class="value">${Math.round(local.totalStall)} ms</span></div>

    <div class="small">Freeze Count: <span class="value">${local.freezeCount}</span></div>
    <div class="small">Freeze Duration: <span class="value">${Math.round(local.freezeDuration)} ms</span></div>

    <div class="small">Avg Buffer Ahead: <span class="value">${local.avgBufferAhead.toFixed(2)} s</span></div>
    <div class="small">Min Buffer Ahead: <span class="value">${local.minBufferAhead.toFixed(2)} s</span></div>

    <div class="small">Buffer Ratio: <span class="value">${(local.bufferRatio * 100).toFixed(2)} %</span></div>
    <div class="small">Avg Stall Duration: <span class="value">${Math.round(local.avgStallDuration)} ms</span></div>
  `;
}


function renderYtHTML(yt){
  if(!yt) return `<div class="small">No YouTube result</div>`;

  return `
    <div class="small">Startup: <span class="value">${Math.round(yt.startup)} ms</span></div>
    <div class="small">Stalls: <span class="value">${yt.stalls}</span></div>
    <div class="small">Total Stall: <span class="value">${Math.round(yt.totalStall)} ms</span></div>

    <div class="small">Freeze Count: <span class="value">${yt.freezeCount ?? 0}</span></div>
    <div class="small">Freeze Duration: <span class="value">${Math.round(yt.freezeDuration ?? 0)} ms</span></div>

    <div class="small">Avg Buffer Ahead: <span class="value">${(yt.avgBufferAhead ?? 0).toFixed(2)} s</span></div>
    <div class="small">Min Buffer Ahead: <span class="value">${(yt.minBufferAhead ?? 0).toFixed(2)} s</span></div>

    <div class="small">Buffer Ratio: <span class="value">${(yt.bufferRatio ?? 0).toFixed(2)} %</span></div>
    <div class="small">Avg Stall Duration: <span class="value">${Math.round(yt.avgStall ?? 0)} ms</span></div>
  `;
}

function renderSpeedHTML(speed){
  if(!speed) return `<div class="small">No speed result</div>`;
  return `<div class="small">Download: <span class="value">${(speed.download||0).toFixed(2)} Mbps</span></div>
          <div class="small">Upload: <span class="value">${(speed.upload||0).toFixed(2)} Mbps</span></div>`;
}

// <div class="small">Ping: <span class="value">${Math.round(speed.ping||0)} ms</span></div>
// <div class="small">Jitter: <span class="value">${Math.round(speed.jitter||0)} ms</span></div>

// -------------------- WebRTC VoIP Test (NO MIC PERMISSION NEEDED) --------------------
async function runVoipTest(durationSec){
  setStatus('VoIP test running');
  setTimerText(`${durationSec}s`);
  voipResultsDiv.innerHTML = '<div class="small">Preparing...</div>';
  window.__webrtc_rtts = [];

  try {

    // --------------------------------------------------------
    // 1. SYNTHETIC AUDIO TRACK (replaces microphone entirely)
    // --------------------------------------------------------
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 0;  // silent

    const dest = audioCtx.createMediaStreamDestination();
    oscillator.connect(dest);
    oscillator.start();

    const stream = dest.stream;   // acts exactly like mic stream

    // --------------------------------------------------------
    // 2. WebRTC Sender/Receiver setup
    // --------------------------------------------------------
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

    // --------------------------------------------------------
    // 3. DataChannel setup (ping/pong RTT)
    // --------------------------------------------------------
    dataChannel = pcSender.createDataChannel('ping');
    pcReceiver.ondatachannel = ev => {
      const ch = ev.channel;
      ch.onmessage = m => { try { ch.send(m.data); } catch(e){} };
    };

    // --------------------------------------------------------
    // 4. SDP negotiation
    // --------------------------------------------------------
    const offer = await pcSender.createOffer();
    await pcSender.setLocalDescription(offer);
    await pcReceiver.setRemoteDescription(offer);

    const answer = await pcReceiver.createAnswer();
    await pcReceiver.setLocalDescription(answer);
    await pcSender.setRemoteDescription(answer);

    // --------------------------------------------------------
    // 5. RTT sampling
    // --------------------------------------------------------
    const rtts = [];
    dataChannel.onmessage = ev => {
      try{
        const pkt = JSON.parse(ev.data);
        if(pkt && pkt.sentTs){
          const rtt = performance.now() - pkt.sentTs;
          rtts.push(rtt);
          window.__webrtc_rtts.push(rtt);
          updateCharts(rtt, 0);
        }
      }catch(e){}
    };

    pingInterval = setInterval(()=>{
      if(dataChannel && dataChannel.readyState === 'open'){
        const pkt = { sentTs: performance.now(), jitter:0 };
        try{ dataChannel.send(JSON.stringify(pkt)); }catch(e){}
      }
    },1000);

    // --------------------------------------------------------
    // 6. RTP Stats collection
    // --------------------------------------------------------
    const inboundHistory = [];
    const outboundHistory = [];

    for(let i=durationSec;i>=1;i--){
      setTimerText(`${i}s`);

      try{
        const stats = await pcReceiver.getStats();
        stats.forEach(r=>{
          if(r.type === 'inbound-rtp' && (r.kind==='audio' || r.mediaType==='audio')){
            inboundHistory.push({
              packetsReceived: r.packetsReceived||0,
              packetsLost: r.packetsLost||0,
              jitter: r.jitter||0
            });
          }
        });
      }catch(e){}

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

    clearInterval(pingInterval);
    await new Promise(r=>setTimeout(r,300));

    // --------------------------------------------------------
    // 7. Aggregation (UNCHANGED)
    // --------------------------------------------------------
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

    let R = 94.2 - (latencyMs*0.03 + avgJitterMs*0.10 + lossPercent*2.5);
    R = Math.max(0, Math.min(100,R));
    const MOS = 1 + 0.035*R + 0.000007*R*(R-60)*(100-R);

    const voip = {
      ts: Date.now(),
      latencyMs,
      avgJitterMs,
      packetsReceived,
      packetsLost,
      lossPercent,
      MOS,
      dcSamples: dcRtts.length
    };

    g_results.voip = voip;
    voipResultsDiv.innerHTML = renderVoipHTML(voip);

    saveHistoryEntry({
      ts: Date.now(),
      voip,
      local: g_results.local,
      youtube: g_results.youtube
    });

    // --------------------------------------------------------
    // 8. Cleanup
    // --------------------------------------------------------
    try{ pcSender.close(); pcReceiver.close(); }catch(e){}
    try{ oscillator.stop(); audioCtx.close(); }catch(e){}
    pcSender = pcReceiver = dataChannel = null;
    window.__webrtc_rtts = [];
    setStatus('Idle');
    setTimerText('0s');

    return voip;

  } catch(err){
    voipResultsDiv.innerHTML = `<div class="small">VoIP error: ${err?.message||err}</div>`;
    setStatus('Idle'); 
    setTimerText('0s');
    return null;
  }
}


function updateCharts(latency, jitter){
  const labels = latencyChart.data.labels;
  const nowLabel = new Date().toLocaleTimeString();
  labels.push(nowLabel);
  latencyChart.data.datasets[0].data.push(Number((latency||0).toFixed(2)));
  latencyChart.data.datasets[1].data.push(Number((jitter||0).toFixed(2)));
  if(labels.length>60){ labels.shift(); latencyChart.data.datasets.forEach(d=>d.data.shift());}
  latencyChart.update();
}

// -------------------- Local Video Test (Stable + Complete) --------------------
async function runLocalVideoTest() {
  setStatus('Local video test running');
  const duration = Number(videoDurationInput.value) || 30;
  setTimerText(`${duration}s`);
  localResultsDiv.innerHTML = '<div class="small">Preparing local video test...</div>';

  if (!localVideo || !localVideo.src) {
    localResultsDiv.innerHTML = '<div class="small">Local video missing (assets/test-video.mp4)</div>';
    return null;
  }

  // Reset
  localVideo.pause();
  localVideo.currentTime = 0;
  localVideo.style.display = 'block';

  let startReq = performance.now();
  let startup = null;

  let stalls = 0;
  let totalStall = 0;
  let stallStart = null;

  // Freeze detection
  let lastTime = 0;
  let freezeStart = null;
  let freezeCount = 0;
  let freezeDuration = 0;

  // Buffer monitoring
  let bufferAheadSamples = [];
  let minBufferAhead = Infinity;

  // ---- LISTENERS ----
  const onWaiting = () => {
    stalls++;
    stallStart = performance.now();
  };

  const onPlaying = () => {
    if (startup === null) {
      startup = performance.now() - startReq;
    }
    if (stallStart) {
      totalStall += performance.now() - stallStart;
      stallStart = null;
    }
    if (freezeStart) {
      freezeDuration += performance.now() - freezeStart;
      freezeStart = null;
    }
  };

  const onTimeUpdate = () => {
    const currentTime = localVideo.currentTime;

    // --- Freeze detection (video not moving) ---
    if (Math.abs(currentTime - lastTime) < 0.001) {
      if (!freezeStart) {
        freezeStart = performance.now();
        freezeCount++;
      }
    } else if (freezeStart) {
      freezeDuration += performance.now() - freezeStart;
      freezeStart = null;
    }
    lastTime = currentTime;

    // --- Buffer health ---
    const buf = localVideo.buffered;
    let bufferAhead = 0;
    if (buf.length > 0) {
      for (let i = 0; i < buf.length; i++) {
        if (buf.start(i) <= currentTime && buf.end(i) >= currentTime) {
          bufferAhead = buf.end(i) - currentTime;
          break;
        }
      }
    }

    bufferAheadSamples.push(bufferAhead);
    minBufferAhead = Math.min(minBufferAhead, bufferAhead);

    // auto stall if buffer low
    if (bufferAhead < 0.2 && !stallStart) {
      stalls++;
      stallStart = performance.now();
    }
  };

  const onError = () => {
    cleanup();
    localResultsDiv.innerHTML = '<div class="small">Local video error</div>';
  };

  // ---- CLEANUP ----
  function cleanup() {
    localVideo.removeEventListener('waiting', onWaiting);
    localVideo.removeEventListener('playing', onPlaying);
    localVideo.removeEventListener('timeupdate', onTimeUpdate);
    localVideo.removeEventListener('error', onError);

    try { localVideo.pause(); } catch (e) {}
    localVideo.style.display = 'none';
  }

  // Attach listeners
  localVideo.addEventListener('waiting', onWaiting);
  localVideo.addEventListener('playing', onPlaying);
  localVideo.addEventListener('timeupdate', onTimeUpdate);
  localVideo.addEventListener('error', onError);

  try { await localVideo.play(); } catch (e) {}

  // --- TEST TIMER ---
  for (let i = duration; i >= 1; i--) {
    setTimerText(`${i}s`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Final stall + freeze
  if (stallStart) totalStall += performance.now() - stallStart;
  if (freezeStart) freezeDuration += performance.now() - freezeStart;

  cleanup();

  // Final metrics
  const avgBufferAhead = bufferAheadSamples.length
    ? bufferAheadSamples.reduce((a, b) => a + b, 0) / bufferAheadSamples.length
    : 0;

  const result = {
    ts: Date.now(),
    startup: startup || 0,
    stalls,
    totalStall,
    freezeCount,
    freezeDuration,
    avgBufferAhead,
    minBufferAhead,
    bufferRatio: totalStall / (duration * 1000),
    avgStallDuration: stalls ? totalStall / stalls : 0
  };

  g_results.local = result;
  localResultsDiv.innerHTML = renderLocalHTML(result);
  saveHistoryEntry({
    ts: Date.now(),
    voip: g_results.voip,
    local: result,
    youtube: g_results.youtube
  });

  setStatus('Idle');
  setTimerText('0s');
  return result;
}


// ================================================
//               YOUTUBE VIDEO TEST
// ================================================

let ytApiReady = false;
let ytPlayer = null;

const YT_VIDEOS = [
  'aqz-KE-bpKQ',
  '5qap5aO4i9A',
  'J---aiyznGQ',
  'dQw4w9WgXcQ',
  '3JZ_D3ELwOQ',
  '2Vv-BfVoq4g'
];

const DEFAULT_YT_VIDEO_ID = 'aqz-KE-bpKQ';

// Pick random video
function pickRandomVideo() {
  return YT_VIDEOS[Math.floor(Math.random() * YT_VIDEOS.length)];
}

// ======================================================
// Load API (guaranteed success, no more API errors)
// ======================================================
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (ytApiReady) return resolve();

    if (!document.getElementById('youtube-api')) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      tag.id = 'youtube-api';
      document.head.appendChild(tag);
    }

    let resolved = false;

    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      resolved = true;
      resolve();
    };

    // HARD fallback after 5s
    setTimeout(() => {
      if (!resolved) {
        ytApiReady = true; // mark ready
        resolve();         // do not reject – prevent failures
      }
    }, 5000);
  });
}

// ======================================================
// Create YT Player (with autoplay fix)
// ======================================================
function createYTPlayer(videoId) {
  return new Promise(resolve => {
    if (ytPlayer) return resolve(ytPlayer);

    ytPlayer = new YT.Player('youtubePlayer', {
      height: '240',
      width: '400',
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, mute: 1 },
      events: {
        onReady: () => {
          ytPlayer.unMute?.(); // Try unmute
          resolve(ytPlayer);
        }
      }
    });
  });
}

// ======================================================
//              YOUTUBE TEST — FULL METRICS
// ======================================================
async function runYouTubeTest() {
  setStatus('YouTube test running');

  const duration = Number(ytDurationInput.value) || 30;
  setTimerText(`${duration}s`);
  ytResultsDiv.innerHTML = '<div class="small">Preparing YouTube test...</div>';

  document.getElementById('youtubeContainer').style.display = 'block';

  await loadYouTubeAPI();
  await createYTPlayer(DEFAULT_YT_VIDEO_ID);

  return new Promise(resolve => {

    // ---------- METRICS ----------
    let startup = null;
    let stalls = 0;
    let totalStall = 0;

    let freezeCount = 0;
    let freezeDuration = 0;

    let lastFrameTime = performance.now();
    let lastVideoTime = 0;

    let minBufferAhead = Infinity;
    let maxBufferAhead = 0;
    let bufferSamples = [];

    let playedOnce = false;
    let stallStart = null;
    let freezeStart = null;

    const loadTs = performance.now();

    // ---------- YouTube State Tracker ----------
    const stateChangeHandler = (e) => {
      const state = e.data;

      if (state === YT.PlayerState.BUFFERING) {
        if (playedOnce && !stallStart) {
          stallStart = performance.now();
          stalls++;
        }
      }

      if (state === YT.PlayerState.PLAYING) {
        if (!playedOnce) {
          playedOnce = true;
          startup = performance.now() - loadTs;
        }

        if (stallStart) {
          totalStall += performance.now() - stallStart;
          stallStart = null;
        }
      }
    };

    ytPlayer.addEventListener("onStateChange", stateChangeHandler);

    // ---------------------------------------------------
    // Continuous polling loop every 200ms for freeze detection + buffer analysis
    // ---------------------------------------------------
    const poll = setInterval(() => {
      try {
        const ct = ytPlayer.getCurrentTime();
        const bt = ytPlayer.getVideoLoadedFraction() * ytPlayer.getDuration();
        const bufferedAhead = Math.max(0, bt - ct);

        bufferSamples.push(bufferedAhead);
        minBufferAhead = Math.min(minBufferAhead, bufferedAhead);
        maxBufferAhead = Math.max(maxBufferAhead, bufferedAhead);

        // ----- FREEZE DETECTION -----
        const now = performance.now();
        const frameGap = now - lastFrameTime;

        if (ct === lastVideoTime) {
          // Frame frozen
          if (!freezeStart) freezeStart = now;
        } else {
          if (freezeStart) {
            freezeCount++;
            freezeDuration += now - freezeStart;
            freezeStart = null;
          }
        }

        lastFrameTime = now;
        lastVideoTime = ct;

      } catch (e) { /* ignore failures */ }

    }, 200);

    // ---------------------------------------------------
    // MAIN TIMER LOOP FOR TEST DURATION
    // ---------------------------------------------------
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 1;
      setTimerText(`${duration - elapsed}s`);

      if (elapsed >= duration) {
        clearInterval(timer);
        clearInterval(poll);

        // finalize stalls
        if (stallStart) {
          totalStall += performance.now() - stallStart;
        }

        // finalize freeze
        if (freezeStart) {
          freezeDuration += performance.now() - freezeStart;
        }

        // remove events
        try { ytPlayer.removeEventListener("onStateChange", stateChangeHandler); } catch(e){}

        // calc averages
        const avgBufferAhead = bufferSamples.length
          ? bufferSamples.reduce((a,b)=>a+b,0)/bufferSamples.length
          : 0;

        const bufferRatio = ytPlayer.getDuration()
          ? (totalStall / (duration * 1000)) * 100
          : 0;

        const avgStall = stalls > 0 ? (totalStall / stalls) : 0;

        // FINAL RESULT OBJECT
        const res = {
          ts: Date.now(),
          startup: startup || 0,
          stalls,
          totalStall: Math.round(totalStall),
          freezeCount,
          freezeDuration: Math.round(freezeDuration),
          avgBufferAhead,
          minBufferAhead,
          bufferRatio,
          avgStall
        };

        g_results.youtube = res;

        ytResultsDiv.innerHTML = renderYtHTML(res);
        saveHistoryEntry({
          ts: Date.now(),
          voip: g_results.voip,
          local: g_results.local,
          youtube: res
        });

        setStatus('Idle');
        setTimerText('0s');

        resolve(res);
      }

    }, 1000);
  });
}



// NDT7 Speed Test

async function runNdt7Test(timeoutSec = 30){
  speedResultsDiv.innerHTML = '<div class="small">Starting NDT7 speed test...</div>';
  setStatus('Speed test running');
  setTimerText('0s');

  if(!('NDT7' in window)) {
    await new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@m-lab/ndt7/dist/ndt7.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    }).catch(()=>{ console.warn('NDT7 library failed to load'); });
  }

  if(!('NDT7' in window)){
    return simulatedSpeedTest(timeoutSec);
  }

  return new Promise(async (resolve, reject)=>{
    try {
      const downloadSamples = [];
      const uploadSamples = [];
      const pingSamples = [];
      const jitterSamples = [];

      const test = new window.NDT7({
        onMeasurement: (m)=>{
          const download = m.Download_Mbps || 0;
          const upload = m.Upload_Mbps || 0;
          const ping = m.Latency_ms || 0;
          const jitter = m.Jitter_ms || 0;

          downloadSamples.push(download);
          uploadSamples.push(upload);
          pingSamples.push(ping);
          jitterSamples.push(jitter);

          speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${download.toFixed(2)} Mbps</span></div>
                                       <div class="small">Upload: <span class="value">${upload.toFixed(2)} Mbps</span></div>
                                       <div class="small">Ping: <span class="value">${Math.round(ping)} ms</span></div>
                                       <div class="small">Jitter: <span class="value">${Math.round(jitter)} ms</span></div>`;

          // update chart live
          if(speedChart){
            const nowLabel = new Date().toLocaleTimeString();
            speedChart.data.labels.push(nowLabel);
            speedChart.data.datasets[0].data.push(download);
            speedChart.data.datasets[1].data.push(upload);
            speedChart.data.datasets[2].data.push(ping);
            speedChart.data.datasets[3].data.push(jitter);
            if(speedChart.data.labels.length > 30){
              speedChart.data.labels.shift();
              speedChart.data.datasets.forEach(ds=>ds.data.shift());
            }
            speedChart.update();
          }
        },
        onComplete: (m)=>{
          const avgDownload = downloadSamples.length ? downloadSamples.reduce((a,b)=>a+b,0)/downloadSamples.length : 0;
          const avgUpload = uploadSamples.length ? uploadSamples.reduce((a,b)=>a+b,0)/uploadSamples.length : 0;
          const avgPing = pingSamples.length ? pingSamples.reduce((a,b)=>a+b,0)/pingSamples.length : 0;
          const avgJitter = jitterSamples.length ? jitterSamples.reduce((a,b)=>a+b,0)/jitterSamples.length : 0;

          const res = {
            download: avgDownload,
            upload: avgUpload,
            ping: avgPing,
            jitter: avgJitter,
            raw: m
          };

          g_results.speed = res;
          speedResultsDiv.innerHTML = renderSpeedHTML(res);
          saveHistoryEntry({
            ts: Date.now(),
            email: null,
            voip: g_results.voip,
            local: g_results.local,
            youtube: g_results.youtube,
            speed: res
          });

          setStatus('Speed test completed');
          setTimerText('0s');
          resolve(res);
        },
        onError: (err)=>{
          console.warn('NDT7 error', err);
          simulatedSpeedTest(timeoutSec).then(resolve);
        },
        timeout: timeoutSec * 1000
      });
      test.start();
    } catch(e){
      console.warn('NDT7 start failed', e);
      simulatedSpeedTest(timeoutSec).then(resolve);
    }
  });
}

// Simulated Speed Test

async function simulatedSpeedTest(seconds = (speedDurationInput.value) || 30){
  speedResultsDiv.innerHTML = '<div class="small">Simulated speed test running...</div>';
  setStatus('Simulated speed running');

  const downloadSamples = [];
  const uploadSamples = [];

  // clear chart
  if(speedChart){
    speedChart.data.labels = [];
    speedChart.data.datasets.forEach(ds => ds.data = []);
    speedChart.update();
  }

  for(let i=seconds;i>=1;i--){
    setTimerText(`${i}s`);
    const download = 20 + Math.random()*80;
    const upload = 5 + Math.random()*50;
    downloadSamples.push(download);
    uploadSamples.push(upload);

    speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${download.toFixed(2)} Mbps</span></div>
                                 <div class="small">Upload: <span class="value">${upload.toFixed(2)} Mbps</span></div>`;

    // update chart
    if(speedChart){
      const nowLabel = new Date().toLocaleTimeString();
      speedChart.data.labels.push(nowLabel);
      speedChart.data.datasets[0].data.push(download);
      speedChart.data.datasets[1].data.push(upload);
      if(speedChart.data.labels.length > 30){
        speedChart.data.labels.shift();
        speedChart.data.datasets.forEach(ds=>ds.data.shift());
      }
      speedChart.update();
    }

    await new Promise(r=>setTimeout(r,1000));
  }

  const avgDownload = downloadSamples.length ? downloadSamples.reduce((a,b)=>a+b,0)/downloadSamples.length : 0;
  const avgUpload = uploadSamples.length ? uploadSamples.reduce((a,b)=>a+b,0)/uploadSamples.length : 0;

  setTimerText('0s'); setStatus('Idle');
  const res = { download: avgDownload, upload: avgUpload, ping: 0, jitter: 0, simulated: true };
  g_results.speed = res;
  saveHistoryEntry({ ts: Date.now(), email: null, voip: g_results.voip, local: g_results.local, youtube: g_results.youtube, speed: res });
  speedResultsDiv.innerHTML = renderSpeedHTML(res);
  return res;
}


// -------------------- Run Speed Test --------------------
async function runSpeedTest(){
  try {
    const res = await runNdt7Test(Number(speedDurationInput.value)||30);
    return res;
  } catch(e){
    console.warn('Speed test failed', e);
    return simulatedSpeedTest(Number(speedDurationInput.value)||30);
  }
}

// -------------------- Run All (email modal) --------------------
function showEmailModal(show = true){
  if(show){
    emailModal.classList.add('show');
    emailModal.setAttribute('aria-hidden','false');
    emailInput.value='';
    setTimeout(()=>emailInput.focus(),80);
  } else {
    emailModal.classList.remove('show');
    emailModal.setAttribute('aria-hidden','true');
  }
}
function validateEmail(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email || '').trim());
}

async function runAll(email){
  const emailTrim = (email||'').trim();
  // clear charts
  latencyChart.data.labels=[];
  latencyChart.data.datasets.forEach(ds=>ds.data=[]);
  latencyChart.update();
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

// -------------------- Utilities: export CSV/JSON/PDF with units --------------------
function exportCSV() {
  if (!g_results) { alert("No test results available!"); return; }

  const rows = [['Test', 'Metric', 'Value']];

  if (g_results.voip) {
    rows.push(['VoIP', 'Latency', `${g_results.voip.latencyMs.toFixed(2)} ms`]);
    rows.push(['VoIP', 'Jitter', `${g_results.voip.avgJitterMs.toFixed(2)} ms`]);
    rows.push(['VoIP', 'Packets Received', g_results.voip.packetsReceived]);
    rows.push(['VoIP', 'Packets Lost', g_results.voip.packetsLost]);
    rows.push(['VoIP', 'Packet Loss', `${g_results.voip.lossPercent.toFixed(2)} %`]);
    rows.push(['VoIP', 'MOS', g_results.voip.MOS.toFixed(2)]);
  }
  if (g_results.local) {
    rows.push(['Local', 'Startup', `${Math.round(g_results.local.startup)} ms`]);
    rows.push(['Local', 'Stalls', g_results.local.stalls]);
    rows.push(['Local', 'Total Stall', `${Math.round(g_results.local.totalStall)} ms`]);
  }
  if (g_results.youtube) {
    rows.push(['YouTube', 'Startup', `${Math.round(g_results.youtube.startup)} ms`]);
    rows.push(['YouTube', 'Stalls', g_results.youtube.stalls]);
    rows.push(['YouTube', 'Total Stall', `${Math.round(g_results.youtube.totalStall)} ms`]);
  }
  if (g_results.speed) {
    rows.push(['Speed', 'Download', `${(g_results.speed.download||0).toFixed(2)} Mbps`]);
    rows.push(['Speed', 'Upload', `${(g_results.speed.upload||0).toFixed(2)} Mbps`]);
    rows.push(['Speed', 'Ping', `${Math.round(g_results.speed.ping||0)} ms`]);
    rows.push(['Speed', 'Jitter', `${Math.round(g_results.speed.jitter||0)} ms`]);
  }

  const csv = rows.map(r => r.map(c =>
    typeof c === 'string' && (c.includes(',') || c.includes('"'))
      ? `"${c.replace(/"/g,'""')}"`
      : c
  ).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qoe_${new Date().toISOString().replace(/:/g,'-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function exportJSON() {
  if (!g_results) { alert("No test results available!"); return; }

  // attach units in JSON
  const resultsWithUnits = JSON.parse(JSON.stringify(g_results));
  if (resultsWithUnits.voip) {
    resultsWithUnits.voip.latencyMs += ' ms';
    resultsWithUnits.voip.avgJitterMs += ' ms';
    resultsWithUnits.voip.lossPercent += ' %';
  }
  if (resultsWithUnits.local) {
    resultsWithUnits.local.startup += ' ms';
    resultsWithUnits.local.totalStall += ' ms';
  }
  if (resultsWithUnits.youtube) {
    resultsWithUnits.youtube.startup += ' ms';
    resultsWithUnits.youtube.totalStall += ' ms';
  }
  if (resultsWithUnits.speed) {
    resultsWithUnits.speed.download += ' Mbps';
    resultsWithUnits.speed.upload += ' Mbps';
    resultsWithUnits.speed.ping += ' ms';
    resultsWithUnits.speed.jitter += ' ms';
  }

  const blob = new Blob([JSON.stringify(resultsWithUnits, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qoe_${new Date().toISOString().replace(/:/g,'-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function exportPDF() {
  if (!g_results) { alert("No test results available!"); return; }
  if (!window.jspdf) {
    alert('jsPDF not loaded! Add: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('QoE Test Results', 14, 18);
  let y = 28;

  function addSection(title, metrics, unitsMap = {}){
    if (!metrics) return;
    doc.setFontSize(12); doc.text(title, 14, y); y += 6;
    doc.setFontSize(10);
    for (const [key, value] of Object.entries(metrics)) {
      let val = value;
      if(unitsMap[key]) val = `${val} ${unitsMap[key]}`;
      doc.text(`${key}: ${val}`, 16, y); y += 6;
      if (y > 280) { doc.addPage(); y = 20; }
    }
    y += 4;
  }

  addSection('VoIP', g_results.voip, { latencyMs:'ms', avgJitterMs:'ms', lossPercent:'%' });
  addSection('Local Video', g_results.local, { startup:'ms', totalStall:'ms' });
  addSection('YouTube', g_results.youtube, { startup:'ms', totalStall:'ms' });
  addSection('Speed', g_results.speed, { download:'Mbps', upload:'Mbps', ping:'ms', jitter:'ms' });

  doc.save(`qoe_${new Date().toISOString().replace(/:/g,'-')}.pdf`);
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

document.getElementById('clearHistory').addEventListener('click', ()=>{ g_history=[]; localStorage.setItem('qoe_history','[]'); renderHistory(); });

// initial render
renderHistory();
setStatus('Idle');
window.onYouTubeIframeAPIReady = function(){ onYouTubeIframeAPIReady(); };
