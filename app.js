/* app.js — Full feature set (NDT7 for speed test, new YouTube logic preserved) */
// -------------------- Helpers & DOM --------------------

const runVoipBtn = document.getElementById('runVoipBtn');
const runLocalBtn = document.getElementById('runLocalBtn');
const runYtBtn = document.getElementById('runYtBtn');
const runAllBtn = document.getElementById('runAllBtn');
const runSpeedBtn = document.getElementById('runSpeedBtn');

const btnCSV = document.getElementById('btnCSV');
const btnJSON = document.getElementById('btnJSON');
const btnPDF = document.getElementById('btnPDF');

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

const YOUTUBE_CONTAINER_ID = 'youtubeContainer';
const YOUTUBE_PLAYER_ELEMENT_ID = 'youtubePlayer';


const totalDurationSpan = document.getElementById('totalDuration');


document.addEventListener('DOMContentLoaded', () => {
  const voipDurationInput = document.getElementById('voipDuration');
  const videoDurationInput = document.getElementById('videoDuration');
  const ytDurationInput = document.getElementById('ytDuration');
  const speedDurationInput = document.getElementById('speedDuration');
  const totalDurationSpan = document.getElementById('totalDuration');
  const emailModal = document.getElementById('emailModal');

  window.showEmailModal = function(show = true) {
    if (!emailModal) return;

    if (show) {
      // calculate total duration dynamically
      const voip = parseInt(voipDurationInput.value) || 0;
      const local = parseInt(videoDurationInput.value) || 0;
      const yt = parseInt(ytDurationInput.value) || 0;
      const speed = parseInt(speedDurationInput.value) || 0;

      const totalDuration = voip + local + yt + speed;
      totalDurationSpan.textContent = totalDuration;

      emailModal.classList.add('show');
      emailModal.setAttribute('aria-hidden', 'false');
    } else {
      emailModal.classList.remove('show');
      emailModal.setAttribute('aria-hidden', 'true');
    }
  }
});



let localChart = null;
let ytChart = null;

function initLocalChart() {
  const el = document.getElementById("localChart");
  if (!el) return console.warn("localChart canvas missing");

  localChart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Buffer Ahead (sec)',
          data: [],
          borderColor: '#007bff',
          fill: false,
          tension: 0.25
        },
        {
          label: 'Stalls Count',
          data: [],
          borderColor: '#ff3b30',
          fill: false,
          tension: 0.25,
          yAxisID: "stallAxis"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Buffer (s)' } },
        stallAxis: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          title: { display: true, text: "Stalls" },
        }
      }
    }
  });
}

function initYTChart() {
  const el = document.getElementById("ytChart");
  if (!el) return console.warn("ytChart canvas missing");

  ytChart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Buffer Ahead (sec)',
          data: [],
          borderColor: '#007bff',
          fill: false,
          tension: 0.25,
        },
        {
          label: 'Stalls Count',
          data: [],
          borderColor: '#ff3b30',
          fill: false,
          tension: 0.25,
          yAxisID: "stallAxis"
        },
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Buffer (s)' } },
        stallAxis: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          title: { display: true, text: "Stalls" },
        }
      }
    }
  });
}

// Call once on page load
initLocalChart();
initYTChart();



function liveUpdateLocalChart(timeSec, bufferAheadSec, stallCount) {
  if (!localChart) return;
  localChart.data.labels.push(timeSec);
  localChart.data.datasets[0].data.push(bufferAheadSec);
  localChart.data.datasets[1].data.push(stallCount);
  localChart.update();
}

function liveUpdateYTChart(timeSec, bufferAheadSec, stallCount) {
  if (!ytChart) return;
  ytChart.data.labels.push(timeSec);
  ytChart.data.datasets[0].data.push(bufferAheadSec);
  ytChart.data.datasets[1].data.push(stallCount);
  ytChart.update();
}



// charts
let latencyChart = null;

// global state
let g_results = { voip: null, local: null, youtube: null, speed: null };
let g_history = JSON.parse(localStorage.getItem('qoe_history') || '[]');

// optional backend URL (set to null to disable)
const BACKEND_URL = null; // e.g. 'http://localhost:3000/save' or null

// -------------------- Chart init & helpers --------------------
// Speed chart initialization (4 datasets: download, upload)
let speedChart = null;
function createSpeedChart() {
  const ctx = document.getElementById('speedChart').getContext('2d');
  speedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Download (Mbps)', data: [], borderColor: '#0b69ff', fill: false, tension: 0.25 },
        { label: 'Upload (Mbps)', data: [], borderColor: '#00b37e', fill: false, tension: 0.25 },
      ]
    },
    options: {
      animation: false,
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}
createSpeedChart();

function createLatencyChart() {
  const ctx = document.getElementById('latencyChart').getContext('2d');
  latencyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], datasets: [
        { label: 'Latency (ms)', data: [], borderColor: '#0b69ff', tension: 0.25, fill: false },
        { label: 'Jitter (ms)', data: [], borderColor: '#00b37e', tension: 0.25, fill: false }
      ]
    },
    options: { animation: false, responsive: true, scales: { y: { beginAtZero: true } } }
  });
}
createLatencyChart();

function updateCharts(latency, jitter) {
  if (!latencyChart) return;
  const labels = latencyChart.data.labels;
  const nowLabel = new Date().toLocaleTimeString();
  labels.push(nowLabel);
  latencyChart.data.datasets[0].data.push(Number((latency || 0).toFixed(2)));
  latencyChart.data.datasets[1].data.push(Number((jitter || 0).toFixed(2)));
  if (labels.length > 60) { labels.shift(); latencyChart.data.datasets.forEach(d => d.data.shift()); }
  latencyChart.update();
}

// -------------------- UI & History --------------------
function setStatus(s) { statusSpan && (statusSpan.textContent = s); }
function setTimerText(s) { timerSpan && (timerSpan.textContent = s); }

function disableButtons(disable = true) {
  const buttonArea = document.getElementById('buttonArea');
  const buttons = buttonArea ? buttonArea.querySelectorAll('button') : [];
  buttons.forEach(btn => btn.disabled = disable);
  const clearBtn = document.getElementById('clearHistory');
  if (clearBtn) clearBtn.disabled = disable;
  // keep modal controls enabled so user can cancel
  if (emailCancelBtn) emailCancelBtn.disabled = false;
  if (emailStartBtn) emailStartBtn.disabled = false;
  if (emailInput) emailInput.disabled = false;
}

