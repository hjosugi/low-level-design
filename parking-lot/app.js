/* ==========================================================================
   Parking Lot LLD Hands-on Simulator - Core Application Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // 1. Navigation & Tab Routing System
    // ==========================================================================
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabTitle = document.getElementById('tab-title');
    const tabSubtitle = document.getElementById('tab-subtitle');

    const tabMeta = {
        simulator: {
            title: '駐車場シミュレーター',
            subtitle: '3フロア構成のリアルタイム満空管理・チケット発行・料金精算の検証'
        },
        concurrency: {
            title: '並行処理検証プレイグラウンド',
            subtitle: 'マルチゲート（入口）同時侵入時のレースコンディションと排他制御（ReentrantLock）の可視化'
        },
        architecture: {
            title: 'LLD 設計論 & 設計選択',
            subtitle: 'Google面接で評価される「なぜそのコードを書くのか」の意思決定とトレードオフ解説'
        },
        quiz: {
            title: 'LLD 模擬面接クイズ',
            subtitle: '駐車場設計の核となる概念について、あなたの理解度を測定するインタラクティブテスト'
        }
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Toggle sidebar buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle panels
            tabPanels.forEach(p => p.classList.remove('active'));
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            
            // Update Headers
            tabTitle.textContent = tabMeta[targetTab].title;
            tabSubtitle.textContent = tabMeta[targetTab].subtitle;

            // Trigger code display load if architecture tab is selected
            if (targetTab === 'architecture') {
                loadCodeFile(activeCodeFile);
            }
        });
    });

    // ==========================================================================
    // 2. In-Browser LLD Simulator Core State
    // ==========================================================================
    
    // Enums matching Java implementation
    const VehicleType = {
        MOTORCYCLE: 'MOTORCYCLE',
        CAR: 'CAR',
        LARGE: 'LARGE'
    };

    const SpotType = {
        MOTORCYCLE: 'MOTORCYCLE',
        CAR: 'CAR',
        LARGE: 'LARGE'
    };

    // Preset spots across 3 Floors
    // Floor 1: 2 Motorcycle, 4 Car
    // Floor 2: 6 Car
    // Floor 3: 4 Large
    const rawSpots = [
        // Floor 1
        { id: '1-M1', floor: 1, spotType: SpotType.MOTORCYCLE },
        { id: '1-M2', floor: 1, spotType: SpotType.MOTORCYCLE },
        { id: '1-C1', floor: 1, spotType: SpotType.CAR },
        { id: '1-C2', floor: 1, spotType: SpotType.CAR },
        { id: '1-C3', floor: 1, spotType: SpotType.CAR },
        { id: '1-C4', floor: 1, spotType: SpotType.CAR },
        // Floor 2
        { id: '2-C1', floor: 2, spotType: SpotType.CAR },
        { id: '2-C2', floor: 2, spotType: SpotType.CAR },
        { id: '2-C3', floor: 2, spotType: SpotType.CAR },
        { id: '2-C4', floor: 2, spotType: SpotType.CAR },
        { id: '2-C5', floor: 2, spotType: SpotType.CAR },
        { id: '2-C6', floor: 2, spotType: SpotType.CAR },
        // Floor 3
        { id: '3-L1', floor: 3, spotType: SpotType.LARGE },
        { id: '3-L2', floor: 3, spotType: SpotType.LARGE },
        { id: '3-L3', floor: 3, spotType: SpotType.LARGE },
        { id: '3-L4', floor: 3, spotType: SpotType.LARGE }
    ];

    let occupiedSpotIds = new Set();
    let activeTickets = new Map();
    let currentPricingStrategy = 'DEFAULT'; // 'DEFAULT' or 'VEHICLE'
    const hourlyRateCents = 500; // $5.00 represented as 500 cents

    // Accelerated Clock State
    let simTime = Date.now();
    let timeAcceleration = 30; // 1s real life = 30 minutes in simulator

    // HTML elements
    const parkingGridView = document.getElementById('parking-grid-view');
    const floorTabs = document.querySelectorAll('.floor-tab-btn');
    const activeTicketsList = document.getElementById('active-tickets-list');
    const simTimeDisplay = document.getElementById('sim-time-display');
    const speedSlider = document.getElementById('time-speed-slider');
    const speedIndicator = document.getElementById('speed-indicator');

    let currentVisibleFloor = 1;

    // Time Progression Interval
    setInterval(() => {
        // Accelerate time progression (timeAcceleration is in minutes per second, so we divide to match 100ms interval)
        const msPerSecond = 1000;
        const intervalMs = 100;
        const tickRatio = intervalMs / msPerSecond;
        const minutesToAdd = timeAcceleration * tickRatio;
        
        simTime += (minutesToAdd * 60 * 1000);
        
        // Display formatted simulation time
        const dateObj = new Date(simTime);
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        simTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;

        // Live calculation of fees on visual display
        updateActiveTicketsTable();
    }, 100);

    // Speed Slider listener
    speedSlider.addEventListener('input', (e) => {
        timeAcceleration = parseInt(e.target.value);
        speedIndicator.textContent = `1秒 ＝ ${timeAcceleration}分`;
    });

    // Floor Tabs listener
    floorTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            floorTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentVisibleFloor = parseInt(tab.getAttribute('data-floor'));
            renderParkingGrid();
        });
    });

    // Strategy toggler
    const strategyRadios = document.querySelectorAll('name="pricing-strategy"');
    document.querySelectorAll('input[name="pricing-strategy"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentPricingStrategy = e.target.value;
            updateActiveTicketsTable();
        });
    });

    // Rentrant-like helper to find spot matching type
    function findAvailableSpot(vehicleType) {
        const requiredSpotType = mapVehicleTypeToSpotType(vehicleType);
        for (const spot of rawSpots) {
            if (spot.spotType === requiredSpotType && !occupiedSpotIds.has(spot.id)) {
                return spot;
            }
        }
        return null;
    }

    function mapVehicleTypeToSpotType(vehicleType) {
        switch (vehicleType) {
            case VehicleType.MOTORCYCLE: return SpotType.MOTORCYCLE;
            case VehicleType.CAR: return SpotType.CAR;
            case VehicleType.LARGE: return SpotType.LARGE;
            default: return null;
        }
    }

    // Interactive Entry registration
    const btnEnterLot = document.getElementById('btn-enter-lot');
    const entryFeedback = document.getElementById('entry-feedback');

    btnEnterLot.addEventListener('click', () => {
        const selectedVehicleElement = document.querySelector('input[name="vehicle-type"]:checked');
        if (!selectedVehicleElement) return;

        const vehicleType = selectedVehicleElement.value;
        const gate = document.getElementById('entrance-gate-select').value;

        try {
            // Find spot
            const spot = findAvailableSpot(vehicleType);
            if (!spot) {
                throw new Error(`満車: 適合する空車スペース（${vehicleType}用）が見つかりません。`);
            }

            // Occupy spot
            occupiedSpotIds.add(spot.id);

            // Generate ticket
            const ticketId = 'T-' + Math.floor(100000 + Math.random() * 900000);
            const ticket = {
                id: ticketId,
                spotId: spot.id,
                vehicleType: vehicleType,
                entryTimeMs: simTime,
                gate: gate
            };

            activeTickets.set(ticketId, ticket);

            // UI feedback
            showFeedback(entryFeedback, `[成功] 車両入庫完了。チケット発行: ${ticketId} (割り当て: ${spot.id} | フロア: ${spot.floor}F)`, 'success');
            
            // Re-render
            renderParkingGrid();
            updateActiveTicketsTable();
        } catch (err) {
            showFeedback(entryFeedback, err.message, 'error');
        }
    });

    function showFeedback(element, message, type) {
        element.textContent = message;
        element.className = `action-feedback ${type}`;
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    // Rounding up pricing strategy math (Cents converted to Dollars for visualization)
    function computeLiveFee(entryTimeMs, currentSimTime, vehicleType) {
        const durationMs = currentSimTime - entryTimeMs;
        let hours = 0;
        
        if (durationMs <= 0) {
            hours = 1;
        } else {
            const hourInMs = 1000 * 60 * 60;
            hours = Math.floor(durationMs / hourInMs);
            if (durationMs % hourInMs > 0) {
                hours++;
            }
        }

        const baseFeeCents = hours * hourlyRateCents;
        let finalFeeCents = baseFeeCents;

        if (currentPricingStrategy === 'VEHICLE') {
            let multiplier = 1.0;
            if (vehicleType === VehicleType.MOTORCYCLE) multiplier = 0.6;
            if (vehicleType === VehicleType.LARGE) multiplier = 1.5;
            finalFeeCents = Math.round(baseFeeCents * multiplier);
        }

        return (finalFeeCents / 100).toFixed(2); // Format as $XX.XX
    }

    // Dynamic grid rendering
    function renderParkingGrid() {
        parkingGridView.innerHTML = '';
        const floorSpots = rawSpots.filter(s => s.floor === currentVisibleFloor);

        floorSpots.forEach(spot => {
            const isOccupied = occupiedSpotIds.has(spot.id);
            const spotItem = document.createElement('div');
            
            let borderClass = 'car-border';
            let spotTypeLabel = '普通車';
            let vehicleIcon = '';

            if (spot.spotType === SpotType.MOTORCYCLE) {
                borderClass = 'motorcycle-border';
                spotTypeLabel = '二輪用';
            } else if (spot.spotType === SpotType.LARGE) {
                borderClass = 'large-border';
                spotTypeLabel = '大型車';
            }

            spotItem.className = `parking-spot-item ${borderClass} ${isOccupied ? 'occupied' : ''}`;
            spotItem.id = `spot-item-${spot.id}`;

            // Find matching vehicle inside spot for correct icon rendering
            if (isOccupied) {
                let matchingVehicleType = VehicleType.CAR;
                for (const t of activeTickets.values()) {
                    if (t.spotId === spot.id) {
                        matchingVehicleType = t.vehicleType;
                        break;
                    }
                }
                
                if (matchingVehicleType === VehicleType.MOTORCYCLE) {
                    vehicleIcon = '<i class="fa-solid fa-motorcycle"></i>';
                } else if (matchingVehicleType === VehicleType.CAR) {
                    vehicleIcon = '<i class="fa-solid fa-car"></i>';
                } else {
                    vehicleIcon = '<i class="fa-solid fa-truck-pickup"></i>';
                }
            }

            spotItem.innerHTML = `
                <div class="spot-label">${spot.id}</div>
                <div class="spot-vehicle-status">${vehicleIcon}</div>
                <div class="spot-type-tag ${spot.spotType.toLowerCase()}">${spotTypeLabel}</div>
            `;

            parkingGridView.appendChild(spotItem);
        });
    }

    // Dynamic Active tickets update
    function updateActiveTicketsTable() {
        if (activeTickets.size === 0) {
            activeTicketsList.innerHTML = `
                <tr class="empty-state-row">
                    <td colspan="7" class="text-center text-muted">
                        現在駐車中の車両はありません。左側のパネルから入庫してください。
                    </td>
                </tr>
            `;
            return;
        }

        activeTicketsList.innerHTML = '';
        
        activeTickets.forEach((ticket) => {
            const row = document.createElement('tr');
            
            const entryDate = new Date(ticket.entryTimeMs);
            const entryTimeStr = `${String(entryDate.getHours()).padStart(2, '0')}:${String(entryDate.getMinutes()).padStart(2, '0')}:${String(entryDate.getSeconds()).padStart(2, '0')}`;

            // Calculate duration in minutes/seconds for display purposes
            const durationMs = simTime - ticket.entryTimeMs;
            const diffMins = Math.floor(durationMs / (60 * 1000));
            const durationDisplay = diffMins > 0 ? `${diffMins}時間 (加速)` : '満了待ち';

            const fee = computeLiveFee(ticket.entryTimeMs, simTime, ticket.vehicleType);

            let vBadgeClass = 'car';
            let vText = 'Car';
            if (ticket.vehicleType === VehicleType.MOTORCYCLE) { vBadgeClass = 'motorcycle'; vText = '二輪'; }
            if (ticket.vehicleType === VehicleType.LARGE) { vBadgeClass = 'large'; vText = '大型'; }

            row.innerHTML = `
                <td><span class="ticket-id-badge">${ticket.id}</span></td>
                <td><span class="spot-id-badge">${ticket.spotId}</span></td>
                <td><span class="vehicle-badge ${vBadgeClass}">${vText}</span></td>
                <td>${entryTimeStr}</td>
                <td>${durationDisplay}</td>
                <td><span class="fee-display">$${fee}</span></td>
                <td>
                    <button class="btn btn-secondary btn-xs btn-checkout" data-ticket="${ticket.id}">
                        <i class="fa-solid fa-square-check"></i> 出庫 (exit)
                    </button>
                </td>
            `;

            activeTicketsList.appendChild(row);
        });

        // Checkout Button Listener
        document.querySelectorAll('.btn-checkout').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.currentTarget;
                const ticketId = targetBtn.getAttribute('data-ticket');
                performCheckout(ticketId);
            });
        });
    }

    function performCheckout(ticketId) {
        const ticket = activeTickets.get(ticketId);
        if (!ticket) return;

        const fee = computeLiveFee(ticket.entryTimeMs, simTime, ticket.vehicleType);
        
        // Relational state cleaning
        occupiedSpotIds.delete(ticket.spotId);
        activeTickets.delete(ticketId);

        // Feedback alert showing computed fee
        alert(`【出庫完了 - exit】\nチケット番号: ${ticketId}\n割り当てスポット: ${ticket.spotId}\n請求金額（端数切り上げ）: $${fee}\n\n対象の駐車スペースが正常に解放されました。`);

        renderParkingGrid();
        updateActiveTicketsTable();
    }

    // Initial render
    renderParkingGrid();


    // ==========================================================================
    // 3. Concurrency Playground Logic (Race Conditions vs locks)
    // ==========================================================================
    const concurrencyLockToggle = document.getElementById('concurrency-lock-toggle');
    const lockStateLabel = document.getElementById('lock-state-label');
    const lockStateDesc = document.getElementById('lock-state-desc');
    const btnRunRace = document.getElementById('btn-run-race');
    const terminal = document.getElementById('concurrency-terminal');
    const targetSpotBadge = document.getElementById('target-spot-badge');

    concurrencyLockToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (isEnabled) {
            lockStateLabel.textContent = '排他制御 (ReentrantLock) : 有効';
            lockStateLabel.className = '';
            lockStateDesc.textContent = 'スレッド排他実行によりレースコンディションを防止します';
            lockStateDesc.className = 'text-emerald';
        } else {
            lockStateLabel.textContent = '排他制御 (ReentrantLock) : 無効';
            lockStateLabel.className = 'text-rose';
            lockStateDesc.textContent = '警告: 2台が同じスペースに同時入庫するバグが発生します';
            lockStateDesc.className = 'text-rose';
        }
    });

    // Logging helpers for terminal simulation
    function logTerminal(text, type = 'system') {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}-line`;
        
        const timestamp = new Date().toLocaleTimeString();
        line.innerHTML = `[${timestamp}] ${text}`;
        
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    }

    let isRaceSimulating = false;

    btnRunRace.addEventListener('click', async () => {
        if (isRaceSimulating) return;
        isRaceSimulating = true;
        btnRunRace.disabled = true;

        const isLockEnabled = concurrencyLockToggle.checked;

        // Reset visual states
        resetConcurrencyUI();
        logTerminal(`[RACE START] 3つのスレッド（Gate A, B, C）から同時に入庫要求を受信しました。`, 'info');
        logTerminal(`[RACE CONFIG] 排他ロック (ReentrantLock) 設定: ${isLockEnabled ? '【有効】' : '【無効】'}`, isLockEnabled ? 'success' : 'error');

        // Step 1: Initialize threads
        setThreadStatus('gate-a', 'RUNNING');
        setThreadStatus('gate-b', 'RUNNING');
        setThreadStatus('gate-c', 'RUNNING');
        
        await delay(800);

        if (!isLockEnabled) {
            // ==========================================
            // NO LOCK FLOW (Race Condition Occurs!)
            // ==========================================
            logTerminal(`[スレッド並行] 全スレッドが空きスペースの検索（findSpot）をほぼ同時に走らせます。`, 'warn');
            
            // Interleave: All threads inspect and see C1 is FREE
            setThreadStepActive('gate-a', 1);
            logTerminal(`[Gate A] 空き枠をスキャン ... スポット C1 が【空車】であることを確認。`, 'info');
            await delay(400);

            setThreadStepActive('gate-b', 1);
            logTerminal(`[Gate B] 空き枠をスキャン ... スポット C1 が【空車】であることを確認。`, 'info');
            await delay(400);

            setThreadStepActive('gate-c', 1);
            logTerminal(`[Gate C] 空き枠をスキャン ... スポット C1 が【空車】であることを確認。`, 'info');
            await delay(800);

            // Interleave: All threads write to occupiedSpotIds
            logTerminal(`[重大な競合] スレッド排他ロックが無い為、全ゲートが『C1は空車である』と誤認したまま確保を実行します。`, 'error');
            
            setThreadStepActive('gate-a', 2);
            logTerminal(`[Gate A] スポット C1 のステータスを【占有中】に上書き。`, 'info');
            await delay(300);

            setThreadStepActive('gate-b', 2);
            logTerminal(`[Gate B] スポット C1 のステータスを【占有中】に上書き。 (競合状態発生)`, 'warn');
            await delay(300);

            setThreadStepActive('gate-c', 2);
            logTerminal(`[Gate C] スポット C1 のステータスを【占有中】に上書き。 (競合状態発生)`, 'warn');
            await delay(800);

            // All threads return success tickets for C1
            setThreadStepActive('gate-a', 3);
            setThreadStatus('gate-a', 'SUCCESS');
            logTerminal(`[Gate A] 入庫成功。チケット発行: T-882901 (割り当て: C1)`, 'success');
            
            setThreadStepActive('gate-b', 3);
            setThreadStatus('gate-b', 'SUCCESS');
            logTerminal(`[Gate B] 入庫成功。チケット発行: T-477102 (割り当て: C1) 【二重予約発生！】`, 'error');

            setThreadStepActive('gate-c', 3);
            setThreadStatus('gate-c', 'SUCCESS');
            logTerminal(`[Gate C] 入庫成功。チケット発行: T-339091 (割り当て: C1) 【三重予約発生！】`, 'error');

            // UI Visual update of spot conflict state
            targetSpotBadge.className = 'spot-status-tag conflict';
            targetSpotBadge.textContent = 'CONFLICT (三重割当)';
            document.getElementById('target-spot-box').style.borderColor = 'var(--accent-rose)';

            logTerminal(`[RACE FAILURE] 排他制御をしなかった為、1つの駐車スポットC1に3台が割り振られるシステム破壊的バグが発生しました。`, 'error');

        } else {
            // ==========================================
            // WITH LOCK FLOW (Thread Safety Achieved)
            // ==========================================
            logTerminal(`[ロック同期] ParkingLotの enter() メソッドに ReentrantLock による同期制御が入っています。`, 'success');
            
            // Thread A acquires Lock first
            logTerminal(`[Gate A] スレッドが lock.lock() を取得。他スレッドは待機状態（BLOCKED）に入ります。`, 'success');
            setThreadStatus('gate-b', 'BLOCKED');
            setThreadStatus('gate-c', 'BLOCKED');
            
            setThreadStepActive('gate-a', 1);
            logTerminal(`[Gate A] ロック保護下で空き枠をスキャン ... スポット C1 を【空車】と認識。`, 'info');
            await delay(600);

            setThreadStepActive('gate-a', 2);
            logTerminal(`[Gate A] スポット C1 を occupiedSpotIds に追加（占有完了）。`, 'info');
            await delay(600);

            setThreadStepActive('gate-a', 3);
            setThreadStatus('gate-a', 'SUCCESS');
            logTerminal(`[Gate A] 入庫成功。チケット発行: T-551982 (割り当て: C1)`, 'success');
            logTerminal(`[Gate A] lock.unlock() を実行し、ロックを解放します。`, 'success');
            
            targetSpotBadge.className = 'spot-status-tag occupied';
            targetSpotBadge.textContent = 'OCCUPIED (A専用)';
            
            await delay(800);

            // Thread B acquires Lock next
            setThreadStatus('gate-b', 'RUNNING');
            logTerminal(`[Gate B] ロックを取得。入庫トランザクションを開始します。`, 'success');
            
            setThreadStepActive('gate-b', 1);
            logTerminal(`[Gate B] 空き枠をスキャン ... ロック同期により、C1が既に【占有中】であることを正しく認識。`, 'info');
            await delay(600);

            // Thread B fails safely because spot is occupied
            setThreadStatus('gate-b', 'REJECTED');
            logTerminal(`[Gate B] 例外送出 (ValueError): 適合する空き駐車スペースがありません。`, 'error');
            logTerminal(`[Gate B] 安全にロールバックし、lock.unlock() を実行して解放します。`, 'system');
            
            await delay(800);

            // Thread C acquires Lock next
            setThreadStatus('gate-c', 'RUNNING');
            logTerminal(`[Gate C] ロックを取得。入庫トランザクションを開始します。`, 'success');
            
            setThreadStepActive('gate-c', 1);
            logTerminal(`[Gate C] 空き枠をスキャン ... C1が既に【占有中】であることを正しく認識。`, 'info');
            await delay(600);

            // Thread C fails safely
            setThreadStatus('gate-c', 'REJECTED');
            logTerminal(`[Gate C] 例外送出 (ValueError): 適合する空き駐車スペースがありません。`, 'error');
            logTerminal(`[Gate C] 安全にロックを解放します。`, 'system');

            logTerminal(`[RACE SUCCESS] ReentrantLock のスレッド同期制御により、C1への重複予約は完全に防がれ、堅牢な整合性が保たれました。`, 'success');
        }

        isRaceSimulating = false;
        btnRunRace.disabled = false;
    });

    function setThreadStatus(gate, status) {
        const node = document.getElementById(`node-${gate}`);
        const badge = document.getElementById(`status-${gate}`);
        
        node.className = `thread-node ${status.toLowerCase()}`;
        badge.textContent = status;
    }

    function setThreadStepActive(gate, stepNum) {
        const node = document.getElementById(`node-${gate}`);
        node.querySelectorAll('.step').forEach(s => {
            s.classList.remove('active');
            if (parseInt(s.getAttribute('data-step')) === stepNum) {
                s.classList.add('active');
            }
        });
    }

    function resetConcurrencyUI() {
        setThreadStatus('gate-a', 'IDLE');
        setThreadStatus('gate-b', 'IDLE');
        setThreadStatus('gate-c', 'IDLE');
        
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        
        targetSpotBadge.className = 'spot-status-tag free';
        targetSpotBadge.textContent = 'FREE';
        document.getElementById('target-spot-box').style.borderColor = 'var(--border-glass)';
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    // ==========================================================================
    // 4. LLD Architecture Code Viewer Tabs
    // ==========================================================================
    const codeDisplayBlock = document.getElementById('code-display-block');
    const codeTabs = document.querySelectorAll('.code-tab-btn');
    let activeCodeFile = 'ParkingLot';

    // Static dictionary holding the beautiful Java files we created, so they load instantly in browser without CORS errors
    const javaCodeDictionary = {
        ParkingLot: `package com.hellointerview.parkinglot;

import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 駐車場システム全体の司令塔（オーケストレーター）となるクラスです。
 * 
 * LLD設計原則:
 * - 本クラスが唯一の公開APIエントリーポイントであり、各種エンティティの関係的状態を管理します。
 * - スレッドセーフ設計: 複数入口からの同時アクセスを考慮し、Java の ReentrantLock を用いて排他制御を行います。
 * - 状態管理の分離: \`occupiedSpotIds\`（占有されたスポットID集合）および \`activeTickets\`（アクティブなチケット辞書）を持ち、
 *   駐車スポット自体に「空車/満車」のフラグを持たせない「関係的状態の集約」を実現しています。
 */
