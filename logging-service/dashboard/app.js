// Core Visual State
let eventSource = null;
let loggersConfig = [];
let totalLogsCount = 0;
let droppedLogsCount = 0;
let blockedThreads = new Set();
let activeThreadsCount = 0;

// Presets Definition
const PRESETS = {
    'standard': [
        {
            name: "root",
            propagate: true,
            destinations: [
                { min_level: "DEBUG", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "console", async: false, queue_capacity: 100, backpressure_policy: "BLOCK" },
                { min_level: "WARN", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "file", file_path: "app.log", async: true, queue_capacity: 10, backpressure_policy: "BLOCK" }
            ]
        },
        { name: "app", propagate: true, destinations: [] },
        { name: "app.service", propagate: true, destinations: [] },
        { name: "app.db", propagate: true, destinations: [] }
    ],
    'async-heavy': [
        {
            name: "root",
            propagate: true,
            destinations: [
                { min_level: "INFO", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "console", async: false, queue_capacity: 100, backpressure_policy: "BLOCK" }
            ]
        },
        {
            name: "app",
            propagate: true,
            destinations: [
                { min_level: "DEBUG", formatter: "json", sink: "file", file_path: "app.log", async: true, queue_capacity: 5, backpressure_policy: "DROP_NEWEST" }
            ]
        },
        {
            name: "app.service",
            propagate: true,
            destinations: [
                { min_level: "DEBUG", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "memory", async: true, queue_capacity: 5, backpressure_policy: "BLOCK" }
            ]
        },
        { name: "app.db", propagate: true, destinations: [] }
    ],
    'hierarchy': [
        {
            name: "root",
            propagate: true,
            destinations: [
                { min_level: "DEBUG", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "console", async: false, queue_capacity: 100, backpressure_policy: "BLOCK" }
            ]
        },
        {
            name: "app",
            propagate: false, // Disables log propagation to root!
            destinations: [
                { min_level: "INFO", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "file", file_path: "app.log", async: false, queue_capacity: 100, backpressure_policy: "BLOCK" }
            ]
        },
        {
            name: "app.service",
            propagate: true,
            destinations: [
                { min_level: "DEBUG", formatter: "plain", pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}", sink: "memory", async: false, queue_capacity: 100, backpressure_policy: "BLOCK" }
            ]
        },
        { name: "app.db", propagate: true, destinations: [] }
    ]
};

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    setupSliders();
    setupConfigPresets();
    fetchConfig();
    startSSEListener();

    // Resize handler for SVG connectors
    window.addEventListener("resize", () => {
        setTimeout(drawConnectors, 100);
    });

    // Apply configuration button
    document.getElementById("apply-config-btn").addEventListener("click", applyConfig);

    // Simulation buttons
    document.getElementById("start-sim-btn").addEventListener("click", startSimulation);
    document.getElementById("stop-sim-btn").addEventListener("click", stopSimulation);
});

// Setup Form Sliders Value Sync
function setupSliders() {
    const sliders = [
        { id: "sim-threads", valId: "sim-threads-val", suffix: "" },
        { id: "sim-logs", valId: "sim-logs-val", suffix: "" },
        { id: "sim-interval", valId: "sim-interval-val", suffix: "秒" }
    ];

    sliders.forEach(s => {
        const sliderEl = document.getElementById(s.id);
        const valEl = document.getElementById(s.valId);
        if (sliderEl && valEl) {
            sliderEl.addEventListener("input", () => {
                valEl.innerText = sliderEl.value + s.suffix;
            });
        }
    });
}

// Preset Handler
function setupConfigPresets() {
    loggersConfig = JSON.parse(JSON.stringify(PRESETS['standard']));
    renderConfigForm();
}

function switchConfigPreset(presetKey) {
    // Toggles active state
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    event.currentTarget.classList.add("active");

    loggersConfig = JSON.parse(JSON.stringify(PRESETS[presetKey]));
    renderConfigForm();
}

// Fetch Current Config
async function fetchConfig() {
    try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            // Re-map formatters & patterns
            loggersConfig = data;
            renderConfigForm();
            setTimeout(renderTopology, 100);
        }
    } catch (e) {
        console.error("Error fetching config:", e);
    }
}