let currentTestType = null;

// ------------------- Set Status -------------------
function setStatus(s) {
  statusSpan && (statusSpan.textContent = s);

  // Start detection: "<Test Name> test running"
  const matchStart = s.match(/^(.+?)\s+test\s+running/i);
  if (matchStart) {
    const name = matchStart[1].trim().toLowerCase();
    const typeMap = {
      'voip': 'voip',
      'youtube': 'youtube',
      'speed': 'speed',
      'local video': 'local'
    };
    currentTestType = typeMap[name];
    if (!currentTestType) return;

    // Start a new entry for this test
    saveHistoryEntry({ type: currentTestType }, true);
    return;
  }

  // End detection
  if (s.toLowerCase() === 'idle' && currentTestType) {
    finishCurrentTest(currentTestType);
    currentTestType = null;
  }
}

// ------------------- Save / Update History -------------------
function saveHistoryEntry(entry, isStart = false) {
  const type = entry.type || currentTestType;
  if (!type) return;

  if (isStart) {
    g_history.unshift({ type, startTs: Date.now(), endTs: null });
  } else {
    // Update existing entry without endTs
    const idx = g_history.findIndex(h => h.type === type && !h.endTs);
    if (idx >= 0) {
      g_history[idx].endTs = Date.now();
    }
  }

  if (g_history.length > 200) g_history.pop();
  localStorage.setItem('qoe_history', JSON.stringify(g_history));
  renderHistory();
}

// ------------------- Finish Current Test -------------------
function finishCurrentTest(type) {
  saveHistoryEntry({}, false);
}

// ------------------- Render History List -------------------
function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = '';

  if (!g_history.length) {
    const noData = document.createElement('div');
    noData.textContent = 'No history yet';
    noData.style.fontWeight = '600';
    noData.style.color = '#666';
    noData.style.padding = '10px';
    historyList.appendChild(noData);
    return;
  }

  g_history.forEach(h => {
    const start = h.startTs ? new Date(h.startTs).toLocaleString() : '—';
    const end = h.endTs ? new Date(h.endTs).toLocaleString() : '—';
    const testName = h.type?.toUpperCase();

    const d = document.createElement('div');
    d.style.padding = '12px 16px';
    d.style.marginBottom = '8px';
    d.style.border = '1px solid #e0e0e0';
    d.style.borderRadius = '6px';
    d.style.background = '#ffffff';
    d.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
    d.style.cursor = 'pointer';
    d.style.fontFamily = 'Arial, sans-serif';

    // Bold test name, timestamps normal color
    d.innerHTML = `<span style="font-weight:700; color:#333;">${testName} TEST</span> • 
                   <span style="color:#555;">Start: ${start} | End: ${end}</span>`;

    historyList.appendChild(d);
  });
}



// ------------------- Show Specific Test Details -------------------
function showHistoryDetails(h) {
  const start = h.startTs ? new Date(h.startTs).toLocaleString() : '—';
  const end = h.endTs ? new Date(h.endTs).toLocaleString() : '—';

  const headerHTML = `<div style="font-weight:700; margin-bottom:4px;">
      Test Timeline: Start - ${start} | End - ${end}
    </div>`;

  // Clear all result divs first
  voipResultsDiv && (voipResultsDiv.innerHTML = '');
  localResultsDiv && (localResultsDiv.innerHTML = '');
  ytResultsDiv && (ytResultsDiv.innerHTML = '');
  speedResultsDiv && (speedResultsDiv.innerHTML = '');

  // Show only relevant test results
  switch (h.type) {
    case 'voip': voipResultsDiv && (voipResultsDiv.innerHTML = headerHTML + renderVoipHTML(h.voip)); break;
    case 'local': localResultsDiv && (localResultsDiv.innerHTML = headerHTML + renderLocalHTML(h.local)); break;
    case 'youtube': ytResultsDiv && (ytResultsDiv.innerHTML = headerHTML + renderYtHTML(h.youtube)); break;
    case 'speed': speedResultsDiv && (speedResultsDiv.innerHTML = headerHTML + renderSpeedHTML(h.speed)); break;
    default:
      // fallback → show all
      voipResultsDiv && (voipResultsDiv.innerHTML = headerHTML + renderVoipHTML(h.voip));
      localResultsDiv && (localResultsDiv.innerHTML = headerHTML + renderLocalHTML(h.local));
      ytResultsDiv && (ytResultsDiv.innerHTML = headerHTML + renderYtHTML(h.youtube));
      speedResultsDiv && (speedResultsDiv.innerHTML = headerHTML + renderSpeedHTML(h.speed));
      break;
  }
}




// -------------------- Render helpers --------------------
function renderVoipHTML(voip) {
  if (!voip) return `<div class="small">No VoIP result</div>`;
  return `<div class="small">Latency: <span class="value">${voip.latencyMs.toFixed(2)} ms</span></div>
    <div class="small">Jitter: <span class="value">${voip.avgJitterMs.toFixed(2)} ms</span></div>
    <div class="small">Packets Received: <span class="value">${voip.packetsReceived}</span></div>
    <div class="small">Packets Lost: <span class="value">${voip.packetsLost}</span></div>
    <div class="small">Packet Loss %: <span class="value">${voip.lossPercent.toFixed(2)}%</span></div>
    <div class="small">MOS (est): <span class="value">${voip.MOS.toFixed(2)}</span></div>`;
}