public final class ParkingLot {
    private final List<ParkingSpot> spots;
    private final Set<String> occupiedSpotIds;
    private final Map<String, Ticket> activeTickets;
    private final long hourlyRateCents;
    private final PricingStrategy pricingStrategy;
    
    // スレッド排他制御のためのロックオブジェクト
    private final ReentrantLock lock = new ReentrantLock();

    public ParkingLot(List<ParkingSpot> spots, long hourlyRateCents) {
        this(spots, hourlyRateCents, new DefaultPricingStrategy());
    }

    public ParkingLot(List<ParkingSpot> spots, long hourlyRateCents, PricingStrategy pricingStrategy) {
        this.spots = new ArrayList<>(spots);
        this.hourlyRateCents = hourlyRateCents;
        this.pricingStrategy = pricingStrategy != null ? pricingStrategy : new DefaultPricingStrategy();
        this.occupiedSpotIds = new HashSet<>();
        this.activeTickets = new HashMap<>();
    }

    /**
     * 車両が入場した際に自動で適合するスポットを割り当て、チケットを発行します。
     * スレッドセーフに実行されます。
     */
    public Ticket enter(VehicleType vehicleType) {
        lock.lock();
        try {
            // 1. 車種に適合する空きスポットを検索する
            ParkingSpot availableSpot = findAvailableSpot(vehicleType);
            if (availableSpot == null) {
                throw new IllegalStateException("No compatible parking spot available for " + vehicleType);
            }

            // 2. 状態の更新: スポットを占有状態にする
            occupiedSpotIds.add(availableSpot.getId());

            // 3. チケットの生成
            String ticketId = UUID.randomUUID().toString();
            long entryTimeMs = System.currentTimeMillis();
            Ticket ticket = new Ticket(ticketId, availableSpot.getId(), vehicleType, entryTimeMs);

            // 4. アクティブチケット辞書に保存して返却
            activeTickets.put(ticketId, ticket);
            return ticket;
        } finally {
            lock.unlock();
        }
    }