// Render dynamic configuration form in the sidebar
function renderConfigForm() {
    const form = document.getElementById("logger-config-form");
    form.innerHTML = "";

    loggersConfig.forEach((logger, logIdx) => {
        const loggerCard = document.createElement("div");
        loggerCard.className = "config-logger-card";
        
        loggerCard.innerHTML = `
            <div class="config-logger-header">
                <span>📂 logger: <strong>${logger.name}</strong></span>
                <label style="font-size:0.75rem; font-weight:normal; margin-bottom:0; display:flex; align-items:center; gap:4px;">
                    <input type="checkbox" id="prop-${logIdx}" ${logger.propagate ? 'checked' : ''} onchange="updatePropagate(${logIdx}, this.checked)"> 伝播 (Propagate)
                </label>
            </div>
            <div id="dests-${logIdx}"></div>
            <button type="button" class="clear-btn" style="width:100%; margin-top:8px; font-size:0.7rem;" onclick="addDestinationField(${logIdx})">➕ 宛先 (Destination) を追加</button>
        `;

        form.appendChild(loggerCard);

        // Render its destinations
        const destsContainer = loggerCard.querySelector(`#dests-${logIdx}`);
        logger.destinations.forEach((dest, destIdx) => {
            const destCard = document.createElement("div");
            destCard.className = "config-dest-card";
            
            destCard.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h5>🎯 Destination: ${dest.id || '新規'}</h5>
                    <button type="button" class="clear-btn" style="color:var(--error-color); padding:1px 6px;" onclick="removeDestinationField(${logIdx}, ${destIdx})">削除</button>
                </div>
                <div class="config-row">
                    <div>
                        <label>最小レベル:</label>
                        <select onchange="updateDestField(${logIdx}, ${destIdx}, 'min_level', this.value)">
                            <option value="DEBUG" ${dest.min_level === 'DEBUG' ? 'selected' : ''}>DEBUG</option>
                            <option value="INFO" ${dest.min_level === 'INFO' ? 'selected' : ''}>INFO</option>
                            <option value="WARN" ${dest.min_level === 'WARN' ? 'selected' : ''}>WARN</option>
                            <option value="ERROR" ${dest.min_level === 'ERROR' ? 'selected' : ''}>ERROR</option>
                            <option value="FATAL" ${dest.min_level === 'FATAL' ? 'selected' : ''}>FATAL</option>
                        </select>
                    </div>
                    <div>
                        <label>書式 (Formatter):</label>
                        <select onchange="updateDestField(${logIdx}, ${destIdx}, 'formatter', this.value)">
                            <option value="plain" ${dest.formatter === 'plain' ? 'selected' : ''}>Plain Text</option>
                            <option value="json" ${dest.formatter === 'json' ? 'selected' : ''}>JSON Formatter</option>
                        </select>
                    </div>
                </div>
                <div class="config-row">
                    <div>
                        <label>出力先 (Sink):</label>
                        <select onchange="updateDestField(${logIdx}, ${destIdx}, 'sink', this.value)">
                            <option value="console" ${dest.sink === 'console' || dest.sink === 'ConsoleSink' ? 'selected' : ''}>Console (Stdout)</option>
                            <option value="file" ${dest.sink === 'file' || dest.sink === 'FileSink' ? 'selected' : ''}>File (Disk)</option>
                            <option value="memory" ${dest.sink === 'memory' || dest.sink === 'MemorySink' ? 'selected' : ''}>Memory Buffer</option>
                        </select>
                    </div>
                    <div>
                        <label>非同期 (Async) モード:</label>
                        <select onchange="updateDestField(${logIdx}, ${destIdx}, 'async', this.value === 'true')">
                            <option value="false" ${!dest.async ? 'selected' : ''}>同期 (Sync)</option>
                            <option value="true" ${dest.async ? 'selected' : ''}>非同期 (Async)</option>
                        </select>
                    </div>
                </div>
                ${dest.async ? `
                <div class="config-row">
                    <div>
                        <label>キュー容量:</label>
                        <input type="number" value="${dest.queue_capacity || 10}" min="1" max="1000" onchange="updateDestField(${logIdx}, ${destIdx}, 'queue_capacity', parseInt(this.value))">
                    </div>
                    <div>
                        <label>バックプレッシャー:</label>
                        <select onchange="updateDestField(${logIdx}, ${destIdx}, 'backpressure_policy', this.value)">
                            <option value="BLOCK" ${dest.backpressure_policy === 'BLOCK' ? 'selected' : ''}>BLOCK (待機)</option>
                            <option value="DROP_NEWEST" ${dest.backpressure_policy === 'DROP_NEWEST' ? 'selected' : ''}>DROP NEWEST</option>
                            <option value="DROP_OLDEST" ${dest.backpressure_policy === 'DROP_OLDEST' ? 'selected' : ''}>DROP OLDEST</option>
                            <option value="THROW" ${dest.backpressure_policy === 'THROW' ? 'selected' : ''}>THROW (例外)</option>
                        </select>
                    </div>
                </div>
                ` : ''}
            `;
            destsContainer.appendChild(destCard);
        });
    });
}

function updatePropagate(loggerIdx, val) {
    loggersConfig[loggerIdx].propagate = val;
}

function addDestinationField(loggerIdx) {
    loggersConfig[loggerIdx].destinations.push({
        min_level: "INFO",
        formatter: "plain",
        pattern: "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}",
        sink: "console",
        async: false,
        queue_capacity: 10,
        backpressure_policy: "BLOCK"
    });
    renderConfigForm();
}

function removeDestinationField(loggerIdx, destIdx) {
    loggersConfig[loggerIdx].destinations.splice(destIdx, 1);
    renderConfigForm();
}

function updateDestField(loggerIdx, destIdx, field, val) {
    loggersConfig[loggerIdx].destinations[destIdx][field] = val;
    // Reload form to toggle async parameters dynamically
    if (field === 'async') {
        renderConfigForm();
    }
}

// POST Applied Config to Server
async function applyConfig() {
    const btn = document.getElementById("apply-config-btn");
    btn.disabled = true;
    
    // Simple custom patterns
    loggersConfig.forEach(logger => {
        logger.destinations.forEach(dest => {
            if (dest.sink === 'file') {
                dest.file_path = "app.log";
            }
        });
    });

    try {
        const res = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loggersConfig)
        });
        const data = await res.json();
        
        if (data.status === "ok") {
            appendTerminalLine("stderr", "SYSTEM: ロギング構成が正常に更新され、初期化されました。", "system-msg");
            appendTerminalLine("console", "SYSTEM: Console stdout terminal cleared.", "system-msg");
            appendTerminalLine("file", "SYSTEM: Disk app.log buffer truncated.", "system-msg");
            
            // Clean dynamic values
            totalLogsCount = 0;
            droppedLogsCount = 0;
            blockedThreads.clear();
            updateMetricsCounters();

            // Refresh topologies
            await fetchConfig();
        }
    } catch (e) {
        appendTerminalLine("stderr", "ERROR applying configuration: " + e.getMessage(), "error-msg");
    } finally {
        btn.disabled = false;
    }
}

// RENDER REAL-TIME VISUAL FLOWTOPOLOGY
function renderTopology() {
    const loggerListEl = document.getElementById("nodes-loggers");
    const destListEl = document.getElementById("nodes-destinations");
    const sinkListEl = document.getElementById("nodes-sinks");

    loggerListEl.innerHTML = "";
    destListEl.innerHTML = "";
    sinkListEl.innerHTML = "";

    const activeDests = new Map();
    const activeSinks = new Map();

    // 1. Render Logger Nodes
    loggersConfig.forEach(logger => {
        const node = document.createElement("div");
        node.className = "vis-node node-logger";
        node.id = `node-log-${logger.name.replace(/\./g, '_')}`;
        node.innerHTML = `
            <h4>${logger.name}</h4>
            <p>${logger.propagate ? '伝播: 有効 (propagate)' : '伝播: 無効 (stop)'}</p>
        `;
        loggerListEl.appendChild(node);

        // Track destinations
        logger.destinations.forEach(dest => {
            activeDests.set(dest.id, dest);
        });
    });

    // 2. Render Destination Nodes
    activeDests.forEach(dest => {
        const node = document.createElement("div");
        node.className = "vis-node node-destination";
        node.id = `node-dest-${dest.id}`;
        
        let sinkName = "Console (Stdout)";
        if (dest.sink === "file" || dest.sink === "FileSink") sinkName = "File (app.log)";
        if (dest.sink === "memory" || dest.sink === "MemorySink") sinkName = "Memory Buffer";

        node.innerHTML = `
            <div class="dest-row">
                <span class="dest-name">${dest.id}</span>
                <div class="dest-badges">
                    <span class="badge ${dest.async ? 'badge-async' : 'badge-sync'}">${dest.async ? 'Async' : 'Sync'}</span>
                    <span class="badge badge-${dest.min_level.toLowerCase()}">${dest.min_level}</span>
                </div>
            </div>
            
            <div class="dest-row" style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">
                <span>書式: ${dest.formatter === 'json' ? 'JSON' : 'Plain Text'}</span>
            </div>

            <!-- Lock Indicator -->
            <div class="lock-indicator idle" id="lock-${dest.id}">
                <span class="lock-icon">🔓</span>
                <span class="lock-status">Mutex Idle</span>
            </div>

            <!-- Bounded Queue Bar if Async -->
            ${dest.async ? `
            <div class="queue-bar-container">
                <div class="queue-label-row">
                    <span>非同期バッファキュー</span>
                    <span id="queue-lbl-${dest.id}">0 / ${dest.queue_capacity}</span>
                </div>
                <div class="queue-blocks" id="queue-bar-${dest.id}">
                    ${renderQueueBlocks(0, dest.queue_capacity)}
                </div>
                <div class="queue-label-row" style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
                    <span>オーバーフロー時:</span>
                    <strong style="color:var(--primary-color);">${dest.backpressure_policy}</strong>
                </div>
            </div>
            ` : ''}
        `;
        destListEl.appendChild(node);
        
        activeSinks.set(dest.sink, sinkName);
    });

    // 3. Render Sink Nodes
    activeSinks.forEach((name, type) => {
        const node = document.createElement("div");
        node.className = "vis-node node-sink";
        
        let cleanType = type.toLowerCase();
        if (cleanType.includes("console")) cleanType = "console";
        if (cleanType.includes("file")) cleanType = "file";
        if (cleanType.includes("memory")) cleanType = "memory";

        node.id = `node-sink-${cleanType}`;
        node.innerHTML = `
            <h4>${name}</h4>
            <p>>_ ${cleanType.toUpperCase()}_STREAM</p>
        `;
        sinkListEl.appendChild(node);
    });

    // Trigger path overlay calculation
    setTimeout(drawConnectors, 200);
}

function renderQueueBlocks(size, capacity) {
    let html = "";
    // Draw 10 blocks representing fractions
    for (let i = 0; i < 10; i++) {
        html += `<div class="queue-block"></div>`;
    }
    return html;
}

// Dynamic Bezier Path Drawer
function drawConnectors() {
    const svg = document.getElementById("svg-connectors");
    if (!svg) return;
    svg.innerHTML = "";

    const svgRect = svg.getBoundingClientRect();

    // 1. Logger to Destination links
    loggersConfig.forEach(logger => {
        const loggerId = `node-log-${logger.name.replace(/\./g, '_')}`;
        const loggerEl = document.getElementById(loggerId);
        if (!loggerEl) return;

        // Collect all destinations logger hits (direct or propagated)
        const dests = getLoggerDestinations(logger);
        
        dests.forEach(destId => {
            const destEl = document.getElementById(`node-dest-${destId}`);
            if (!destEl) return;
            drawBezierCurve(svg, svgRect, loggerEl, destEl, `path-${loggerId}-${destId}`);
        });
    });

    // 2. Destination to Sink links
    loggersConfig.forEach(logger => {
        logger.destinations.forEach(dest => {
            const destEl = document.getElementById(`node-dest-${dest.id}`);
            if (!destEl) return;

            let cleanType = dest.sink.toLowerCase();
            if (cleanType.includes("console")) cleanType = "console";
            if (cleanType.includes("file")) cleanType = "file";
            if (cleanType.includes("memory")) cleanType = "memory";

            const sinkEl = document.getElementById(`node-sink-${cleanType}`);
            if (!sinkEl) return;

            drawBezierCurve(svg, svgRect, destEl, sinkEl, `path-${dest.id}-${cleanType}`);
        });
    });
}

function getLoggerDestinations(logger) {
    const destIds = [];
    let curr = logger;
    while (curr) {
        curr.destinations.forEach(d => {
            if (!destIds.includes(d.id)) destIds.push(d.id);
        });
        if (!curr.propagate) break;
        // Find parent
        curr = loggersConfig.find(l => l.name === curr.parent);
    }
    return destIds;
}

function drawBezierCurve(svg, svgRect, el1, el2, pathId) {
    const r1 = el1.getBoundingClientRect();
    const r2 = el2.getBoundingClientRect();

    // Output is right edge of node 1, input is left edge of node 2
    const x1 = r1.right - svgRect.left;
    const y1 = r1.top + r1.height / 2 - svgRect.top;

    const x2 = r2.left - svgRect.left;
    const y2 = r2.top + r2.height / 2 - svgRect.top;

    const x_mid = (x1 + x2) / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x_mid} ${y1}, ${x_mid} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", "connector-link");
    path.setAttribute("id", pathId);

    svg.appendChild(path);
}

// SSE REAL-TIME TELEMETRY RECEIVER
function startSSEListener() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource("/api/events");

    eventSource.addEventListener("connected", (e) => {
        document.getElementById("connection-status").innerText = "接続中（常時監視中）";
        appendTerminalLine("stderr", "SYSTEM: リアルタイムテレメトリSSEストリームに接続しました。", "system-msg");
    });

    eventSource.addEventListener("log_emitted", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;
        
        // Update metric
        totalLogsCount++;
        updateMetricsCounters();

        // Animate logger node
        const loggerNodeId = `node-log-${data.logger.replace(/\./g, '_')}`;
        pulseNodeAnimation(loggerNodeId);
    });

    eventSource.addEventListener("log_process", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        // Pulse destination node
        pulseNodeAnimation(`node-dest-${data.dest_id}`);

        // Animate SVG path link
        const loggerNodeId = `node-log-${data.logger.replace(/\./g, '_')}`;
        const pathId = `path-${loggerNodeId}-${data.dest_id}`;
        pulsePathAnimation(pathId);
    });

    eventSource.addEventListener("log_filtered", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        appendTerminalLine("stderr", `FILTER: ログレベル低のため宛先 ${data.dest_id} で破棄されました: "${data.message}" (Emitted Level: ${data.record_level}, Threshold: ${data.min_level})`, "line-debug");
    });

    eventSource.addEventListener("queue_status", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        updateQueueVisualizer(data.dest_id, data.size, data.capacity);
    });

    eventSource.addEventListener("queue_overflow", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        appendTerminalLine("stderr", `⚠️ OVERFLOW: 宛先 ${data.dest_id} のバッファキューが満杯です! [Policy: ${data.policy}] - Thread: ${data.thread}`, "line-warn");
        
        if (data.policy === "DROP_NEWEST" || data.policy === "DROP_OLDEST" || data.policy === "THROW") {
            droppedLogsCount++;
            updateMetricsCounters();
        }
    });

    eventSource.addEventListener("log_dropped_oldest", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;
        droppedLogsCount++;
        updateMetricsCounters();
        appendTerminalLine("stderr", `🗑️ DROP OLDEST: 宛先 ${data.dest_id} は新しいログを受信したため、キュー内の最も古いログ "${data.dropped_message}" を破棄しました。`, "line-warn");
    });

    eventSource.addEventListener("thread_blocked", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        blockedThreads.add(data.thread);
        updateMetricsCounters();
        
        // Visual indicator on lock / queue status
        appendTerminalLine("stderr", `⏳ BLOCKED: 送信スレッド "${data.thread}" はキューが満杯のためブロックされ、空きを待機しています。 (BLOCKポリシーによる一時停止)`, "line-warn");
    });

    eventSource.addEventListener("thread_unblocked", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        blockedThreads.delete(data.thread);
        updateMetricsCounters();
        
        appendTerminalLine("stderr", `🔓 UNBLOCKED: 送信スレッド "${data.thread}" は待機から復帰しました。 (待機時間: ${data.blocked_duration.toFixed(3)}秒)`, "line-info");
    });

    eventSource.addEventListener("lock_wait", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        updateLockState(data.dest_id, "waiting", `競合スレッド: ${data.thread}`);
    });

    eventSource.addEventListener("lock_acquired", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        updateLockState(data.dest_id, "acquired", `ロック獲得: ${data.thread}`);
    });

    eventSource.addEventListener("lock_released", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        updateLockState(data.dest_id, "idle", "Mutex Idle");
    });

    eventSource.addEventListener("sink_write", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        let termId = "console";
        if (data.target === "file") termId = "file";
        if (data.target === "stderr") termId = "stderr";

        // Parse log level from string if plain text to apply class
        let levelClass = "line-info";
        if (data.text.includes("[DEBUG]")) levelClass = "line-debug";
        if (data.text.includes("[WARN]")) levelClass = "line-warn";
        if (data.text.includes("[ERROR]")) levelClass = "line-error";
        if (data.text.includes("[FATAL]")) levelClass = "line-fatal";
        
        // For json
        if (data.text.startsWith("{")) {
            try {
                const parsed = JSON.parse(data.text);
                if (parsed.level) levelClass = `line-${parsed.level.toLowerCase()}`;
            } catch (err) {}
        }

        appendTerminalLine(termId, data.text, levelClass);
        
        // Pulse sink animation
        let cleanType = data.sink.toLowerCase();
        if (cleanType.includes("console")) cleanType = "console";
        if (cleanType.includes("file")) cleanType = "file";
        if (cleanType.includes("memory")) cleanType = "memory";
        pulseNodeAnimation(`node-sink-${cleanType}`);
        
        // Pulse connection to sink
        pulsePathAnimation(`path-${data.dest_id || ''}-${cleanType}`);
    });

    eventSource.addEventListener("simulation_exception", (e) => {
        const payload = JSON.parse(e.data);
        const data = payload.data;

        appendTerminalLine("stderr", `❌ EXCEPTION: スレッド ${data.thread} はログ送信中に例外 ${data.type} をスローしました! メッセージ: "${data.error}" (THROWポリシーによるクラッシュ)`, "error-msg");
    });

    eventSource.onerror = (e) => {
        document.getElementById("connection-status").innerText = "切断（再接続を試みています...）";
        appendTerminalLine("stderr", "SYSTEM: コネクションが切断されました。再接続しています...", "error-msg");
    };
}

// UPDATE CORE TELEMETRY METRICS
function updateMetricsCounters() {
    document.getElementById("metric-total-logs").innerText = totalLogsCount;
    document.getElementById("metric-active-threads").innerText = activeThreadsCount;
    document.getElementById("metric-blocked-threads").innerText = blockedThreads.size;
    document.getElementById("metric-dropped-logs").innerText = droppedLogsCount;
}

// RENDER ANIMATION PULSES
function pulseNodeAnimation(nodeId) {
    const el = document.getElementById(nodeId);
    if (!el) return;
    el.classList.add("active-pulse");
    setTimeout(() => {
        el.classList.remove("active-pulse");
    }, 180);
}

function pulsePathAnimation(pathId) {
    const el = document.getElementById(pathId);
    if (!el) return;
    el.classList.add("active");
    // Remove after particle transition completes
    setTimeout(() => {
        el.classList.remove("active");
    }, 1200);
}

function updateLockState(destId, state, labelText) {
    const el = document.getElementById(`lock-${destId}`);
    if (!el) return;

    el.className = `lock-indicator ${state}`;
    
    let icon = "🔓";
    if (state === "waiting") icon = "🔒 ⏳";
    if (state === "acquired") icon = "🔒 🔒";
    
    el.querySelector(".lock-icon").innerText = icon;
    el.querySelector(".lock-status").innerText = labelText;
}

function updateQueueVisualizer(destId, size, capacity) {
    const lbl = document.getElementById(`queue-lbl-${destId}`);
    if (lbl) {
        lbl.innerText = `${size} / ${capacity}`;
    }

    const container = document.getElementById(`queue-bar-${destId}`);
    if (!container) return;

    const fraction = size / capacity;
    const filledCount = Math.round(fraction * 10);

    const blocks = container.querySelectorAll(".queue-block");
    blocks.forEach((block, idx) => {
        block.className = "queue-block"; // clear
        
        if (idx < filledCount) {
            block.classList.add("filled");
            if (fraction >= 0.9) {
                block.classList.add("danger");
            } else if (fraction >= 0.6) {
                block.classList.add("warning");
            }
        }
    });
}

// TERMINAL INTERFACES
function appendTerminalLine(termId, text, className) {
    const term = document.getElementById(`term-${termId}`);
    if (!term) return;

    const line = document.createElement("div");
    line.className = `terminal-line ${className || ''}`;
    line.innerText = text;

    term.appendChild(line);

    // Limit log lines to 100 to prevent tab memory bloat
    if (term.children.length > 100) {
        term.removeChild(term.firstChild);
    }

    // Scroll to bottom automatically
    term.scrollTop = term.scrollHeight;
}

function clearTerminal(termId) {
    const term = document.getElementById(`term-${termId}`);
    if (term) {
        term.innerHTML = `<div class="terminal-line system-msg">Terminal buffer cleared.</div>`;
    }
}

// CONTROL DRIVERS (SIMULATOR REST CALLS)
async function startSimulation() {
    const threads = parseInt(document.getElementById("sim-threads").value);
    const logs = parseInt(document.getElementById("sim-logs").value);
    const interval = parseFloat(document.getElementById("sim-interval").value);
    const logger = document.getElementById("sim-logger").value;

    const levels = [];
    document.querySelectorAll("input[name='sim-level']:checked").forEach(cb => {
        levels.push(cb.value);
    });

    if (levels.length === 0) {
        alert("少なくとも1つのログレベルを選択してください！");
        return;
    }

    const startBtn = document.getElementById("start-sim-btn");
    const stopBtn = document.getElementById("stop-sim-btn");

    startBtn.disabled = true;
    stopBtn.disabled = false;

    activeThreadsCount = threads;
    updateMetricsCounters();

    try {
        const res = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                threads: threads,
                logs_per_thread: logs,
                interval: interval,
                logger_name: logger,
                levels: levels
            })
        });
        const data = await res.json();
        
        if (data.status === "started") {
            appendTerminalLine("stderr", `SYSTEM: シミュレーターを開始しました (スレッド数: ${threads}, エミット数/スレッド: ${logs})`, "system-msg");
            
            // Set simple timeout simulation tracker for UI
            const totalDurationSecs = logs * interval + 1.0;
            setTimeout(() => {
                // If simulator was not stopped manually
                if (activeThreadsCount === threads) {
                    activeThreadsCount = 0;
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    updateMetricsCounters();
                    appendTerminalLine("stderr", "SYSTEM: シミュレーションスレッド実行が終了しました。", "system-msg");
                }
            }, totalDurationSecs * 1000);
        }
    } catch (e) {
        appendTerminalLine("stderr", "Failed to start simulation: " + e.getMessage(), "error-msg");
        startBtn.disabled = false;
        stopBtn.disabled = true;
        activeThreadsCount = 0;
        updateMetricsCounters();
    }
}

async function stopSimulation() {
    const startBtn = document.getElementById("start-sim-btn");
    const stopBtn = document.getElementById("stop-sim-btn");

    startBtn.disabled = false;
    stopBtn.disabled = true;
    activeThreadsCount = 0;
    blockedThreads.clear();
    updateMetricsCounters();

    try {
        const res = await fetch("/api/simulate/stop", { method: "POST" });
        const data = await res.json();
        if (data.status === "stopped") {
            appendTerminalLine("stderr", "SYSTEM: シミュレーションスレッドを強制停止しました。", "system-msg");
        }
    } catch (e) {
        appendTerminalLine("stderr", "Failed to stop simulation: " + e.getMessage(), "error-msg");
    }
}