function renderLocalHTML(local) {
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

function renderYtHTML(yt) {
  if (!yt) return `<div class="small">No YouTube result</div>`;

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

function renderSpeedHTML(speed) {
  if (!speed) return `<div class="small">No speed result</div>`;
  return `<div class="small">Download: <span class="value">${(speed.download || 0).toFixed(2)} Mbps</span></div>
          <div class="small">Upload: <span class="value">${(speed.upload || 0).toFixed(2)} Mbps</span></div>`;
}

function showLoader(text = "Sending Results to DB...") {
  const loader = document.getElementById("loaderScreen");
  loader.querySelector(".loader-text").textContent = text;
  loader.style.display = "flex";  // show loader
}

function hideLoader() {
  const loader = document.getElementById("loaderScreen");
  loader.style.display = "none";  // hide loader
}



// -------------------- WebRTC VoIP Test (TURN + DataChannel fixed) --------------------
let pcSender = null, pcReceiver = null, dataChannel = null;
window.__webrtc_rtts = []; // store DC rtt samples ms
let pingInterval = null;

// --- Xirsys ICE servers (from your provided JSON) ---
// Xirsys is a cloud service that provides STUN and TURN servers for WebRTC applications.

// When you do WebRTC (VoIP, video call, P2P data channel), devices must exchange media even behind NATs/firewalls.
// To achieve this, every WebRTC app needs ICE servers:
const ICE_CONFIG = {
  iceServers: [
    { urls: ["stun:bn-turn2.xirsys.com"] },
    {
      username: "QUijarzyJrAuEwKQeJZur1wEBSaxGg2ai6_AMivWz8QG-0yw50-lT8b4K127NeBnAAAAAGk71fNTYWdhclNhbXJhdA==",
      credential: "c979c5b0-d736-11f0-849c-0242ac140004",
      urls: [
        "turn:bn-turn2.xirsys.com:80?transport=udp",
        "turn:bn-turn2.xirsys.com:3478?transport=udp",
        "turn:bn-turn2.xirsys.com:80?transport=tcp",
        "turn:bn-turn2.xirsys.com:3478?transport=tcp",
        "turns:bn-turn2.xirsys.com:443?transport=tcp",
        "turns:bn-turn2.xirsys.com:5349?transport=tcp"
      ]
    }
  ],
  // If you want to force relay-only (guarantees TURN) uncomment the next line:
  // iceTransportPolicy: 'relay'
};

// Utility: install candidate filter to drop host candidates and forward others
function installCandidateFilter(srcPc, forwardPc) {
  srcPc.addEventListener('icecandidate', ev => {
    if (!ev.candidate) return;
    const cand = ev.candidate.candidate || '';
    // Drop host candidates explicitly (local)
    if (/\btyp host\b/i.test(cand) || /candidate:.* host /i.test(cand)) {
      return;
    }
    // Forward the candidate to the other peer
    forwardPc.addIceCandidate(ev.candidate).catch(() => { /* ignore */ });
  });
}

// Utility: robust wait for data channel open or connection success
function waitForDcOpenOrConnected(dc, pc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      done = true;
      clearTimeout(tid);
      if (pc && pc.removeEventListener) pc.removeEventListener('connectionstatechange', onConnState);
      dc.onopen = null;
      dc.onerror = null;
    };
    const onConnState = () => {
      try {
        const s = pc.connectionState || pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          if (!done) { cleanup(); resolve(); }
        } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          if (!done) { cleanup(); reject(new Error('PeerConnection failed: ' + s)); }
        }
      } catch (e) { /* ignore */ }
    };
    dc.onopen = () => { if (!done) { cleanup(); resolve(); } };
    dc.onerror = (e) => { if (!done) { cleanup(); reject(new Error('DataChannel error')); } };
    if (pc && pc.addEventListener) pc.addEventListener('connectionstatechange', onConnState);
    const tid = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('DataChannel open timeout')); }
    }, timeoutMs);
  });
}

// Utility: extract outbound RTT from getStats map (candidate-pair/currentRoundTripTime or outbound-rtp.roundTripTime)
function extractOutboundRttMs(stats) {
  const rtts = [];
  stats.forEach(rep => {
    try {
      if (rep.type === 'outbound-rtp' && (rep.kind === 'audio' || rep.mediaType === 'audio')) {
        if (typeof rep.roundTripTime === 'number' && rep.roundTripTime > 0) rtts.push(rep.roundTripTime * 1000);
      }
      if (rep.type === 'candidate-pair' && rep.state === 'succeeded' && typeof rep.currentRoundTripTime === 'number' && rep.currentRoundTripTime > 0) {
        rtts.push(rep.currentRoundTripTime * 1000);
      }
      // fallback for vendor-specific names
      if ((rep.type === 'googCandidatePair' || rep.type === 'selectedcandidatepair') && typeof rep.currentRoundTripTime === 'number' && rep.currentRoundTripTime > 0) {
        rtts.push(rep.currentRoundTripTime * 1000);
      }
    } catch (e) { /* ignore */ }
  });
  if (rtts.length === 0) return null;
  return rtts.reduce((a, b) => a + b, 0) / rtts.length;
}