    /**
     * 車両が退場する際にチケットIDを検証し、料金を算出してスポットを解放します。
     * スレッドセーフに実行されます。
     */
    public long exit(String ticketId) {
        lock.lock();
        try {
            // 1. チケットの取得と検証
            Ticket ticket = activeTickets.get(ticketId);
            if (ticket == null) {
                throw new IllegalArgumentException("Ticket is invalid or has already been used");
            }

            // 2. 料金の計算
            long exitTimeMs = System.currentTimeMillis();
            long fee = pricingStrategy.computeFee(
                ticket.getEntryTimeMs(),
                exitTimeMs,
                ticket.getVehicleType(),
                hourlyRateCents
            );

            // 3. 状態の更新: スポットの解放、およびアクティブチケットの削除
            occupiedSpotIds.remove(ticket.getSpotId());
            activeTickets.remove(ticketId);

            return fee;
        } finally {
            lock.unlock();
        }
    }

    private ParkingSpot findAvailableSpot(VehicleType vehicleType) {
        SpotType requiredSpotType = mapVehicleTypeToSpotType(vehicleType);
        for (ParkingSpot spot : spots) {
            if (spot.getSpotType() == requiredSpotType && !occupiedSpotIds.contains(spot.getId())) {
                return spot;
            }
        }
        return null;
    }

    private SpotType mapVehicleTypeToSpotType(VehicleType vehicleType) {
        switch (vehicleType) {
            case MOTORCYCLE: return SpotType.MOTORCYCLE;
            case CAR: return SpotType.CAR;
            case LARGE: return SpotType.LARGE;
            default: throw new IllegalArgumentException("Unknown vehicle type: " + vehicleType);
        }
    }
}`,
        ParkingSpot: `package com.hellointerview.parkinglot;

import lombok.Getter;
import lombok.ToString;

/**
 * 駐車スペースの物理的特性を表すイミュータブル（不変）なクラスです。
 * 
 * LLD設計原則（Hello Interviewより）:
 * - 本クラスは物理的な固有の性質（IDやサイズ）である「Intrinsic State（本質的状態）」のみを保持します。
 * - 「現在占有されているか」といった「Relational State（関係的状態）」は、
 *   オーケストレーターである ParkingLot クラスが集中管理します。これにより責務が明確に分離されます。
 */
@Getter
@ToString
public final class ParkingSpot {
    private final String id;
    private final SpotType spotType;

    public ParkingSpot(String id, SpotType spotType) {
        this.id = id;
        this.spotType = spotType;
    }
}`,
        Ticket: `package com.hellointerview.parkinglot;

import lombok.Getter;
import lombok.ToString;