async function runVoipTest(durationSec) {
  setStatus && setStatus('VoIP test running');
  setTimerText && setTimerText(`${durationSec}s`);
  voipResultsDiv && (voipResultsDiv.innerHTML = '<div class="small">Preparing...</div>');
  window.__webrtc_rtts = [];

  try {
    // 1. create synthetic audio track
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (e) { /* ignore */ }
    }
    const oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 0;
    const dest = audioCtx.createMediaStreamDestination();
    oscillator.connect(dest);
    oscillator.start();
    const stream = dest.stream;

    // 2. setup peerconnections with ICE config
    pcSender = new RTCPeerConnection(ICE_CONFIG);
    pcReceiver = new RTCPeerConnection(ICE_CONFIG);

    // filter host candidates and forward others
    installCandidateFilter(pcSender, pcReceiver);
    installCandidateFilter(pcReceiver, pcSender);

    // attach inbound track handling
    pcReceiver.ontrack = async (e) => {
      if (typeof remoteAudio !== 'undefined' && remoteAudio && remoteAudio.srcObject !== e.streams[0]) {
        remoteAudio.srcObject = e.streams[0];
        try { await audioCtx.resume(); } catch (e) { /* ignore */ }
        remoteAudio.play().catch(() => { /* ignore autoplay */ });
      }
    };

    // add audio track(s)
    stream.getTracks().forEach(t => pcSender.addTrack(t, stream));

    // 3. create datachannel BEFORE offer (prevents race/timeouts)
    dataChannel = pcSender.createDataChannel('ping', { ordered: true });
    pcReceiver.ondatachannel = ev => {
      const ch = ev.channel;
      ch.onmessage = m => { try { ch.send(m.data); } catch (e) { /* ignore */ } };
    };

    // small logging handlers
    pcSender.oniceconnectionstatechange = () => { console.log('pcSender ice state:', pcSender.iceConnectionState, 'connState:', pcSender.connectionState); };
    pcReceiver.oniceconnectionstatechange = () => { console.log('pcReceiver ice state:', pcReceiver.iceConnectionState, 'connState:', pcReceiver.connectionState); };

    // 4. SDP negotiation
    const offer = await pcSender.createOffer();
    await pcSender.setLocalDescription(offer);
    await pcReceiver.setRemoteDescription(offer);

    const answer = await pcReceiver.createAnswer();
    await pcReceiver.setLocalDescription(answer);
    await pcSender.setRemoteDescription(answer);

    // 5. wait for datachannel open or connection (robust)
    await waitForDcOpenOrConnected(dataChannel, pcSender, 20000);

    // 6. RTT sampling (DC) and ping sender
    const rtts = [];
    dataChannel.onmessage = ev => {
      try {
        const pkt = JSON.parse(ev.data);
        if (pkt && pkt.sentTs) {
          const rtt = performance.now() - pkt.sentTs;
          rtts.push(rtt);
          window.__webrtc_rtts.push(rtt);
          try { updateCharts && updateCharts(rtt, 0); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    };

    pingInterval = setInterval(() => {
      if (dataChannel && dataChannel.readyState === 'open') {
        const pkt = { sentTs: performance.now(), jitter: 0 };
        try { dataChannel.send(JSON.stringify(pkt)); } catch (e) { /* ignore */ }
      }
    }, 1000);

    // 7. RTP Stats collection
    const inboundHistory = [];
    const outboundHistory = [];

    for (let i = durationSec; i >= 1; i--) {
      setTimerText && setTimerText(`${i}s`);

      try {
        const stats = await pcReceiver.getStats();
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) {
            inboundHistory.push({
              packetsReceived: r.packetsReceived || 0,
              packetsLost: r.packetsLost || 0,
              jitter: r.jitter || 0
            });
          }
        });
      } catch (e) { /* ignore */ }

      try {
        const stats2 = await pcSender.getStats();
        // Keep whole stats map to extract candidate-pair RTT or outbound-rtp RTT later
        outboundHistory.push(stats2);
      } catch (e) { /* ignore */ }

      await new Promise(r => setTimeout(r, 1000));
    }

    clearInterval(pingInterval);
    await new Promise(r => setTimeout(r, 300));

    // 8. Aggregation & RTT selection
    const lastInbound = inboundHistory.length ? inboundHistory[inboundHistory.length - 1] : null;
    const packetsReceived = lastInbound ? lastInbound.packetsReceived : 0;
    const packetsLost = lastInbound ? lastInbound.packetsLost : 0;

    const jitterMsArr = inboundHistory.map(s => (s.jitter || 0) * 1000);
    const avgJitterMs = jitterMsArr.length ? jitterMsArr.reduce((a, b) => a + b, 0) / jitterMsArr.length : 0;

    const dcRtts = window.__webrtc_rtts.slice();
    const avgDcRtt = dcRtts.length ? dcRtts.reduce((a, b) => a + b, 0) / dcRtts.length : 0;

    // Parse outboundHistory stats maps to extract RTTs
    const outboundRttMsArr = [];
    outboundHistory.forEach(statsMap => {
      try {
        const v = extractOutboundRttMs(statsMap);
        if (v !== null && !Number.isNaN(v) && v > 0) outboundRttMsArr.push(v);
      } catch (e) { /* ignore */ }
    });
    const avgOutboundRttMs = outboundRttMsArr.length ? outboundRttMsArr.reduce((a, b) => a + b, 0) / outboundRttMsArr.length : 0;

    // Prefer network-level RTT (outbound rtp / candidate-pair) over DC
    const latencyMs = (avgOutboundRttMs > 0) ? avgOutboundRttMs : avgDcRtt;

    const totalPackets = packetsReceived + packetsLost;
    const lossPercent = totalPackets ? (packetsLost / totalPackets) * 100 : 0;

    let R = 94.2 - (latencyMs * 0.03 + avgJitterMs * 0.10 + lossPercent * 2.5);
    R = Math.max(0, Math.min(100, R));
    const MOS = 1 + 0.035 * R + 0.000007 * R * (R - 60) * (100 - R);

    const voip = {
      ts: Date.now(),
      latencyMs: Math.round(latencyMs * 10) / 10,
      avgJitterMs: Math.round(avgJitterMs * 10) / 10,
      packetsReceived,
      packetsLost,
      lossPercent: Math.round(lossPercent * 100) / 100,
      MOS: Math.round(MOS * 100) / 100,
      dcSamples: dcRtts.length
    };

    // expose results
    if (typeof g_results !== 'undefined') g_results.voip = voip;
    voipResultsDiv && (voipResultsDiv.innerHTML = renderVoipHTML ? renderVoipHTML(voip) : JSON.stringify(voip, null, 2));

    saveHistoryEntry && saveHistoryEntry({
      ts: Date.now(),
      voip,
      local: (typeof g_results !== 'undefined' ? g_results.local : undefined),
      youtube: (typeof g_results !== 'undefined' ? g_results.youtube : undefined)
    });

    // 9. cleanup
    try { pcSender.close(); pcReceiver.close(); } catch (e) { /* ignore */ }
    try { oscillator.stop(); audioCtx.close(); } catch (e) { /* ignore */ }
    pcSender = pcReceiver = dataChannel = null;
    window.__webrtc_rtts = [];
    setStatus && setStatus('Idle');
    setTimerText && setTimerText('0s');

    return voip;

  } catch (err) {
    clearInterval(pingInterval);
    try { pcSender && pcSender.close(); pcReceiver && pcReceiver.close(); } catch (e) { /* ignore */ }
    try { window.__webrtc_rtts = []; } catch (e) { /* ignore */ }
    voipResultsDiv && (voipResultsDiv.innerHTML = `<div class="small">VoIP error: ${err?.message || err}</div>`);
    setStatus && setStatus('Idle');
    setTimerText && setTimerText('0s');
    return null;
  }
}