/**
 * 駐車セッションの記録を表すイミュータブル（不変）なバリューオブジェクトです。
 * 
 * LLD設計原則（デメテルの法則 / Law of Demeter の遵守）:
 * - ParkingSpot オブジェクトへの参照を直接持たず、ID（spotId）のみを保持します。
 * - これにより、Ticket がドメインモデルの深部にアクセスするのを防ぎ、結合度を低く保ちます。
 * - 生成されたチケットのデータは不変（Immutable）であり、事後的な変更は不可能です。
 */
@Getter
@ToString
public final class Ticket {
    private final String id;
    private final String spotId;
    private final VehicleType vehicleType;
    private final long entryTimeMs;

    public Ticket(String id, String spotId, VehicleType vehicleType, long entryTimeMs) {
        this.id = id;
        this.spotId = spotId;
        this.vehicleType = vehicleType;
        this.entryTimeMs = entryTimeMs;
    }
}`,
        PricingStrategy: `package com.hellointerview.parkinglot;

/**
 * 料金計算アルゴリズムをカプセル化するインターフェースです（Strategy パターン）。
 * 
 * LLD設計原則（開閉原則 / Open-Closed Principle）:
 * - 料金計算ルール（基本時間料金、車種別の傾斜、時間帯割引など）が追加・変更される際、
 *   オーケストレーターである ParkingLot クラスを修正することなく拡張可能にします。
 */
public interface PricingStrategy {
    long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents);
}

// ----------------------------------------------------
// 【DefaultPricingStrategy.java】
// ----------------------------------------------------
public final class DefaultPricingStrategy implements PricingStrategy {
    @Override
    public long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents) {
        long durationMs = exitTimeMs - entryTimeMs;
        if (durationMs <= 0) return hourlyRateCents;

        long hourInMs = 1000L * 60 * 60;
        long hours = durationMs / hourInMs;
        if (durationMs % hourInMs > 0) hours++;

        return hours * hourlyRateCents;
    }
}

// ----------------------------------------------------
// 【VehicleTypePricingStrategy.java】
// ----------------------------------------------------
public final class VehicleTypePricingStrategy implements PricingStrategy {
    private final Map<VehicleType, Double> multipliers = new EnumMap<>(VehicleType.class);

    public VehicleTypePricingStrategy() {
        multipliers.put(VehicleType.MOTORCYCLE, 0.6);
        multipliers.put(VehicleType.CAR, 1.0);
        multipliers.put(VehicleType.LARGE, 1.5);
    }

    @Override
    public long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents) {
        long durationMs = exitTimeMs - entryTimeMs;
        long hours = durationMs <= 0 ? 1 : durationMs / (1000L * 60 * 60);
        if (durationMs > 0 && durationMs % (1000L * 60 * 60) > 0) hours++;

        long baseFee = hours * hourlyRateCents;
        double multiplier = multipliers.getOrDefault(vehicleType, 1.0);
        return Math.round(baseFee * multiplier);
    }
}`,
        ParkingLotTest: `package com.hellointerview.parkinglot;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 駐車場システム(LLD)の動作検証を自律的に行うためのテスト実行クラスです。
 * マルチスレッドによる「スレッド安全（同時入庫時のC1ダブり防止）」をスレッドプールを用いて検証します。
 */
public final class ParkingLotTest {
    // 詳細は src/com/hellointerview/parkinglot/ParkingLotTest.java を参照
    