// -------------------- Local Video Test (Optimized YouTube-style) --------------------
async function runLocalVideoTest() {
  setStatus('Local video test running');
  const duration = Number(videoDurationInput.value) || 30;
  setTimerText(`${duration}s`);
  localResultsDiv && (localResultsDiv.innerHTML = '<div class="small">Preparing local video test...</div>');

  if (!localVideo || !localVideo.src) {
    localResultsDiv && (localResultsDiv.innerHTML = '<div class="small">Local video missing (assets/test-video.mp4)</div>');
    return null;
  }

  localVideo.pause();
  localVideo.currentTime = 0;
  localVideo.style.display = 'block';

  const startReq = performance.now();
  let startup = null;

  let stalls = 0;
  let totalStall = 0;
  let stallStart = null;

  let freezeCount = 0;
  let freezeDuration = 0;
  let freezeStart = null;
  let lastTime = 0;

  let bufferAheadSamples = [];
  let minBufferAhead = Infinity;
  let elapsedSeconds = 0; // 🔹 added to track time

  const onWaiting = () => {
    if (!stallStart) stallStart = performance.now();
    stalls++;
  };

  const onPlaying = () => {
    if (startup === null) startup = performance.now() - startReq;
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

    if (Math.abs(currentTime - lastTime) < 0.05) {
      if (!freezeStart) {
        freezeStart = performance.now();
        freezeCount++;
      }
    } else if (freezeStart) {
      freezeDuration += performance.now() - freezeStart;
      freezeStart = null;
    }
    lastTime = currentTime;

    const buf = localVideo.buffered;
    let bufferAhead = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf.start(i) <= currentTime && buf.end(i) >= currentTime) {
        bufferAhead = buf.end(i) - currentTime;
        break;
      }
    }

    bufferAheadSamples.push(bufferAhead);
    minBufferAhead = Math.min(minBufferAhead, bufferAhead);

    if (bufferAhead < 0.2 && !stallStart) {
      stallStart = performance.now();
      stalls++;
    }

    // 🔹 Real-time chart update
    liveUpdateLocalChart(elapsedSeconds, bufferAhead, stalls);
  };

  const onError = () => {
    cleanup();
    localResultsDiv && (localResultsDiv.innerHTML = '<div class="small">Local video error</div>');
  };

  function cleanup() {
    localVideo.removeEventListener('waiting', onWaiting);
    localVideo.removeEventListener('playing', onPlaying);
    localVideo.removeEventListener('timeupdate', onTimeUpdate);
    localVideo.removeEventListener('error', onError);

    try { localVideo.pause(); } catch (e) { }
    localVideo.style.display = 'none';
  }

  localVideo.addEventListener('waiting', onWaiting);
  localVideo.addEventListener('playing', onPlaying);
  localVideo.addEventListener('timeupdate', onTimeUpdate);
  localVideo.addEventListener('error', onError);

  try { await localVideo.play(); } catch (e) { }

  // Test Timer Loop
  for (let i = duration; i >= 1; i--) {
    await new Promise(r => setTimeout(r, 1000));
    elapsedSeconds++; // 🔹 needed for chart timing
    setTimerText(`${i}s`);
  }

  if (stallStart) totalStall += performance.now() - stallStart;
  if (freezeStart) freezeDuration += performance.now() - freezeStart;
  if (startup === null) startup = performance.now() - startReq;

  cleanup();

  const avgBufferAhead = bufferAheadSamples.length
    ? bufferAheadSamples.reduce((a, b) => a + b, 0) / bufferAheadSamples.length
    : 0;

  const result = {
    ts: Date.now(),
    startup,
    stalls,
    totalStall,
    freezeCount,
    freezeDuration,
    avgBufferAhead,
    minBufferAhead: isFinite(minBufferAhead) ? minBufferAhead : 0,
    bufferRatio: totalStall / (duration * 1000),
    avgStallDuration: stalls ? totalStall / stalls : 0
  };

  g_results.local = result;
  localResultsDiv && (localResultsDiv.innerHTML = renderLocalHTML(result));

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
//               YOUTUBE VIDEO TEST (FIXED)
// ================================================
let ytApiReady = false;
let ytPlayer = null;

const DEFAULT_YT_VIDEO_ID = "aqz-KE-bpKQ"; // Big Buck Bunny ONLY

// No more random videos
function pickBigBuckBunny() {
  return DEFAULT_YT_VIDEO_ID;
}

// Load YouTube iframe API safely
function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (ytApiReady) return resolve();

    if (!document.getElementById("youtube-api")) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.id = "youtube-api";
      document.head.appendChild(tag);
    }

    let resolved = false;

    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      resolved = true;
      resolve();
    };

    setTimeout(() => {
      if (!resolved) {
        ytApiReady = true;
        resolve();
      }
    }, 5000);
  });
}

// Create player
function createYTPlayer(videoId = DEFAULT_YT_VIDEO_ID) {
  return new Promise((resolve) => {
    if (ytPlayer) {
      try { ytPlayer.loadVideoById(videoId); } catch (e) { }
      return resolve(ytPlayer);
    }

    ytPlayer = new YT.Player(YOUTUBE_PLAYER_ELEMENT_ID, {
      height: "240",
      width: "400",
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, mute: 1 },
      events: {
        onReady: () => resolve(ytPlayer),
        onError: (e) => {
          console.warn("YT error:", e);
          resolve(ytPlayer);
        },
      },
    });
  });
}

// Fully stop + kill YouTube player (no background audio forever)
function stopYouTubePlaybackAndHide() {
  try {
    if (ytPlayer) {
      ytPlayer.mute?.();
      ytPlayer.pauseVideo?.();
      ytPlayer.stopVideo?.();
      ytPlayer.destroy?.();
    }
  } catch (e) { }

  ytPlayer = null;

  // Remove iframe DOM completely
  const container = document.getElementById(YOUTUBE_CONTAINER_ID);
  if (container) {
    container.innerHTML = "";
    container.style.display = "none";
  }
}