    private static void testConcurrencyRaceCondition() throws Exception {
        List<ParkingSpot> spots = Arrays.asList(
            new ParkingSpot("C1", SpotType.CAR),
            new ParkingSpot("C2", SpotType.CAR)
        );
        ParkingLot lot = new ParkingLot(spots, 500);

        int numThreads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch startSignal = new CountDownLatch(1);
        CountDownLatch doneSignal = new CountDownLatch(numThreads);

        List<Ticket> succeededTickets = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger failedCount = new AtomicInteger(0);

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    startSignal.await();
                    Ticket ticket = lot.enter(VehicleType.CAR);
                    succeededTickets.add(ticket);
                } catch (IllegalStateException e) {
                    failedCount.incrementAndGet();
                } finally {
                    doneSignal.countDown();
                }
            });
        }

        startSignal.countDown();
        doneSignal.await(5, TimeUnit.SECONDS);
        executor.shutdown();

        // ロック排他により、10スレッド中、空枠2枠に対して正確に2枠が駐車成功、8枠が例外で弾かれます。
        assert succeededTickets.size() == 2;
        assert failedCount.get() == 8;
    }
}`
    };

    function loadCodeFile(fileName) {
        codeDisplayBlock.textContent = javaCodeDictionary[fileName] || '// File not found';
    }

    codeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            codeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeCodeFile = tab.getAttribute('data-file');
            loadCodeFile(activeCodeFile);
        });
    });


    // ==========================================================================
    // 5. Interactive Interview Quiz Engine
    // ==========================================================================
    const quizQuestions = [
        {
            question: "LLD面接において、Vehicle（車両）をクラスではなく Enum（列挙型）としてモデル化するのが推奨される最も適切な理由は何ですか？",
            options: [
                "システム構築にあたり、子クラスである Car や Motorcycle を継承で作った方がメモリ空間が節約されるから。",
                "(推奨) 車両はシステムにとって外部存在であり、駐車場内でその状態を変化・変更・追跡する必要が無く、単なる「分類用ラベル」に過ぎないから。",
                "Java の Enum はスレッドセーフであり、複数のスレッドからの同時入庫のレースコンディションを自動で防いでくれるから。",
                "車両をクラスにすると、出庫の際にチケット情報から料金を計算できなくなるから。"
            ],
            correctIndex: 1,
            explanation: "LLD面接の極めて重要なポイントは「不要なクラスを作らないこと」です。駐車場管理システムは車両のオイル交換やドア開閉といった状態は追跡せず、「どのサイズのスペースに適合するか」という分類ラベルだけを必要とします。このようなケースでは、名詞だからと盲目的にクラス化するのではなく、軽量な Enum に留める設計が「責務を最小に抑えるクリーンな判断」として非常に高く評価されます。"
        },
        {
            question: "「駐車スペースが占有されているか(occupied)」の状態を、ParkingSpot 自身が持つ（物理フラグ）のではなく、ParkingLot（オーケストレーター）で一元管理（関係的状態）にする主な設計メリットは何ですか？",
            options: [
                "スポット数が数千件に増えた場合に、メモリフットプリントを半減させられるから。",
                "ParkingSpot 自体にフラグがあると、データベースに永続化する際に SQL のクエリ速度が著しく低下するから。",
                "チケットの入庫（空車探し＋確保）および出庫時のスポット解放において、スポットオブジェクトとチケットオブジェクトの循環参照を防ぎ、かつ並行処理のロック排他を一箇所に集中させやすいから。"
            ],
            correctIndex: 2,
            explanation: "「現在そのスペースが割り当てられているか」は、チケットの有効期限やセッション情報と結びついた「関係的状態（Relational State）」です。これを ParkingSpot 自身に持たせると、ParkingSpot が Ticket の状態を監視・変更し合う循環参照が生まれやすくなります。ParkingLot（オーケストレーター）の Set や Map で関係性をインデックス管理することで、スポット自身は物理的な性質（Intrinsic State）だけを持つ単純なオブジェクトになり、スレッド同期（ロック）も ParkingLot 一箇所で完結します。"
        },
        {
            question: "料金システム（Money）の設計において、料金を float や double ではなく、 cents（セント単位などの長整数 long）として保持すべきなのはなぜですか？",
            options: [
                " float は double に比べてメモリを消費するため、駐車場システムスケールでは最適化が必要だから。",
                "(推奨) コンピューターは2進数を用いるため、10進数の小数点（0.1など）を正確に表現できず、計算の過程で微小な誤差が累積し、精算額に不整合が生じるから。",
                "Java では float を利用した Map のキー検索が言語仕様上禁止されているから。"
            ],
            correctIndex: 1,
            explanation: "お金のデータを浮動小数点数（float/double）で保持することは、金融・商業アプリケーションで絶対に避けるべき重大なアンチパターンです。0.1を3回足しても 0.30000000000000004 のようになる丸め誤差が発生し、料金精算に重大なバグをもたらします。最小単位（セントや円）を整数（long）で管理し、表示する時だけ小数に変換する設計が、LLD面接や実務における正しいデータ整合性アプローチです。"
        },
        {
            question: "料金計算処理を ParkingLot クラスの中に直接書き込まず、PricingStrategy インターフェースを設けてカプセル化する設計意図として、最も合致するオブジェクト指向原則はどれですか？",
            options: [
                "単一責任の原則（SRP）のみを満たし、メモリの消費量を最小化する意図。",
                "(推奨) 開閉原則（Open-Closed Principle）。将来「曜日別割引」「車種別の傾斜」「満空に応じた動的料金(Surge Pricing)」などが追加される際、大本の ParkingLot クラスを一切改変せずに新規戦略クラスの追加だけで対応可能にするため。",
                "依存性逆転の原則（DIP）。これにより具象クラスからインターフェースを直接呼び出せるようにするため。"
            ],
            correctIndex: 1,
            explanation: "開閉原則（OCP = 拡張に対して開いており、修正に対して閉じている）の典型的な適用例です。料金のルールは最も仕様変更が激しい部分です。これを `PricingStrategy` インターフェースとしてカプセル化（Strategy パターン）しておくことで、新たな料金プランが増えても、既存の `ParkingLot` を全く触らずに、新しい Strategy 具象クラスを作成してインジェクションするだけで拡張可能になります。"
        },
        {
            question: "複数のゲート（入口）から同時に車両が入庫（enter）を試みた際、同一スポットが二重予約されるレースコンディション（競合）を防止するための、Javaにおける最もシンプルで正しいアプローチはどれですか？",
            options: [
                "入庫処理中に一時的にスレッドの priority を最大化し、他の処理を割り込ませないようにする。",
                "Ticket クラスの getSpotId() メソッドに対して volatile 修飾子を付与し、常に最新のキャッシュ状態を共有する。",
                "(推奨) ParkingLot の enter() メソッド全体を synchronized ブロックで囲むか、ReentrantLock を用いて、空き枠スキャンから occupiedSet.add() までのトランザクションをシリアル（直列化）実行する。"
            ],
            correctIndex: 2,
            explanation: "レースコンディションは「空車があるかの確認（Check-then-Act）」と「占有フラグのセット（Write）」の間に、別のスレッドが割り込むことで発生します。この一連のトランザクションを 1 つのスレッドだけが排他的に行えるように、Java の `ReentrantLock` 等を用いて直列化することが最もシンプルかつ完全に正しい解決策です。高並行性が必要な超大型システムでは楽観的ロック（CAS）などを検討しますが、一般的な駐車場規模ではメソッドまたはブロック同期で性能的にも十分機能します。"
        },
        {
            question: "Ticket クラスが ParkingSpot オブジェクトへの参照を保持せず、単に String の spotId（ID文字列）だけを保持する設計は、何の設計思想（原則）を反映していますか？",
            options: [
                "インターフェース分離の原則（ISP）",
                "(推奨) デメテルの法則（Law of Demeter）。チケットは記録オブジェクトであり、ドメインモデルの内部関係性まで辿って不要なメソッド呼び出しや結合を生み出さないようにするため。",
                "リスコフの置換原則（LSP）。これにより Ticket クラスが ParkingSpot のサブクラスに代入可能になるため。"
            ],
            correctIndex: 1,
            explanation: "デメテルの法則（最小知識の原則）です。チケットは単なる「記録 (Value Object / Record)」です。記録オブジェクトがドメインモデルである `ParkingSpot` のインスタンスを直接握ってしまうと、チケットからスポットの内部メソッドを予期せず呼び出せるようになってしまい、不必要な結合が生まれます。ID文字列のみを値として保持させることで、モデル間の境界が極めてシンプルに保たれます。"
        }
    ];

    let currentQuestionIndex = 0;
    let correctScore = 0;
    let quizSelected = false;

    const quizQuestionTitle = document.getElementById('quiz-question-title');
    const quizOptionsContainer = document.getElementById('quiz-options-container');
    const quizExplanation = document.getElementById('quiz-explanation');
    const btnNextQuestion = document.getElementById('btn-next-question');
    
    const quizProgressBar = document.getElementById('quiz-progress-bar');
    const currentQuestionNum = document.getElementById('current-question-num');
    const totalQuestionsNum = document.getElementById('total-questions-num');
    const correctScoreDisplay = document.getElementById('correct-score');
    
    const quizQuestionCard = document.getElementById('quiz-question-card');
    const quizResultCard = document.getElementById('quiz-result-card');
    const finalScore = document.getElementById('final-score');
    const finalTotal = document.getElementById('final-total');
    const quizFeedbackText = document.getElementById('quiz-feedback-text');
    const btnRestartQuiz = document.getElementById('btn-restart-quiz');

    totalQuestionsNum.textContent = quizQuestions.length;
    finalTotal.textContent = quizQuestions.length;

    function loadQuizQuestion(index) {
        quizSelected = false;
        quizExplanation.classList.add('hidden');
        btnNextQuestion.disabled = true;
        
        const q = quizQuestions[index];
        quizQuestionTitle.innerHTML = `<span class="text-emerald">Q${index + 1}.</span> ${q.question}`;
        
        // Progress UI
        const progressPercent = ((index) / quizQuestions.length) * 100;
        quizProgressBar.style.width = `${progressPercent}%`;
        currentQuestionNum.textContent = index + 1;
        correctScoreDisplay.textContent = correctScore;

        quizOptionsContainer.innerHTML = '';
        
        q.options.forEach((option, optIdx) => {
            const optItem = document.createElement('div');
            optItem.className = 'quiz-option-item';
            optItem.setAttribute('data-index', optIdx);
            
            const markerChar = String.fromCharCode(65 + optIdx); // A, B, C, D
            optItem.innerHTML = `
                <div class="option-marker">${markerChar}</div>
                <div class="option-text">${option}</div>
            `;
            
            optItem.addEventListener('click', () => handleOptionSelection(optIdx, optItem));
            quizOptionsContainer.appendChild(optItem);
        });
    }

    function handleOptionSelection(selectedIndex, optionElement) {
        if (quizSelected) return; // Answer already submitted
        quizSelected = true;
        
        const q = quizQuestions[currentQuestionIndex];
        const isCorrect = selectedIndex === q.correctIndex;

        // Visual options update
        const optionItems = quizOptionsContainer.querySelectorAll('.quiz-option-item');
        optionItems.forEach((item, idx) => {
            if (idx === q.correctIndex) {
                item.classList.add('correct');
            } else if (idx === selectedIndex) {
                item.classList.add('incorrect');
            }
        });

        // Explanation UI update
        quizExplanation.classList.remove('hidden');
        const explanationStatus = quizExplanation.querySelector('.explanation-status');
        const explanationText = quizExplanation.querySelector('.explanation-text');
        
        if (isCorrect) {
            correctScore++;
            correctScoreDisplay.textContent = correctScore;
            quizExplanation.className = 'quiz-explanation-box correct';
            explanationStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 正解です！';
        } else {
            quizExplanation.className = 'quiz-explanation-box incorrect';
            explanationStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 不正解です';
        }
        
        explanationText.textContent = q.explanation;
        btnNextQuestion.disabled = false;
    }

    btnNextQuestion.addEventListener('click', () => {
        currentQuestionIndex++;
        
        if (currentQuestionIndex < quizQuestions.length) {
            loadQuizQuestion(currentQuestionIndex);
        } else {
            // End of quiz
            showQuizResults();
        }
    });

    function showQuizResults() {
        quizQuestionCard.classList.add('hidden');
        quizResultCard.classList.remove('hidden');
        
        quizProgressBar.style.width = '100%';
        finalScore.textContent = correctScore;

        // Custom descriptive feedback based on score
        if (correctScore === quizQuestions.length) {
            quizFeedbackText.textContent = '驚異的な設計理解度です！Google面接官も納得する最高水準のLLD思考回路が身についています。本番でも自信を持ってトレードオフを説明してください！';
        } else if (correctScore >= 4) {
            quizFeedbackText.textContent = '非常に良好な理解度です。VehicleをEnumに留める判断や、スレッド排他制御の基本原則は十分に習得できています。間違えた個所の解説をもう一度読み直しておくと万全です。';
        } else {
            quizFeedbackText.textContent = '基礎力は備わっていますが、LLD面接独特の「名詞の厳選」や「関係的状態の分離」といった思想に少し苦戦しているようです。「LLD設計論」タブの解説をもう一度確認してみましょう。';
        }
    }

    btnRestartQuiz.addEventListener('click', () => {
        currentQuestionIndex = 0;
        correctScore = 0;
        quizResultCard.classList.add('hidden');
        quizQuestionCard.classList.remove('hidden');
        loadQuizQuestion(0);
    });

    // Load first question initially
    loadQuizQuestion(0);
});