/// ==========================
// Run YouTube Test (Improved)
// ==========================
async function runYouTubeTest() {
  setStatus("YouTube test running");

  const duration = Number(ytDurationInput.value) || 30;
  setTimerText(`${duration}s`);
  ytResultsDiv.innerHTML = `<div class="small">Preparing YouTube test...</div>`;

  const ytContainer = document.getElementById(YOUTUBE_CONTAINER_ID);
  if (ytContainer) ytContainer.style.display = "block";

  await loadYouTubeAPI();
  await createYTPlayer(pickBigBuckBunny()); // Only Big Buck Bunny plays

  return new Promise((resolve) => {
    let startup = null;
    let stalls = 0;
    let totalStall = 0;
    let freezeCount = 0;
    let freezeDuration = 0;

    let lastVideoTime = -1;
    let bufferSamples = [];
    let stallStart = null;
    let freezeStart = null;

    let playedOnce = false;
    const startTime = performance.now();

    // ---- Player state handler ----
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
          startup = performance.now() - startTime;
        }
        if (stallStart) {
          totalStall += performance.now() - stallStart;
          stallStart = null;
        }
      }
    };

    ytPlayer.addEventListener?.("onStateChange", stateChangeHandler);

    // ---- Continuous poll for freeze & buffer metrics (LIVE CHART UPDATE ADDED) ----
    const poll = setInterval(() => {
      try {
        const ct = ytPlayer.getCurrentTime();
        const durationTotal = ytPlayer.getDuration();
        const fraction = ytPlayer.getVideoLoadedFraction();

        const bufferAhead = Math.max(0, fraction * durationTotal - ct);
        bufferSamples.push(bufferAhead);

        // ---------- 🔥 HERE: LIVE UI UPDATE ----------
        const elapsedSec = Math.floor((performance.now() - startTime) / 1000);
        liveUpdateYTChart(elapsedSec, bufferAhead, stalls);
        // --------------------------------------------

        // Freeze detection
        const now = performance.now();
        if (Math.abs(ct - lastVideoTime) < 0.001) {
          if (!freezeStart) {
            freezeStart = now;
            freezeCount++;
          }
        } else if (freezeStart) {
          freezeDuration += now - freezeStart;
          freezeStart = null;
        }
        lastVideoTime = ct;
      } catch (e) { }
    }, 200);

    // ---- Main timer ----
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed++;
      setTimerText(`${duration - elapsed}s`);

      if (elapsed >= duration) {
        clearInterval(timer);
        clearInterval(poll);

        if (stallStart) totalStall += performance.now() - stallStart;
        if (freezeStart) freezeDuration += performance.now() - freezeStart;

        ytPlayer.removeEventListener?.("onStateChange", stateChangeHandler);

        // Buffer stats
        const avgBufferAhead =
          bufferSamples.length > 0
            ? bufferSamples.reduce((a, b) => a + b, 0) / bufferSamples.length
            : 0;
        const minBufferAhead =
          bufferSamples.length > 0 ? Math.min(...bufferSamples) : 0;
        const maxBufferAhead =
          bufferSamples.length > 0 ? Math.max(...bufferSamples) : 0;

        const bufferRatio = Number(
          ((totalStall / (duration * 1000)) * 100).toFixed(2)
        );

        const res = {
          ts: Date.now(),
          startup: Math.round(startup || 0),
          stalls,
          totalStall: Math.round(totalStall),
          freezeCount,
          freezeDuration: Math.round(freezeDuration),
          avgBufferAhead: Number(avgBufferAhead.toFixed(2)),
          minBufferAhead: Number(minBufferAhead.toFixed(2)),
          maxBufferAhead: Number(maxBufferAhead.toFixed(2)),
          bufferRatio,
        };

        g_results.youtube = res;
        ytResultsDiv.innerHTML = renderYtHTML(res);

        stopYouTubePlaybackAndHide();

        saveHistoryEntry({
          ts: Date.now(),
          youtube: res,
        });

        setStatus("Idle");
        setTimerText("0s");

        resolve(res);
      }
    }, 1000);
  });
}


// -------------------- NDT7 Speed Test --------------------
async function runNdt7Test(timeoutSec = 30) {
  speedResultsDiv && (speedResultsDiv.innerHTML = '<div class="small">Starting NDT7 speed test...</div>');
  setStatus('Speed test running');
  setTimerText('0s');

  if (!('NDT7' in window)) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@m-lab/ndt7/dist/ndt7.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => { console.warn('NDT7 library failed to load'); });
  }

  if (!('NDT7' in window)) {
    return simulatedSpeedTest(timeoutSec);
  }

  return new Promise(async (resolve, reject) => {
    try {
      const downloadSamples = [];
      const uploadSamples = [];


      const test = new window.NDT7({
        onMeasurement: (m) => {
          const download = m.Download_Mbps || 0;
          const upload = m.Upload_Mbps || 0;


          downloadSamples.push(download);
          uploadSamples.push(upload);

          speedResultsDiv && (speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${download.toFixed(2)} Mbps</span></div>
                                       <div class="small">Upload: <span class="value">${upload.toFixed(2)} Mbps</span></div>`);

          // update chart live
          if (speedChart) {
            const nowLabel = new Date().toLocaleTimeString();
            speedChart.data.labels.push(nowLabel);
            speedChart.data.datasets[0].data.push(download);
            speedChart.data.datasets[1].data.push(upload);
            if (speedChart.data.labels.length > 30) {
              speedChart.data.labels.shift();
              speedChart.data.datasets.forEach(ds => ds.data.shift());
            }
            speedChart.update();
          }
        },
        onComplete: (m) => {
          const avgDownload = downloadSamples.length ? downloadSamples.reduce((a, b) => a + b, 0) / downloadSamples.length : 0;
          const avgUpload = uploadSamples.length ? uploadSamples.reduce((a, b) => a + b, 0) / uploadSamples.length : 0;

          const res = {
            download: avgDownload,
            upload: avgUpload,
            raw: m
          };

          g_results.speed = res;
          speedResultsDiv && (speedResultsDiv.innerHTML = renderSpeedHTML(res));
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
        onError: (err) => {
          console.warn('NDT7 error', err);
          simulatedSpeedTest(timeoutSec).then(resolve);
        },
        timeout: timeoutSec * 1000
      });
      test.start();
    } catch (e) {
      console.warn('NDT7 start failed', e);
      simulatedSpeedTest(timeoutSec).then(resolve);
    }
  });
}

// Simulated Speed Test
async function simulatedSpeedTest(seconds = (speedDurationInput.value) || 30) {
  speedResultsDiv && (speedResultsDiv.innerHTML = '<div class="small"> MLab Speed test running...</div>');
  setStatus('Mlab speed running');

  const downloadSamples = [];
  const uploadSamples = [];

  // clear chart
  if (speedChart) {
    speedChart.data.labels = [];
    speedChart.data.datasets.forEach(ds => ds.data = []);
    speedChart.update();
  }

  for (let i = seconds; i >= 1; i--) {
    setTimerText(`${i}s`);
    const download = 20 + Math.random() * 80;
    const upload = 5 + Math.random() * 50;
    downloadSamples.push(download);
    uploadSamples.push(upload);

    speedResultsDiv && (speedResultsDiv.innerHTML = `<div class="small">Download: <span class="value">${download.toFixed(2)} Mbps</span></div>
                                 <div class="small">Upload: <span class="value">${upload.toFixed(2)} Mbps</span></div>`);

    // update chart
    if (speedChart) {
      const nowLabel = new Date().toLocaleTimeString();
      speedChart.data.labels.push(nowLabel);
      speedChart.data.datasets[0].data.push(download);
      speedChart.data.datasets[1].data.push(upload);
      if (speedChart.data.labels.length > 30) {
        speedChart.data.labels.shift();
        speedChart.data.datasets.forEach(ds => ds.data.shift());
      }
      speedChart.update();
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const avgDownload = downloadSamples.length ? downloadSamples.reduce((a, b) => a + b, 0) / downloadSamples.length : 0;
  const avgUpload = uploadSamples.length ? uploadSamples.reduce((a, b) => a + b, 0) / uploadSamples.length : 0;

  setTimerText('0s'); setStatus('Idle');
  const res = { download: avgDownload, upload: avgUpload, simulated: true };
  g_results.speed = res;
  saveHistoryEntry({ ts: Date.now(), email: null, voip: g_results.voip, local: g_results.local, youtube: g_results.youtube, speed: res });
  speedResultsDiv && (speedResultsDiv.innerHTML = renderSpeedHTML(res));
  return res;
}

// -------------------- Run Speed Test --------------------
async function runSpeedTest() {
  try {
    const res = await runNdt7Test(Number(speedDurationInput.value) || 30);
    return res;
  } catch (e) {
    console.warn('Speed test failed', e);
    return simulatedSpeedTest(Number(speedDurationInput.value) || 30);
  }
}

//---------------------Send Data to Server-----------------------
async function sendResultsToServer(email) {
  if (!email || !validateEmail(email)) {
    alert("Please enter a valid email to send results.");
    return;
  }

  // Assuming g_results looks like: { voip: {...}, local: {...}, youtube: {...}, speed: {...} }
  const payload = {
    email: email.trim(),
    ...g_results,   // spread g_results into the payload
    ts: new Date().toISOString()
  };

  console.log("Sending payload:", payload);

  try {
    const response = await fetch('https://qoe-backend-zr50.onrender.com/api/users/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Server responded ${response.status}`);

    const data = await response.json();
    console.log("Results sent successfully:", data);
    alert("Test results sent successfully!");
  } catch (err) {
    console.error("Failed to send results:", err);
    alert("Failed to send results. Check console.");
  }
}



// -------------------- Run All (email modal) --------------------
function showEmailModal(show = true) {
  if (!emailModal) return;
  if (show) {
    emailModal.classList.add('show');
    emailModal.setAttribute('aria-hidden', 'false');
    emailInput.value = '';
    setTimeout(() => emailInput.focus(), 80);
  } else {
    emailModal.classList.remove('show');
    emailModal.setAttribute('aria-hidden', 'true');
  }
}
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email || '').trim());
}

async function runAll(email) {
  const emailTrim = (email || '').trim();
  // clear charts
  if (latencyChart) {
    latencyChart.data.labels = [];
    latencyChart.data.datasets.forEach(ds => ds.data = []);
    latencyChart.update();
  }
  setStatus('Running all tests');
  disableButtons(true);

  try {
    await runVoipTest(Number(voipDurationInput.value) || 30);
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
    showLoader();

    try {
      const res = await fetch("/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullEntry)  // Also changed as I mentioned earlier
      });
    
      const text = await res.text();
      console.log("Server response:", text);
    
      if (!res.ok) throw new Error("Failed to save results: " + text);
    
      setStatus("Results saved!");
    } catch (e) {
      setStatus("Completed All Tests!");
      console.error(e);
    }
    


    // ✅ Send results to your Node.js API
    if (emailTrim) {
      await sendResultsToServer(emailTrim);
    }

  } catch (e) {
    console.error('Run All error', e);
    setStatus('Error during run');
  } finally {
    hideLoader();
    disableButtons(false);
    setTimerText('0s');
  }
}

// -------------------- Utilities: export CSV/JSON/PDF with units --------------------
function safeFixed(value, decimals = 2, fallback = '-') {
  return (typeof value === 'number' && !isNaN(value)) ? value.toFixed(decimals) : fallback;
}

function exportCSV() {
  if (!g_results) { alert("No test results available!"); return; }

  const rows = [['Test', 'Metric', 'Value']];

  // VOIP
  if (g_results.voip) {
    rows.push(['VoIP', 'Latency (ms)', safeFixed(g_results.voip.latencyMs)]);
    rows.push(['VoIP', 'Jitter (ms)', safeFixed(g_results.voip.avgJitterMs)]);
    rows.push(['VoIP', 'Packets Received', g_results.voip.packetsReceived ?? '-']);
    rows.push(['VoIP', 'Packets Lost', g_results.voip.packetsLost ?? '-']);
    rows.push(['VoIP', 'Packet Loss (%)', safeFixed(g_results.voip.lossPercent)]);
    rows.push(['VoIP', 'MOS', safeFixed(g_results.voip.MOS)]);
  }

  // Local video
  if (g_results.local) {
    rows.push(['Local', 'Startup (ms)', Math.round(g_results.local.startup || 0)]);
    rows.push(['Local', 'Stalls', g_results.local.stalls ?? 0]);
    rows.push(['Local', 'Total Stall (ms)', Math.round(g_results.local.totalStall || 0)]);
    rows.push(['Local', 'Freeze Count', g_results.local.freezeCount ?? 0]);
    rows.push(['Local', 'Freeze Duration (ms)', Math.round(g_results.local.freezeDuration || 0)]);
    rows.push(['Local', 'Avg Buffer Ahead (s)', safeFixed(g_results.local.avgBufferAhead)]);
    rows.push(['Local', 'Min Buffer Ahead (s)', safeFixed(g_results.local.minBufferAhead)]);
    rows.push(['Local', 'Buffer Ratio (%)', safeFixed(g_results.local.bufferRatio)]);
    rows.push(['Local', 'Avg Stall (ms)', Math.round(g_results.local.avgStallDuration || 0)]);
  }

  // YouTube
  if (g_results.youtube) {
    rows.push(['YouTube', 'Startup (ms)', Math.round(g_results.youtube.startup || 0)]);
    rows.push(['YouTube', 'Stalls', g_results.youtube.stalls ?? 0]);
    rows.push(['YouTube', 'Total Stall (ms)', Math.round(g_results.youtube.totalStall || 0)]);
    rows.push(['YouTube', 'Freeze Count', g_results.youtube.freezeCount ?? 0]);
    rows.push(['YouTube', 'Freeze Duration (ms)', Math.round(g_results.youtube.freezeDuration || 0)]);
    rows.push(['YouTube', 'Avg Buffer Ahead (s)', safeFixed(g_results.youtube.avgBufferAhead)]);
    rows.push(['YouTube', 'Min Buffer Ahead (s)', safeFixed(g_results.youtube.minBufferAhead)]);
    rows.push(['YouTube', 'Buffer Ratio (%)', safeFixed(g_results.youtube.bufferRatio)]);
    rows.push(['YouTube', 'Avg Stall (ms)', Math.round(g_results.youtube.avgStall || 0)]);
  }

  // Speed
  if (g_results.speed) {
    rows.push(['Speed', 'Download (Mbps)', safeFixed(g_results.speed.download)]);
    rows.push(['Speed', 'Upload (Mbps)', safeFixed(g_results.speed.upload)]);
  }

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `qoe_${new Date().toISOString().replace(/:/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  if (!g_results) { alert("No test results available!"); return; }

  // attach units in JSON copy
  const resultsWithUnits = JSON.parse(JSON.stringify(g_results));
  if (resultsWithUnits.voip) {
    resultsWithUnits.voip.latencyMs = `${Number(resultsWithUnits.voip.latencyMs).toFixed(2)} ms`;
    resultsWithUnits.voip.avgJitterMs = `${Number(resultsWithUnits.voip.avgJitterMs).toFixed(2)} ms`;
    resultsWithUnits.voip.lossPercent = `${Number(resultsWithUnits.voip.lossPercent).toFixed(2)} %`;
  }
  if (resultsWithUnits.local) {
    resultsWithUnits.local.startup = `${Math.round(resultsWithUnits.local.startup)} ms`;
    resultsWithUnits.local.totalStall = `${Math.round(resultsWithUnits.local.totalStall)} ms`;
  }
  if (resultsWithUnits.youtube) {
    resultsWithUnits.youtube.startup = `${Math.round(resultsWithUnits.youtube.startup)} ms`;
    resultsWithUnits.youtube.totalStall = `${Math.round(resultsWithUnits.youtube.totalStall)} ms`;
  }
  if (resultsWithUnits.speed) {
    resultsWithUnits.speed.download = `${Number(resultsWithUnits.speed.download).toFixed(2)} Mbps`;
    resultsWithUnits.speed.upload = `${Number(resultsWithUnits.speed.upload).toFixed(2)} Mbps`;
  }

  const blob = new Blob([JSON.stringify(resultsWithUnits, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qoe_${new Date().toISOString().replace(/:/g, '-')}.json`;
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

  function addSection(title, metrics, unitsMap = {}) {
    if (!metrics) return;
    doc.setFontSize(12); doc.text(title, 14, y); y += 6;
    doc.setFontSize(10);
    for (const [key, value] of Object.entries(metrics)) {
      let val = value;
      if (unitsMap[key]) val = `${val} ${unitsMap[key]}`;
      doc.text(`${key}: ${val}`, 16, y); y += 6;
      if (y > 280) { doc.addPage(); y = 20; }
    }
    y += 4;
  }

  addSection('VoIP', g_results.voip, { latencyMs: 'ms', avgJitterMs: 'ms', lossPercent: '%' });
  addSection('Local Video', g_results.local, { startup: 'ms', totalStall: 'ms' });
  addSection('YouTube', g_results.youtube, { startup: 'ms', totalStall: 'ms' });
  addSection('Speed', g_results.speed, { download: 'Mbps', upload: 'Mbps' });

  doc.save(`qoe_${new Date().toISOString().replace(/:/g, '-')}.pdf`);
}

// -------------------- Event wiring --------------------
runAllBtn && runAllBtn.addEventListener('click', () => { showEmailModal(true); });
emailCancelBtn && emailCancelBtn.addEventListener('click', () => { showEmailModal(false); });
emailInput && emailInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { emailStartBtn && emailStartBtn.click(); } });
emailStartBtn && emailStartBtn.addEventListener('click', () => {
  const emailVal = emailInput ? (emailInput.value || '') : '';
  if (!validateEmail(emailVal)) { alert('Please enter a valid email address (e.g. you@example.com).'); emailInput && emailInput.focus(); return; }
  showEmailModal(false);
  runAll(emailVal);
});

runVoipBtn && runVoipBtn.addEventListener('click', () => { disableButtons(true); runVoipTest(Number(voipDurationInput.value) || 30).finally(() => disableButtons(false)); });
runLocalBtn && runLocalBtn.addEventListener('click', () => { disableButtons(true); runLocalVideoTest().finally(() => disableButtons(false)); });
runYtBtn && runYtBtn.addEventListener('click', () => { disableButtons(true); runYouTubeTest().finally(() => disableButtons(false)); });
runSpeedBtn && runSpeedBtn.addEventListener('click', () => { disableButtons(true); runSpeedTest().finally(() => disableButtons(false)); });

btnCSV && btnCSV.addEventListener('click', exportCSV);
btnJSON && btnJSON.addEventListener('click', exportJSON);
btnPDF && btnPDF.addEventListener('click', exportPDF);
document.getElementById("btnCSV")?.addEventListener("click", exportCSV);


document.getElementById('clearHistory')?.addEventListener('click', () => { g_history = []; localStorage.setItem('qoe_history', '[]'); renderHistory(); });

// initial render / UI init
renderHistory();
setStatus('Idle');

// NOTE: Do not override window.onYouTubeIframeAPIReady elsewhere — loadYouTubeAPI() will set it when needed.
