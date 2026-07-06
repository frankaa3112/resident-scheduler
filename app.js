// Resident Physician Scheduling System - Core Logic (Duty-Only & Weekly Off-duty Edition)

// State management
let state = {
    currentMonth: '2026-07', // YYYY-MM
    residents: [],
    schedule: {}, // key: "YYYY-MM", value: { "docId_dayNum": "C1"|"C2"|"O" }
    saturdayAssignments: {}, // key: "YYYY-MM", value: { "dayNum": { angio: "docId", spec: "docId", inj: "docId" } }
    lastMonthLastDayDuty: {}, // key: "YYYY-MM", value: { C1: "docId", C2: "docId" }
    rules: {
        offWeekdays: true,
        consecutiveDuty: true,
        avoidQod: true,
        maxShifts: true,
        offDays: true,
        weekendFair: true
    },
    requirements: {
        weekday: { C1: 1, C2: 1 },
        weekend: { C1: 1, C2: 1 }
    },
    warnings: []
};

// Constant Shift types (Day and Night shifts are removed)
const SHIFT_TYPES = {
    C1: { name: '一線值班 (C1)', code: 'C1', class: 'shift-c1' },
    C2: { name: '二線值班 (C2)', code: 'C2', class: 'shift-c2' },
    O: { name: '休假 (Off)', code: 'O', class: 'shift-off' }
};

// Initial/Default Doctors List (No PGY, with weekly off-duty weekday settings and multiple tiers)
const DEFAULT_RESIDENTS = [
    { id: '1', name: '醫師一', level: 'R4 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#3b82f6', satPositions: ['angio', 'spec', 'inj'] },
    { id: '2', name: '醫師二', level: 'R4 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#10b981', satPositions: ['angio', 'spec', 'inj'] },
    { id: '3', name: '醫師三', level: 'R4 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#a855f7', satPositions: ['angio', 'spec', 'inj'] },
    { id: '4', name: '醫師四', level: 'R3 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#d97706', satPositions: ['angio', 'spec', 'inj'] },
    { id: '5', name: '醫師五', level: 'R3 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#ec4899', satPositions: ['angio', 'spec', 'inj'] },
    { id: '6', name: '醫師六', level: 'R3 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#0891b2', satPositions: ['angio', 'spec', 'inj'] },
    { id: '7', name: '醫師七', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#6366f1', satPositions: ['angio', 'spec', 'inj'] },
    { id: '8', name: '醫師八', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#0d9488', satPositions: ['angio', 'spec', 'inj'] },
    { id: '9', name: '醫師九', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#f43f5e', satPositions: ['angio', 'spec', 'inj'] }
];

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initEventListeners();
    renderAll();
});

// Load data from LocalStorage or load defaults
function loadData() {
    const savedState = localStorage.getItem('resident_scheduler_state');
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            // Migrate state residents
            state.residents.forEach((doc, index) => {
                if (!doc.offWeekdays) {
                    doc.offWeekdays = [];
                }
                if (!doc.tiers) {
                    if (doc.tier) {
                        doc.tiers = [doc.tier];
                        delete doc.tier;
                    } else {
                        doc.tiers = (doc.level.includes('CR') || doc.level.includes('R4')) ? ['second'] : ['first'];
                    }
                }
                if (!doc.color) {
                    const defaultColors = ['#3b82f6', '#10b981', '#a855f7', '#d97706', '#ec4899', '#0891b2', '#6366f1', '#0d9488', '#f43f5e', '#b45309'];
                    doc.color = defaultColors[index % defaultColors.length];
                }
                if (!doc.satPositions) {
                    doc.satPositions = ['angio', 'spec', 'inj'];
                }
            });

            // Ensure schedule structure migration
            const isScheduleFlat = state.schedule && Object.keys(state.schedule).length > 0 && !Object.keys(state.schedule).some(k => k.includes('-'));
            if (isScheduleFlat || Array.isArray(state.schedule) || !state.schedule || Object.keys(state.schedule).length === 0 || typeof state.schedule !== 'object') {
                const oldSchedule = state.schedule || {};
                state.schedule = {};
                state.schedule[state.currentMonth] = oldSchedule;
            }

            // Ensure saturdayAssignments structure migration
            const isSatFlat = state.saturdayAssignments && Object.keys(state.saturdayAssignments).length > 0 && !Object.keys(state.saturdayAssignments).some(k => k.includes('-'));
            if (isSatFlat || Array.isArray(state.saturdayAssignments) || !state.saturdayAssignments || Object.keys(state.saturdayAssignments).length === 0 || typeof state.saturdayAssignments !== 'object') {
                const oldSat = state.saturdayAssignments || {};
                state.saturdayAssignments = {};
                state.saturdayAssignments[state.currentMonth] = oldSat;
            }

            // Ensure lastMonthLastDayDuty structure migration
            const isLastDayFlat = state.lastMonthLastDayDuty && !Object.keys(state.lastMonthLastDayDuty).some(k => k.includes('-'));
            if (isLastDayFlat || !state.lastMonthLastDayDuty || typeof state.lastMonthLastDayDuty !== 'object') {
                const oldLast = state.lastMonthLastDayDuty || { C1: "", C2: "" };
                state.lastMonthLastDayDuty = {};
                state.lastMonthLastDayDuty[state.currentMonth] = oldLast;
            }

            // Ensure rule config is migrated
            if (state.rules.offWeekdays === undefined) {
                state.rules.offWeekdays = true;
            }
            if (state.rules.avoidQod === undefined) {
                state.rules.avoidQod = true;
            }
            if (state.rules.pmAm !== undefined) {
                delete state.rules.pmAm;
            }
            // Ensure D and N shift requirements are removed
            if (state.requirements.weekday.D !== undefined) {
                state.requirements.weekday = { C1: 1, C2: 1 };
                state.requirements.weekend = { C1: 1, C2: 1 };
            }
            // Strip out D and N assignments from schedule across all months
            Object.keys(state.schedule).forEach(month => {
                if (state.schedule[month] && typeof state.schedule[month] === 'object') {
                    Object.keys(state.schedule[month]).forEach(key => {
                        const shift = state.schedule[month][key];
                        if (shift === 'D' || shift === 'N') {
                            state.schedule[month][key] = 'O';
                        }
                    });
                }
            });
        } catch (e) {
            console.error('Error loading saved state, loading defaults.', e);
            loadDefaults();
        }
    } else {
        loadDefaults();
    }
}

function loadDefaults() {
    state.residents = JSON.parse(JSON.stringify(DEFAULT_RESIDENTS));
    state.requirements = {
        weekday: { C1: 1, C2: 1 },
        weekend: { C1: 1, C2: 1 }
    };
    state.schedule = {};
    state.schedule[state.currentMonth] = {};
    state.saturdayAssignments = {};
    state.saturdayAssignments[state.currentMonth] = {};
    state.lastMonthLastDayDuty = {};
    state.lastMonthLastDayDuty[state.currentMonth] = { C1: "", C2: "" };
    saveData();
}

function saveData() {
    localStorage.setItem('resident_scheduler_state', JSON.stringify(state));
}

// Helper to get days in current month
function getDaysInMonth() {
    const [year, month] = state.currentMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
}

// Helper to get weekday name for a day (1 to 31)
function getWeekday(day) {
    const [year, month] = state.currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return {
        name: weekdays[date.getDay()],
        num: date.getDay(), // 0 for Sun, 6 for Sat
        isWeekend: date.getDay() === 0 || date.getDay() === 6
    };
}

// Helper to get dynamic color scheme for each doctor based on their index in the list (Opaque, border-less)
function getDoctorColorStyles(docId) {
    const doc = state.residents.find(r => r.id === docId);
    if (!doc || !doc.color) {
        return { bg: '#64748b', text: '#ffffff' };
    }
    return { bg: doc.color, text: '#ffffff' };
}

// Initializing DOM events
function initEventListeners() {
    // Month picker
    const monthInput = document.getElementById('month-select');
    if (monthInput) {
        monthInput.value = state.currentMonth;
        monthInput.addEventListener('change', (e) => {
            state.currentMonth = e.target.value;
            saveData();
            renderAll();
        });
    }

    // Add Resident button and modal
    const addDocBtn = document.getElementById('btn-add-doctor');
    const modal = document.getElementById('doctor-modal');
    const closeModal = document.getElementById('modal-close');
    const cancelModal = document.getElementById('modal-cancel');
    const doctorForm = document.getElementById('doctor-form');

    if (addDocBtn && modal) {
        addDocBtn.addEventListener('click', () => {
            document.getElementById('modal-action-title').innerText = '新增住院醫師';
            document.getElementById('doctor-id').value = '';
            doctorForm.reset();
            
            // Clear checked styling
            document.querySelectorAll('input[name="doc-off-weekday"]').forEach(cb => {
                cb.checked = false;
                cb.closest('.weekday-checkbox-label').classList.remove('is-checked');
            });
            
            // Reset checked tiers checkboxes
            document.querySelectorAll('input[name="doc-tiers"]').forEach(cb => {
                cb.checked = false;
            });
            document.getElementById('doc-tier-first').checked = true;
            document.getElementById('doc-color-input').value = '#3b82f6';
            
            document.querySelectorAll('input[name="doc-sat-positions"]').forEach(cb => {
                cb.checked = true;
            });
            
            modal.classList.add('active');
        });
    }

    const hideModal = () => modal.classList.remove('active');
    if (closeModal) closeModal.addEventListener('click', hideModal);
    if (cancelModal) cancelModal.addEventListener('click', hideModal);

    // Weekdays checked tags interactive effects in modal
    const wdCheckboxes = document.querySelectorAll('input[name="doc-off-weekday"]');
    wdCheckboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const label = e.target.closest('.weekday-checkbox-label');
            if (label) {
                if (e.target.checked) label.classList.add('is-checked');
                else label.classList.remove('is-checked');
            }
        });
    });

    // Save resident profile
    if (doctorForm) {
        doctorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('doctor-id').value;
            const name = document.getElementById('doc-name-input').value.trim();
            const level = document.getElementById('doc-level-input').value;
            const tiersCheckboxes = document.querySelectorAll('input[name="doc-tiers"]:checked');
            const tiers = Array.from(tiersCheckboxes).map(cb => cb.value);
            const color = document.getElementById('doc-color-input').value || '#3b82f6';
            
            // Get off weekdays
            const offWeekdaysCheckboxes = document.querySelectorAll('input[name="doc-off-weekday"]:checked');
            const offWeekdays = Array.from(offWeekdaysCheckboxes).map(cb => Number(cb.value));

            // Get saturday positions
            const satPositionsCheckboxes = document.querySelectorAll('input[name="doc-sat-positions"]:checked');
            const satPositions = Array.from(satPositionsCheckboxes).map(cb => cb.value);

            const maxShifts = Number(document.getElementById('doc-shifts-input').value);
            const offDaysStr = document.getElementById('doc-offdays-input').value;
            
            const offDays = offDaysStr.split(',')
                .map(s => Number(s.trim()))
                .filter(n => !isNaN(n) && n >= 1 && n <= 31);

            if (!name) return;
            if (tiers.length === 0) {
                alert('請至少選擇一種值班類別（一線或二線）！');
                return;
            }

            if (id) {
                // Edit existing
                const doc = state.residents.find(r => r.id === id);
                if (doc) {
                    doc.name = name;
                    doc.level = level;
                    doc.tiers = tiers;
                    doc.offWeekdays = offWeekdays;
                    doc.satPositions = satPositions;
                    doc.maxShifts = maxShifts;
                    doc.offDays = offDays;
                    doc.color = color;
                }
            } else {
                // Add new
                const newId = (state.residents.length > 0 ? Math.max(...state.residents.map(r => Number(r.id))) + 1 : 1).toString();
                state.residents.push({ id: newId, name, level, tiers, offWeekdays, satPositions, maxShifts, offDays, color });
            }

            saveData();
            hideModal();
            renderAll();
        });
    }

    // Rules changes
    const ruleCheckboxes = document.querySelectorAll('.rule-item input[type="checkbox"]');
    ruleCheckboxes.forEach(cb => {
        const ruleKey = cb.dataset.rule;
        cb.checked = state.rules[ruleKey];
        cb.addEventListener('change', (e) => {
            state.rules[ruleKey] = e.target.checked;
            saveData();
            validateSchedule();
            renderGrid();
            renderWarnings();
            renderStats();
        });
    });

    // Daily Shift Editor Modal bindings
    const dailyModal = document.getElementById('daily-editor-modal');
    const closeDaily = document.getElementById('daily-editor-close');
    const cancelDaily = document.getElementById('daily-editor-cancel');
    const dailyForm = document.getElementById('daily-editor-form');

    const hideDailyModal = () => dailyModal.classList.remove('active');
    if (closeDaily) closeDaily.addEventListener('click', hideDailyModal);
    if (cancelDaily) cancelDaily.addEventListener('click', hideDailyModal);

    if (dailyForm) {
        dailyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveDailyShifts();
        });
    }

    // Auto schedule button
    const autoBtn = document.getElementById('btn-auto-schedule');
    if (autoBtn) {
        autoBtn.addEventListener('click', () => {
            runAutoScheduler();
        });
    }

    // Clear schedule button
    const clearBtn = document.getElementById('btn-clear-schedule');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('確定要清除本月的所有排班嗎？')) {
                state.schedule[state.currentMonth] = {};
                state.saturdayAssignments[state.currentMonth] = {};
                saveData();
                renderAll();
            }
        });
    }

    // Reset settings button
    const resetBtn = document.getElementById('btn-reset-settings');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('確定要重設為預設醫師名單與排班資料嗎？')) {
                loadDefaults();
                renderAll();
            }
        });
    }

    // Export CSV
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }

    // Print
    const printBtn = document.getElementById('btn-print');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // Staffing requirements inputs
    const reqInputs = {
        'req-wd-c1': () => state.requirements.weekday.C1,
        'req-wd-c2': () => state.requirements.weekday.C2,
        'req-we-c1': () => state.requirements.weekend.C1,
        'req-we-c2': () => state.requirements.weekend.C2
    };

    Object.keys(reqInputs).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = reqInputs[id]();
            el.addEventListener('change', (e) => {
                const val = Math.max(0, parseInt(e.target.value) || 0);
                e.target.value = val;

                if (id === 'req-wd-c1') state.requirements.weekday.C1 = val;
                else if (id === 'req-wd-c2') state.requirements.weekday.C2 = val;
                else if (id === 'req-we-c1') state.requirements.weekend.C1 = val;
                else if (id === 'req-we-c2') state.requirements.weekend.C2 = val;

                saveData();
                validateSchedule();
                renderGrid();
                renderWarnings();
                renderStats();
            });
        }
    });

    // Last month last day duty listeners
    const lastDayC1 = document.getElementById('last-day-c1');
    const lastDayC2 = document.getElementById('last-day-c2');
    
    if (lastDayC1) {
        lastDayC1.addEventListener('change', (e) => {
            if (!state.lastMonthLastDayDuty[state.currentMonth]) {
                state.lastMonthLastDayDuty[state.currentMonth] = { C1: '', C2: '' };
            }
            state.lastMonthLastDayDuty[state.currentMonth].C1 = e.target.value;
            saveData();
            renderAll();
        });
    }
    if (lastDayC2) {
        lastDayC2.addEventListener('change', (e) => {
            if (!state.lastMonthLastDayDuty[state.currentMonth]) {
                state.lastMonthLastDayDuty[state.currentMonth] = { C1: '', C2: '' };
            }
            state.lastMonthLastDayDuty[state.currentMonth].C2 = e.target.value;
            saveData();
            renderAll();
        });
    }
}

// Edit doctor info
function editDoctor(id) {
    const doc = state.residents.find(r => r.id === id);
    if (!doc) return;

    document.getElementById('modal-action-title').innerText = '修改住院醫師資料';
    document.getElementById('doctor-id').value = doc.id;
    document.getElementById('doc-name-input').value = doc.name;
    document.getElementById('doc-level-input').value = doc.level;
    
    document.getElementById('doc-tier-first').checked = doc.tiers ? doc.tiers.includes('first') : false;
    document.getElementById('doc-tier-second').checked = doc.tiers ? doc.tiers.includes('second') : false;
    
    // Clear and check weekly off days
    const allWdCheckboxes = document.querySelectorAll('input[name="doc-off-weekday"]');
    allWdCheckboxes.forEach(cb => {
        cb.checked = false;
        cb.closest('.weekday-checkbox-label').classList.remove('is-checked');
    });
    
    doc.offWeekdays.forEach(w => {
        const cb = document.querySelector(`input[name="doc-off-weekday"][value="${w}"]`);
        if (cb) {
            cb.checked = true;
            cb.closest('.weekday-checkbox-label').classList.add('is-checked');
        }
    });

    // Populate satPositions checkboxes
    const allSatCheckboxes = document.querySelectorAll('input[name="doc-sat-positions"]');
    allSatCheckboxes.forEach(cb => {
        cb.checked = doc.satPositions ? doc.satPositions.includes(cb.value) : true;
    });

    document.getElementById('doc-shifts-input').value = doc.maxShifts;
    document.getElementById('doc-offdays-input').value = doc.offDays.join(', ');
    document.getElementById('doc-color-input').value = doc.color || '#3b82f6';

    const modal = document.getElementById('doctor-modal');
    modal.classList.add('active');
}

// Delete doctor profile
function deleteDoctor(id) {
    if (confirm('確定要刪除這位醫師嗎？此動作亦會清除其所有的排班。')) {
        state.residents = state.residents.filter(r => r.id !== id);
        
        // Remove shifts for this doctor across all months
        Object.keys(state.schedule).forEach(month => {
            if (state.schedule[month] && typeof state.schedule[month] === 'object') {
                Object.keys(state.schedule[month]).forEach(key => {
                    if (key.startsWith(id + '_')) {
                        delete state.schedule[month][key];
                    }
                });
            }
        });

        // Remove saturday assignments for this doctor across all months
        Object.keys(state.saturdayAssignments).forEach(month => {
            if (state.saturdayAssignments[month] && typeof state.saturdayAssignments[month] === 'object') {
                Object.keys(state.saturdayAssignments[month]).forEach(day => {
                    const assign = state.saturdayAssignments[month][day] || {};
                    if (assign.angio === id) assign.angio = '';
                    if (assign.spec === id) assign.spec = '';
                    if (assign.inj === id) assign.inj = '';
                });
            }
        });

        saveData();
        renderAll();
    }
}

// Rendering function - Combines everything
function renderAll() {
    syncRequirementsInputs();
    syncLastMonthDutySelects();
    renderDoctorList();
    renderGrid();
    validateSchedule();
    renderWarnings();
    renderStats();
    
    // Update print view label
    const printLabel = document.getElementById('print-month-label');
    if (printLabel) {
        printLabel.innerText = state.currentMonth;
    }
}

function syncLastMonthDutySelects() {
    const lastDayC1 = document.getElementById('last-day-c1');
    const lastDayC2 = document.getElementById('last-day-c2');
    if (!lastDayC1 || !lastDayC2) return;

    let optHtml = '<option value="">-- 未值班 --</option>';
    state.residents.forEach(doc => {
        optHtml += `<option value="${doc.id}">${doc.name} (${doc.level.split(' ')[0]})</option>`;
    });

    const monthDuty = state.lastMonthLastDayDuty[state.currentMonth] || {};
    const prevC1Val = monthDuty.C1 || '';
    const prevC2Val = monthDuty.C2 || '';

    lastDayC1.innerHTML = optHtml;
    lastDayC2.innerHTML = optHtml;

    lastDayC1.value = prevC1Val;
    lastDayC2.value = prevC2Val;
}

function syncRequirementsInputs() {
    const inputs = {
        'req-wd-c1': state.requirements.weekday.C1,
        'req-wd-c2': state.requirements.weekday.C2,
        'req-we-c1': state.requirements.weekend.C1,
        'req-we-c2': state.requirements.weekend.C2
    };
    Object.keys(inputs).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = inputs[id];
    });
}

// Render the doctors list in the sidebar
function renderDoctorList() {
    const listContainer = document.getElementById('doctors-container');
    const countBadge = document.getElementById('doctors-count');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    countBadge.innerText = state.residents.length.toString();

    if (state.residents.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding: 10px 0;">尚無醫師資料</div>`;
        return;
    }

    state.residents.forEach(doc => {
        const color = getDoctorColorStyles(doc.id);
        const item = document.createElement('div');
        item.className = 'doctor-item';
        item.style.borderLeft = `4px solid ${color.bg}`;
        
        let tierBadges = '';
        if (doc.tiers) {
            if (doc.tiers.includes('first')) tierBadges += '<span class="tier-badge tier-first">一線</span>';
            if (doc.tiers.includes('second')) tierBadges += '<span class="tier-badge tier-second">二線</span>';
        }

        // Weekday names mapping
        let offWeekdaysText = '';
        if (doc.offWeekdays && doc.offWeekdays.length > 0) {
            const weekdaysNames = ['日', '一', '二', '三', '四', '五', '六'];
            offWeekdaysText = `<div class="doc-off-weekdays">週${doc.offWeekdays.map(w => weekdaysNames[w]).join('、週')} 不值班</div>`;
        }

        // Saturday positions list
        let satPositionsText = '';
        if (doc.satPositions && doc.satPositions.length > 0) {
            const posMap = { angio: '血管', spec: '特攝', inj: '注射' };
            satPositionsText = `<div style="font-size:0.7rem; color:var(--accent-cyan); margin-top:2px; font-weight:500;">週六可值: ${doc.satPositions.map(p => posMap[p]).join('、')}</div>`;
        } else {
            satPositionsText = `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">週六無可值位置</div>`;
        }

        item.innerHTML = `
            <div class="doc-info">
                <div class="doc-name-container">
                    <span class="doc-name">${doc.name}</span>
                    ${tierBadges}
                </div>
                <div class="doc-level">${doc.level} (限值 ${doc.maxShifts} 班)</div>
                ${offWeekdaysText}
                ${satPositionsText}
            </div>
            <div class="doc-actions">
                <button class="btn-icon" title="編輯" onclick="editDoctor('${doc.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="btn-icon delete-btn" title="刪除" onclick="deleteDoctor('${doc.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// Render the monthly calendar grid view (Monday as the first day of the week)
function renderGrid() {
    const gridContainer = document.getElementById('grid-container');
    if (!gridContainer) return;

    const daysCount = getDaysInMonth();
    const [year, month] = state.currentMonth.split('-').map(Number);
    const firstDayIndexRaw = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const firstDayIndex = firstDayIndexRaw === 0 ? 6 : firstDayIndexRaw - 1; // 0 = Mon, 6 = Sun

    let html = `
        <div class="calendar-header-row">
            <div>週一 (Mon)</div>
            <div>週二 (Tue)</div>
            <div>週三 (Wed)</div>
            <div>週四 (Thu)</div>
            <div>週五 (Fri)</div>
            <div style="color: var(--accent-cyan);">週六 (Sat)</div>
            <div style="color: var(--accent-cyan);">週日 (Sun)</div>
        </div>
        <div class="calendar-grid">
    `;

    // Render leading empty days (replace last one with prev-month last-day card)
    {
        const monthDuty = state.lastMonthLastDayDuty[state.currentMonth] || {};
        const c1Doc = state.residents.find(r => r.id === monthDuty.C1);
        const c2Doc = state.residents.find(r => r.id === monthDuty.C2);

        const c1Color = c1Doc ? getDoctorColorStyles(c1Doc.id) : null;
        const c2Color = c2Doc ? getDoctorColorStyles(c2Doc.id) : null;

        const prevC1Html = c1Doc
            ? `<div class="day-shift-slot" style="background-color:${c1Color.bg}; border:none; color:${c1Color.text};"><span class="slot-label shift-c1" style="background:rgba(255,255,255,0.25); color:${c1Color.text};">C1</span><span class="slot-staff" style="color:${c1Color.text}; font-weight:600;">${c1Doc.name}</span></div>`
            : `<div class="day-shift-slot slot-c1" style="opacity:0.6;"><span class="slot-label">C1</span><span class="slot-staff">未設定</span></div>`;
        const prevC2Html = c2Doc
            ? `<div class="day-shift-slot" style="background-color:${c2Color.bg}; border:none; color:${c2Color.text};"><span class="slot-label shift-c2" style="background:rgba(255,255,255,0.25); color:${c2Color.text};">C2</span><span class="slot-staff" style="color:${c2Color.text}; font-weight:600;">${c2Doc.name}</span></div>`
            : `<div class="day-shift-slot slot-c2" style="opacity:0.6;"><span class="slot-label">C2</span><span class="slot-staff">未設定</span></div>`;

        const prevMonthCard = `
            <div class="calendar-day-card" onclick="openDailyEditor('last-month')" style="opacity:0.6; border-style: dashed; cursor:pointer;">
                <div class="day-card-header">
                    <span class="day-card-num" style="font-size:0.75rem; color:var(--text-muted);">上月末</span>
                    <span class="day-card-weekday" style="font-size:0.6rem; color:var(--text-muted);">前日</span>
                </div>
                <div class="day-shift-list">
                    ${prevC1Html}
                    ${prevC2Html}
                </div>
            </div>`;

        for (let i = 0; i < firstDayIndex; i++) {
            if (i === firstDayIndex - 1) {
                html += prevMonthCard;
            } else {
                html += `<div class="calendar-day-card empty-day"></div>`;
            }
        }
        // If month starts on Monday (firstDayIndex===0), prepend the card before the grid
        if (firstDayIndex === 0) {
            html = html.replace('<div class="calendar-grid">', `<div class="calendar-grid">` + prevMonthCard);
        }
    }

    // Render actual day cells
    for (let d = 1; d <= daysCount; d++) {
        const wd = getWeekday(d);
        const req = wd.isWeekend ? state.requirements.weekend : state.requirements.weekday;

        // Group doctor assignments for this day
        let dayStaff = { C1: [], C2: [] };
        state.residents.forEach(doc => {
            const shift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            if (shift in dayStaff) {
                dayStaff[shift].push(doc);
            }
        });

        // Check if there are warning violations (excluding general system coverage gaps)
        const hasViolation = state.warnings.some(w => w.day === d && w.docId !== 'sys');
        
        // Render C1 slots
        let c1Html = '';
        if (dayStaff.C1.length === 0) {
            c1Html = `
                <div class="day-shift-slot slot-c1 ${req.C1 > 0 ? 'slot-understaffed' : ''}">
                    <span class="slot-label">C1</span>
                    <span class="slot-staff">無人</span>
                </div>
            `;
        } else {
            dayStaff.C1.forEach(doc => {
                const color = getDoctorColorStyles(doc.id);
                c1Html += `
                    <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                        <span class="slot-label shift-c1" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">C1</span>
                        <span class="slot-staff" title="${doc.name} (${doc.level.split(' ')[0]})" style="color: ${color.text}; font-weight: 600;">${doc.name}</span>
                    </div>
                `;
            });
            if (dayStaff.C1.length < req.C1) {
                c1Html += `
                    <div class="day-shift-slot slot-c1 slot-understaffed">
                        <span class="slot-label">C1</span>
                        <span class="slot-staff">缺人</span>
                    </div>
                `;
            }
        }

        // Render C2 slots
        let c2Html = '';
        if (dayStaff.C2.length === 0) {
            c2Html = `
                <div class="day-shift-slot slot-c2 ${req.C2 > 0 ? 'slot-understaffed' : ''}">
                    <span class="slot-label">C2</span>
                    <span class="slot-staff">無人</span>
                </div>
            `;
        } else {
            dayStaff.C2.forEach(doc => {
                const color = getDoctorColorStyles(doc.id);
                c2Html += `
                    <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                        <span class="slot-label shift-c2" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">C2</span>
                        <span class="slot-staff" title="${doc.name} (${doc.level.split(' ')[0]})" style="color: ${color.text}; font-weight: 600;">${doc.name}</span>
                    </div>
                `;
            });
            if (dayStaff.C2.length < req.C2) {
                c2Html += `
                    <div class="day-shift-slot slot-c2 slot-understaffed">
                        <span class="slot-label">C2</span>
                        <span class="slot-staff">缺人</span>
                    </div>
                `;
            }
        }

        // Render saturday positions tags if it's Saturday
        let satPositionsHtml = '';
        if (wd.num === 6) {
            const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
            const posLabels = { angio: '血管', spec: '特攝', inj: '注射' };
            
            ['angio', 'spec', 'inj'].forEach(pos => {
                const assignedDocId = dayAssign[pos];
                const doc = state.residents.find(r => r.id === assignedDocId);
                if (doc) {
                    satPositionsHtml += `
                        <div class="sat-position-tag ${pos}">
                            <span class="sat-position-label">${posLabels[pos]}</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${doc.name}</span>
                        </div>
                    `;
                } else {
                    satPositionsHtml += `
                        <div class="sat-position-tag unassigned">
                            <span class="sat-position-label">${posLabels[pos]}</span>
                            <span>缺人</span>
                        </div>
                    `;
                }
            });
        }

        html += `
            <div class="calendar-day-card ${wd.isWeekend ? 'is-weekend' : ''} ${hasViolation ? 'has-violation' : ''}" 
                 onclick="openDailyEditor(${d})">
                <div class="day-card-header">
                    <span class="day-card-num">${d}</span>
                    <span class="day-card-weekday">${wd.name}</span>
                </div>
                <div class="day-shift-list">
                    ${c1Html}
                    ${c2Html}
                    ${satPositionsHtml}
                </div>
                <div class="violation-dot" title="此日排班存在個人衝突警告！"></div>
            </div>
        `;
    }

    // Render trailing empty days to form complete rows
    const totalCells = firstDayIndex + daysCount;
    const remainder = totalCells % 7;
    if (remainder !== 0) {
        for (let i = 0; i < (7 - remainder); i++) {
            html += `<div class="calendar-day-card empty-day"></div>`;
        }
    }

    html += `</div>`;
    gridContainer.innerHTML = html;
}

// Open Single-Day shift editor modal
function openDailyEditor(day) {
    if (state.residents.length === 0) {
        alert('請先在側邊欄新增住院醫師！');
        return;
    }

    const isLastMonth = (day === 'last-month');

    if (isLastMonth) {
        document.getElementById('daily-editor-title').innerText = '上月最後一日 值班設定';
    } else {
        const wd = getWeekday(day);
        document.getElementById('daily-editor-title').innerText = `${state.currentMonth}-${day.toString().padStart(2, '0')} (${wd.name}) 排班編輯`;
    }
    document.getElementById('daily-editor-day').value = day;

    // Checkboxes containers
    const c1Container = document.getElementById('daily-editor-c1-checkboxes');
    const c2Container = document.getElementById('daily-editor-c2-checkboxes');

    c1Container.innerHTML = '';
    c2Container.innerHTML = '';

    // For last-month mode: only show C1/C2 selects, no Saturday section
    if (isLastMonth) {
        const monthDuty = state.lastMonthLastDayDuty[state.currentMonth] || {};

        const makeLastMonthSelect = (label, inputId, currentVal, tierFilter) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'margin-bottom:8px;';
            let optHtml = `<option value="">-- 未值班 --</option>`;
            state.residents.filter(r => r.tiers && r.tiers.includes(tierFilter)).forEach(doc => {
                optHtml += `<option value="${doc.id}" ${currentVal === doc.id ? 'selected' : ''}>${doc.name} (${doc.level.split(' ')[0]})</option>`;
            });
            wrapper.innerHTML = `<label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:4px;">${label}</label><select data-lastmonth-tier="${tierFilter}" style="width:100%; padding:8px; border-radius:var(--border-radius-md); background:rgba(0,0,0,0.2); border:1px solid var(--panel-border); color:var(--text-primary);">${optHtml}</select>`;
            return wrapper;
        };

        c1Container.appendChild(makeLastMonthSelect('一線值班 (C1) 醫師', 'last-c1-select', monthDuty.C1 || '', 'first'));
        c2Container.appendChild(makeLastMonthSelect('二線值班 (C2) 醫師', 'last-c2-select', monthDuty.C2 || '', 'second'));

        const satSection = document.getElementById('daily-editor-sat-section');
        if (satSection) satSection.style.display = 'none';

        const modal = document.getElementById('daily-editor-modal');
        modal.classList.add('active');
        return;
    }

    // Generate checkboxes list
    state.residents.forEach(doc => {
        const docCurrentShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${day}`] || 'O';

        const createCheckbox = (shiftCode) => {
            const isChecked = docCurrentShift === shiftCode;
            const wrapper = document.createElement('label');
            wrapper.className = `doctor-checkbox-label ${isChecked ? 'is-checked' : ''}`;
            wrapper.innerHTML = `
                <input type="checkbox" data-doc-id="${doc.id}" data-shift="${shiftCode}" ${isChecked ? 'checked' : ''}>
                <span>${doc.name} <span style="font-size:0.7rem; color:var(--text-muted);">${doc.level.split(' ')[0]}</span></span>
            `;
            
            const checkbox = wrapper.querySelector('input');
            checkbox.addEventListener('change', handleDailyCheckboxChange);
            return wrapper;
        };

        // C1 (First-line Duty) only shows first-line doctors
        if (doc.tiers && doc.tiers.includes('first')) {
            c1Container.appendChild(createCheckbox('C1'));
        }

        // C2 (Second-line Duty) only shows second-line doctors
        if (doc.tiers && doc.tiers.includes('second')) {
            c2Container.appendChild(createCheckbox('C2'));
        }
    });

    // Saturday Positions block
    const wd = getWeekday(Number(day));
    const satSection = document.getElementById('daily-editor-sat-section');
    if (satSection) {
        if (wd.num === 6) {
            satSection.style.display = 'block';
            
            const selectAngio = document.getElementById('sat-select-angio');
            const selectSpec = document.getElementById('sat-select-spec');
            const selectInj = document.getElementById('sat-select-inj');
            
            // Find Saturday and Friday duty docs for recommendation
            const satDocs = [];
            state.residents.forEach(r => {
                const s = (state.schedule[state.currentMonth] || {})[`${r.id}_${day}`] || 'O';
                if (s === 'C1' || s === 'C2') satDocs.push({ doc: r, status: `週六${s}` });
            });
            const friDocs = [];
            if (day > 1) {
                state.residents.forEach(r => {
                    const s = (state.schedule[state.currentMonth] || {})[`${r.id}_${day - 1}`] || 'O';
                    if (s === 'C1' || s === 'C2') friDocs.push({ doc: r, status: `週五${s}` });
                });
            }

            const getOptionsHtml = (posCode) => {
                let optHtml = '<option value="">-- 未指派 --</option>';
                const dutyDocs = [...satDocs, ...friDocs];
                dutyDocs.forEach(item => {
                    const doc = item.doc;
                    const hasQual = doc.satPositions ? doc.satPositions.includes(posCode) : true;
                    const qualText = hasQual ? '' : ' (無此位置資格)';
                    optHtml += `<option value="${doc.id}">★ ${doc.name} (${item.status})${qualText}</option>`;
                });
                optHtml += '<option disabled>──────────</option>';
                state.residents.forEach(doc => {
                    if (dutyDocs.some(item => item.doc.id === doc.id)) return;
                    const hasQual = doc.satPositions ? doc.satPositions.includes(posCode) : true;
                    const qualText = hasQual ? '' : ' (無此位置資格)';
                    optHtml += `<option value="${doc.id}">${doc.name}${qualText}</option>`;
                });
                return optHtml;
            };

            selectAngio.innerHTML = getOptionsHtml('angio');
            selectSpec.innerHTML = getOptionsHtml('spec');
            selectInj.innerHTML = getOptionsHtml('inj');

            // Select current values
            const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[day] || {};
            selectAngio.value = dayAssign.angio || '';
            selectSpec.value = dayAssign.spec || '';
            selectInj.value = dayAssign.inj || '';
        } else {
            satSection.style.display = 'none';
        }
    }

    const modal = document.getElementById('daily-editor-modal');
    modal.classList.add('active');
}

// Handle mutually exclusive checkboxes in real-time
function handleDailyCheckboxChange(e) {
    const checkbox = e.target;
    const docId = checkbox.dataset.docId;

    if (checkbox.checked) {
        const allDocCheckboxes = document.querySelectorAll(`#daily-editor-modal input[data-doc-id="${docId}"]`);
        allDocCheckboxes.forEach(cb => {
            if (cb !== checkbox) {
                cb.checked = false;
                cb.closest('.doctor-checkbox-label').classList.remove('is-checked');
            }
        });
        checkbox.closest('.doctor-checkbox-label').classList.add('is-checked');
    } else {
        checkbox.closest('.doctor-checkbox-label').classList.remove('is-checked');
    }
}

// Save Daily schedule changes
function saveDailyShifts() {
    const day = document.getElementById('daily-editor-day').value;
    const modal = document.getElementById('daily-editor-modal');

    // Handle last-month mode
    if (day === 'last-month') {
        if (!state.lastMonthLastDayDuty[state.currentMonth]) {
            state.lastMonthLastDayDuty[state.currentMonth] = { C1: '', C2: '' };
        }
        const c1Select = document.querySelector('#daily-editor-c1-checkboxes select[data-lastmonth-tier="first"]');
        const c2Select = document.querySelector('#daily-editor-c2-checkboxes select[data-lastmonth-tier="second"]');
        state.lastMonthLastDayDuty[state.currentMonth].C1 = c1Select ? c1Select.value : '';
        state.lastMonthLastDayDuty[state.currentMonth].C2 = c2Select ? c2Select.value : '';
        saveData();
        modal.classList.remove('active');
        renderAll();
        return;
    }

    if (!state.schedule[state.currentMonth]) {
        state.schedule[state.currentMonth] = {};
    }

    state.residents.forEach(doc => {
        const checkboxes = document.querySelectorAll(`#daily-editor-modal input[data-doc-id="${doc.id}"]`);
        let chosenShift = 'O'; // default to off

        checkboxes.forEach(cb => {
            if (cb.checked) {
                chosenShift = cb.dataset.shift;
            }
        });

        state.schedule[state.currentMonth][`${doc.id}_${day}`] = chosenShift;
    });

    // Save saturday assignments
    const wd = getWeekday(Number(day));
    if (wd.num === 6) {
        const selectAngio = document.getElementById('sat-select-angio');
        const selectSpec = document.getElementById('sat-select-spec');
        const selectInj = document.getElementById('sat-select-inj');
        
        if (!state.saturdayAssignments[state.currentMonth]) {
            state.saturdayAssignments[state.currentMonth] = {};
        }

        state.saturdayAssignments[state.currentMonth][day] = {
            angio: selectAngio ? selectAngio.value : '',
            spec: selectSpec ? selectSpec.value : '',
            inj: selectInj ? selectInj.value : ''
        };
    }

    saveData();
    modal.classList.remove('active');
    renderAll();
}

// Validate Schedule Constraints
function validateSchedule() {
    state.warnings = [];
    const daysCount = getDaysInMonth();

    if (state.residents.length === 0) return;

    state.residents.forEach(doc => {
        let docShiftsCount = 0;

        for (let d = 1; d <= daysCount; d++) {
            const shift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            const wd = getWeekday(d);

            if (shift !== 'O') {
                docShiftsCount++;
            }

            // 1. Weekly Off-duty Weekday Checker (避開特定星期幾)
            if (state.rules.offWeekdays && doc.offWeekdays && doc.offWeekdays.includes(wd.num)) {
                if (shift === 'C1' || shift === 'C2') {
                    state.warnings.push({
                        docId: doc.id,
                        docName: doc.name,
                        day: d,
                        type: 'offWeekdays',
                        message: `${doc.name} 於週${wd.name} (${d} 號) 設定不值班，但被排了 [${SHIFT_TYPES[shift].name.split(' ')[0]}]`
                    });
                }
            }

            // 2. No Consecutive Duties: Duty shift (C1 or C2) on consecutive days
            const isDuty = (s) => s === 'C1' || s === 'C2';
            if (state.rules.consecutiveDuty && isDuty(shift)) {
                if (d < daysCount) {
                    const nextShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d + 1}`] || 'O';
                    if (isDuty(nextShift)) {
                        state.warnings.push({
                            docId: doc.id,
                            docName: doc.name,
                            day: d + 1,
                            type: 'consecutiveDuty',
                            message: `${doc.name} 連續於 ${d} 號及 ${d + 1} 號值班 (違反連續值班限制)`
                        });
                    }
                }
                // Check cross-month consecutive duty for Day 1
                if (d === 1) {
                    const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                    const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                    if (doc.id === prevC1 || doc.id === prevC2) {
                        state.warnings.push({
                            docId: doc.id,
                            docName: doc.name,
                            day: 1,
                            type: 'consecutiveDuty',
                            message: `${doc.name} 連續於上月最後一天及本月 1 號值班 (違反連續值班限制)`
                        });
                    }
                }
            }

            // 2b. Avoid QOD (隔日值班) constraint
            if (state.rules.avoidQod && isDuty(shift)) {
                if (d < daysCount - 1) {
                    const afterNextShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d + 2}`] || 'O';
                    if (isDuty(afterNextShift)) {
                        state.warnings.push({
                            docId: doc.id,
                            docName: doc.name,
                            day: d + 2,
                            type: 'avoidQod',
                            message: `${doc.name} 於 ${d} 號與 ${d + 2} 號間隔一日值班 (違反 QOD 限制)`
                        });
                    }
                }
                // Check cross-month QOD duty for Day 2
                if (d === 2) {
                    const prevShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_1`] || 'O';
                    if (prevShift === 'O') {
                        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                        if (doc.id === prevC1 || doc.id === prevC2) {
                            state.warnings.push({
                                docId: doc.id,
                                docName: doc.name,
                                day: 2,
                                type: 'avoidQod',
                                message: `${doc.name} 於上月最後一天與本月 2 號間隔一日值班 (違反 QOD 限制)`
                            });
                        }
                    }
                }
            }

            // 3. Preferred Off Days: Assigned work shifts on preferred off days
            if (state.rules.offDays && doc.offDays.includes(d)) {
                if (shift !== 'O') {
                    state.warnings.push({
                        docId: doc.id,
                        docName: doc.name,
                        day: d,
                        type: 'offDays',
                        message: `${doc.name} 於預約休假日 (${d} 號) 被排了 [${SHIFT_TYPES[shift].name.split(' ')[0]}]`
                    });
                }
            }

            // 4. Tier Eligibility
            if (shift === 'C1' && (!doc.tiers || !doc.tiers.includes('first'))) {
                state.warnings.push({
                    docId: doc.id,
                    docName: doc.name,
                    day: d,
                    type: 'tierEligibility',
                    message: `${doc.name} 於 ${d} 號被排了一線值班 (C1)，但其無一線資格`
                });
            }
            if (shift === 'C2' && (!doc.tiers || !doc.tiers.includes('second'))) {
                state.warnings.push({
                    docId: doc.id,
                    docName: doc.name,
                    day: d,
                    type: 'tierEligibility',
                    message: `${doc.name} 於 ${d} 號被排了二線值班 (C2)，但其無二線資格`
                });
            }
        }

        // 5. Max Shifts Exceeded
        if (state.rules.maxShifts && docShiftsCount > doc.maxShifts) {
            state.warnings.push({
                docId: doc.id,
                docName: doc.name,
                day: null,
                type: 'maxShifts',
                message: `${doc.name} 本月值班數為 ${docShiftsCount} 班，超出設定上限 ${doc.maxShifts} 班`
            });
        }
    });

    // 6. Shift coverage check
    for (let d = 1; d <= daysCount; d++) {
        const wd = getWeekday(d);
        const req = wd.isWeekend ? state.requirements.weekend : state.requirements.weekday;

        let counts = { C1: 0, C2: 0 };
        state.residents.forEach(doc => {
            const shift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            if (shift in counts) {
                counts[shift]++;
            }
        });

        if (counts.C1 < req.C1) {
            state.warnings.push({
                docId: 'sys',
                docName: '系統',
                day: d,
                type: 'coverage',
                message: `${d} 號 [一線值班] 人力不足！目前 ${counts.C1} 人，需求至少 ${req.C1} 人`
            });
        }
        if (counts.C2 < req.C2) {
            state.warnings.push({
                docId: 'sys',
                docName: '系統',
                day: d,
                type: 'coverage',
                message: `${d} 號 [二線值班] 人力不足！目前 ${counts.C2} 人，需求至少 ${req.C2} 人`
            });
        }
    }

    // 7. Saturday Special Positions Checker
    for (let d = 1; d <= daysCount; d++) {
        const wd = getWeekday(d);
        if (wd.num !== 6) continue;

        const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
        const posMap = { angio: '血管攝影室', spec: '特殊攝影', inj: '注射室' };
        
        // 7.1 Coverage check
        ['angio', 'spec', 'inj'].forEach(pos => {
            if (!dayAssign[pos]) {
                state.warnings.push({
                    docId: 'sys',
                    docName: '系統',
                    day: d,
                    type: 'coverage',
                    message: `${d} 號週六 [${posMap[pos]}] 未指派負責人員`
                });
            }
        });

        // Collect assigned doctors
        const assignedDocs = [];
        const assignedIds = new Set();
        let hasDuplicate = false;

        ['angio', 'spec', 'inj'].forEach(pos => {
            const id = dayAssign[pos];
            if (id) {
                const doc = state.residents.find(r => r.id === id);
                if (doc) {
                    assignedDocs.push({ pos, doc });
                    if (assignedIds.has(id)) {
                        hasDuplicate = true;
                    }
                    assignedIds.add(id);
                }
            }
        });

        // 7.2 Qualification checks
        assignedDocs.forEach(item => {
            if (item.doc.satPositions && !item.doc.satPositions.includes(item.pos)) {
                state.warnings.push({
                    docId: item.doc.id,
                    docName: item.doc.name,
                    day: d,
                    type: 'satPosEligibility',
                    message: `${item.doc.name} 被指派負責週六 [${posMap[item.pos]}]，但其未具備此位置資格`
                });
            }
        });

        // 7.3 Duplicate check
        if (hasDuplicate) {
            state.warnings.push({
                docId: 'sys',
                docName: '系統',
                day: d,
                type: 'coverage',
                message: `${d} 號週六負責人指派重複`
            });
        }

        // 7.4 Friday / Saturday duty match check
        if (assignedDocs.length === 3 && !hasDuplicate) {
            const satDutyIds = [];
            state.residents.forEach(r => {
                const s = (state.schedule[state.currentMonth] || {})[`${r.id}_${d}`] || 'O';
                if (s === 'C1' || s === 'C2') satDutyIds.push(r.id);
            });

            const friDutyIds = [];
            if (d > 1) {
                state.residents.forEach(r => {
                    const s = (state.schedule[state.currentMonth] || {})[`${r.id}_${d - 1}`] || 'O';
                    if (s === 'C1' || s === 'C2') friDutyIds.push(r.id);
                });
            } else {
                const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                if (prevC1) friDutyIds.push(prevC1);
                if (prevC2) friDutyIds.push(prevC2);
            }

            let satCount = 0;
            let friCount = 0;
            let otherCount = 0;

            assignedDocs.forEach(item => {
                const id = item.doc.id;
                if (satDutyIds.includes(id)) {
                    satCount++;
                } else if (friDutyIds.includes(id)) {
                    friCount++;
                } else {
                    otherCount++;
                }
            });

            if (satCount !== 2 || friCount !== 1 || otherCount > 0) {
                state.warnings.push({
                    docId: 'sys',
                    docName: '系統',
                    day: d,
                    type: 'coverage',
                    message: `${d} 號週六特殊位置指派與值班表不符 (應有 2 人為週六值班醫師，1 人為週五值班醫師)`
                });
            }
        }
    }
}

// Render active warnings
function renderWarnings() {
    const container = document.getElementById('warnings-container');
    if (!container) return;

    container.innerHTML = '';

    if (state.warnings.length === 0) {
        container.innerHTML = `
            <div class="no-warnings">
                <span class="success-icon">✓</span>
                <span>無排班衝突，符合所有啟用的排班規則</span>
            </div>
        `;
        return;
    }

    state.warnings.forEach(warn => {
        const alert = document.createElement('div');
        alert.className = 'warning-alert';
        
        let alertIcon = '!';
        if (warn.type === 'coverage') alertIcon = '⚠';
        
        alert.innerHTML = `
            <span class="warning-icon">${alertIcon}</span>
            <div>
                <strong>${warn.day ? warn.day + ' 號' : '全月限制'}：</strong>
                <span>${warn.message}</span>
            </div>
        `;
        container.appendChild(alert);
    });
}

// Render doctor workload breakdown and limits
function renderStats() {
    const body = document.getElementById('stats-table-body');
    if (!body) return;

    body.innerHTML = '';
    const daysCount = getDaysInMonth();

    if (state.residents.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">無資料</td></tr>`;
        return;
    }

    state.residents.forEach(doc => {
        let stats = { C1: 0, C2: 0, O: 0 };
        let weekendDutyCount = 0;

        for (let d = 1; d <= daysCount; d++) {
            const shift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            if (shift in stats) stats[shift]++;

            const isDuty = (s) => s === 'C1' || s === 'C2';
            if (isDuty(shift) && getWeekday(d).isWeekend) {
                weekendDutyCount++;
            }
        }

        const totalShifts = stats.C1 + stats.C2;
        const limitRatio = Math.min((totalShifts / doc.maxShifts) * 100, 100);
        
        let progressColor = 'var(--accent-cyan)';
        if (totalShifts > doc.maxShifts) progressColor = 'var(--color-danger)';
        else if (totalShifts === doc.maxShifts) progressColor = 'var(--color-warning)';

        let tierBadges = '';
        if (doc.tiers) {
            if (doc.tiers.includes('first')) tierBadges += '<span class="tier-badge tier-first">一線</span>';
            if (doc.tiers.includes('second')) tierBadges += '<span class="tier-badge tier-second">二線</span>';
        }

        const color = getDoctorColorStyles(doc.id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${color.bg}; margin-right:6px; vertical-align:middle;"></span>
                <strong>${doc.name}</strong> 
                ${tierBadges}
                <br>
                <span style="font-size:0.7rem; color:var(--text-muted);">${doc.level}</span>
            </td>
            <td>
                <div class="stats-bar-container">
                    <div class="stats-bar" style="width: ${limitRatio}%; background-color: ${progressColor};"></div>
                </div>
                <span>${totalShifts} / ${doc.maxShifts}</span>
            </td>
            <td><span class="shift-badge shift-c1" style="width:20px; height:20px; font-size:0.7rem; margin-right:4px;">C1</span> ${stats.C1}</td>
            <td><span class="shift-badge shift-c2" style="width:20px; height:20px; font-size:0.7rem; margin-right:4px;">C2</span> ${stats.C2}</td>
            <td><span>${weekendDutyCount}</span></td>
        `;
        body.appendChild(tr);
    });
}

// Auto-scheduling heuristic solver
function runAutoScheduler() {
    if (state.residents.length === 0) {
        alert('請先在側邊欄新增住院醫師！');
        return;
    }

    const loader = document.getElementById('loading-overlay');
    loader.classList.add('active');

    setTimeout(() => {
        const success = solveSchedule();
        loader.classList.remove('active');
        
        if (success) {
            saveData();
            renderAll();
        } else {
            alert('排班演算法無法在限制內找到完美排班。已產生衝突最少的草稿，請點擊格子手動調整衝突處。');
            saveData();
            renderAll();
        }
    }, 600);
}

// Helper to find a valid assignment for a given Saturday day in a temporary schedule
function findSaturdayAssignment(day, tempSchedule) {
    const satDoctors = [];
    state.residents.forEach(r => {
        const shift = tempSchedule[`${r.id}_${day}`] || 'O';
        if (shift === 'C1' || shift === 'C2') satDoctors.push(r);
    });

    const friDoctors = [];
    if (day > 1) {
        state.residents.forEach(r => {
            const shift = tempSchedule[`${r.id}_${day - 1}`] || 'O';
            if (shift === 'C1' || shift === 'C2') friDoctors.push(r);
        });
    } else {
        // Cross-month: Day 1 Saturday (Friday is the last day of last month)
        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
        [prevC1, prevC2].forEach(id => {
            if (id) {
                const doc = state.residents.find(r => r.id === id);
                if (doc) friDoctors.push(doc);
            }
        });
    }

    if (satDoctors.length < 2) return null;
    const friCandidates = friDoctors.length > 0 ? friDoctors : state.residents;

    for (let i = 0; i < satDoctors.length; i++) {
        for (let j = 0; j < satDoctors.length; j++) {
            if (i === j) continue;
            const docSat1 = satDoctors[i];
            const docSat2 = satDoctors[j];

            for (let k = 0; k < friCandidates.length; k++) {
                const docFri = friCandidates[k];
                if (docFri.id === docSat1.id || docFri.id === docSat2.id) continue;

                const candidates = [docSat1, docSat2, docFri];
                const permutations = [
                    [0, 1, 2], [0, 2, 1],
                    [1, 0, 2], [1, 2, 0],
                    [2, 0, 1], [2, 1, 0]
                ];

                for (let p of permutations) {
                    const assign = {
                        angio: candidates[p[0]],
                        spec: candidates[p[1]],
                        inj: candidates[p[2]]
                    };

                    const qAngio = assign.angio.satPositions ? assign.angio.satPositions.includes('angio') : true;
                    const qSpec = assign.spec.satPositions ? assign.spec.satPositions.includes('spec') : true;
                    const qInj = assign.inj.satPositions ? assign.inj.satPositions.includes('inj') : true;

                    if (qAngio && qSpec && qInj) {
                        return {
                            angio: assign.angio.id,
                            spec: assign.spec.id,
                            inj: assign.inj.id
                        };
                    }
                }
            }
        }
    }

    return null;
}

// Core Heuristic CSP solver
function solveSchedule() {
    const daysCount = getDaysInMonth();
    const MAX_ATTEMPTS = 300;
    let bestSchedule = null;
    let bestViolationCount = Infinity;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let tempSchedule = {};
        let docStats = {};
        
        state.residents.forEach(doc => {
            docStats[doc.id] = {
                id: doc.id,
                totalShifts: 0,
                maxShifts: doc.maxShifts,
                weekendDuties: 0,
                offDays: new Set(doc.offDays)
            };
        });

        let success = true;

        for (let d = 1; d <= daysCount; d++) {
            const wd = getWeekday(d);
            const req = wd.isWeekend ? state.requirements.weekend : state.requirements.weekday;

            // Prioritize Duty C2, then C1
            let neededShifts = [];
            for (let i = 0; i < req.C2; i++) neededShifts.push('C2');
            for (let i = 0; i < req.C1; i++) neededShifts.push('C1');

            // Default to Off
            state.residents.forEach(doc => {
                tempSchedule[`${doc.id}_${d}`] = 'O';
            });

            for (let sIndex = 0; sIndex < neededShifts.length; sIndex++) {
                const shiftType = neededShifts[sIndex];
                
                let candidates = state.residents.filter(doc => {
                    const stats = docStats[doc.id];
                    
                    // 1. Max shifts limits
                    if (state.rules.maxShifts && stats.totalShifts >= stats.maxShifts) {
                        return false;
                    }

                    // 2. Already working today
                    if (tempSchedule[`${doc.id}_${d}`] !== 'O') {
                        return false;
                    }

                    // 3. Tier eligibility (C1 -> first, C2 -> second)
                    if (shiftType === 'C1' && (!doc.tiers || !doc.tiers.includes('first'))) {
                        return false;
                    }
                    if (shiftType === 'C2' && (!doc.tiers || !doc.tiers.includes('second'))) {
                        return false;
                    }

                    // 4. Weekly off-duty weekdays check
                    if (state.rules.offWeekdays && doc.offWeekdays && doc.offWeekdays.includes(wd.num)) {
                        return false;
                    }

                    // 5. Consecutive duty checks
                    const isDuty = (s) => s === 'C1' || s === 'C2';
                    if (state.rules.consecutiveDuty && d > 1 && isDuty(shiftType)) {
                        if (isDuty(tempSchedule[`${doc.id}_${d - 1}`])) {
                            return false;
                        }
                    }

                    return true;
                });

                if (candidates.length === 0) {
                    success = false;
                    break; 
                }

                candidates.sort((a, b) => {
                    const statsA = docStats[a.id];
                    const statsB = docStats[b.id];

                    let scoreA = 0;
                    let scoreB = 0;

                    scoreA += statsA.totalShifts * 10;
                    scoreB += statsB.totalShifts * 10;

                    // QOD penalty
                    const isDutyTemp = (s) => s === 'C1' || s === 'C2';
                    if (state.rules.avoidQod && d > 2 && isDutyTemp(shiftType)) {
                        if (isDutyTemp(tempSchedule[`${a.id}_${d - 2}`])) scoreA += 150;
                        if (isDutyTemp(tempSchedule[`${b.id}_${d - 2}`])) scoreB += 150;
                    }

                    if (state.rules.offDays) {
                        if (statsA.offDays.has(d)) scoreA += 1000;
                        if (statsB.offDays.has(d)) scoreB += 1000;
                    }

                    const isDuty = (s) => s === 'C1' || s === 'C2';
                    if (wd.isWeekend && isDuty(shiftType) && state.rules.weekendFair) {
                        scoreA += statsA.weekendDuties * 50;
                        scoreB += statsB.weekendDuties * 50;
                    }

                    scoreA += Math.random() * 2;
                    scoreB += Math.random() * 2;

                    return scoreA - scoreB;
                });

                const chosenDoc = candidates[0];
                tempSchedule[`${chosenDoc.id}_${d}`] = shiftType;
                
                docStats[chosenDoc.id].totalShifts++;
                const isDuty = (s) => s === 'C1' || s === 'C2';
                if (wd.isWeekend && isDuty(shiftType)) {
                    docStats[chosenDoc.id].weekendDuties++;
                }
            }

            if (!success) break;
        }

        let currentViolations = countTempScheduleViolations(tempSchedule, docStats, daysCount);
        
        if (success && currentViolations === 0) {
            state.schedule[state.currentMonth] = tempSchedule;
            
            // Calculate and assign Saturday assignments
            state.saturdayAssignments[state.currentMonth] = {};
            for (let dayVal = 1; dayVal <= daysCount; dayVal++) {
                const wd = getWeekday(dayVal);
                if (wd.num === 6) {
                    const assign = findSaturdayAssignment(dayVal, tempSchedule);
                    if (assign) {
                        state.saturdayAssignments[state.currentMonth][dayVal] = assign;
                    }
                }
            }
            return true;
        }

        if (currentViolations < bestViolationCount) {
            bestViolationCount = currentViolations;
            bestSchedule = tempSchedule;
        }
    }

    if (bestSchedule) {
        state.schedule[state.currentMonth] = bestSchedule;
        
        // Calculate and assign Saturday assignments
        state.saturdayAssignments[state.currentMonth] = {};
        for (let dayVal = 1; dayVal <= daysCount; dayVal++) {
            const wd = getWeekday(dayVal);
            if (wd.num === 6) {
                const assign = findSaturdayAssignment(dayVal, bestSchedule);
                if (assign) {
                    state.saturdayAssignments[state.currentMonth][dayVal] = assign;
                }
            }
        }
    }
    return false;
}

// Count rule violations of a temporary schedule
function countTempScheduleViolations(tempSchedule, docStats, daysCount) {
    let violations = 0;

    state.residents.forEach(doc => {
        let shiftCount = 0;
        for (let d = 1; d <= daysCount; d++) {
            const shift = tempSchedule[`${doc.id}_${d}`] || 'O';
            const wd = getWeekday(d);
            
            if (shift !== 'O') shiftCount++;

            const isDuty = (s) => s === 'C1' || s === 'C2';
            if (state.rules.consecutiveDuty && isDuty(shift)) {
                if (d < daysCount) {
                    const nextShift = tempSchedule[`${doc.id}_${d + 1}`] || 'O';
                    if (isDuty(nextShift)) violations++;
                }
                if (d === 1) {
                    const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                    const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                    if (doc.id === prevC1 || doc.id === prevC2) {
                        violations++;
                    }
                }
            }

            // QOD checks
            if (state.rules.avoidQod && isDuty(shift)) {
                if (d < daysCount - 1) {
                    const afterNextShift = tempSchedule[`${doc.id}_${d + 2}`] || 'O';
                    if (isDuty(afterNextShift)) violations++;
                }
                if (d === 2) {
                    const prevShift = tempSchedule[`${doc.id}_1`] || 'O';
                    if (prevShift === 'O') {
                        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                        if (doc.id === prevC1 || doc.id === prevC2) {
                            violations++;
                        }
                    }
                }
            }

            if (state.rules.offDays && doc.offDays.includes(d) && shift !== 'O') {
                violations++;
            }

            // Weekly Off Weekday Violations
            if (state.rules.offWeekdays && doc.offWeekdays && doc.offWeekdays.includes(wd.num) && isDuty(shift)) {
                violations += 10;
            }

            // Tier mismatch check
            if (shift === 'C1' && (!doc.tiers || !doc.tiers.includes('first'))) violations += 50;
            if (shift === 'C2' && (!doc.tiers || !doc.tiers.includes('second'))) violations += 50;
        }

        if (state.rules.maxShifts && shiftCount > doc.maxShifts) {
            violations += (shiftCount - doc.maxShifts);
        }
    });

    for (let d = 1; d <= daysCount; d++) {
        const wd = getWeekday(d);
        const req = wd.isWeekend ? state.requirements.weekend : state.requirements.weekday;

        let counts = { C1: 0, C2: 0 };
        state.residents.forEach(doc => {
            const shift = tempSchedule[`${doc.id}_${d}`] || 'O';
            if (shift in counts) counts[shift]++;
        });

        if (counts.C1 < req.C1) violations += (req.C1 - counts.C1);
        if (counts.C2 < req.C2) violations += (req.C2 - counts.C2);

        // Check Saturday positions availability
        if (wd.num === 6) {
            const assign = findSaturdayAssignment(d, tempSchedule);
            if (!assign) {
                violations += 200;
            }
        }
    }

    return violations;
}

// Export schedule to CSV
function exportToCSV() {
    if (state.residents.length === 0) return;

    const daysCount = getDaysInMonth();
    let csvRows = [];
    
    let headers = ['醫師姓名', '職級', '值班類別', '不值班星期', '值班上限'];
    for (let d = 1; d <= daysCount; d++) {
        headers.push(`${d}日(${getWeekday(d).name})`);
    }
    headers.push('總值班數', '一線值班(C1)', '二線值班(C2)');
    csvRows.push(headers.join(','));

    state.residents.forEach(doc => {
        const weekdaysNames = ['日', '一', '二', '三', '四', '五', '六'];
        const offWeekdaysNameList = doc.offWeekdays.map(w => weekdaysNames[w]).join(';');
        const tiersList = [];
        if (doc.tiers) {
            if (doc.tiers.includes('first')) tiersList.push('一線');
            if (doc.tiers.includes('second')) tiersList.push('二線');
        }
        const tierName = tiersList.join('+') + '人員';
        
        let row = [doc.name, doc.level, tierName, offWeekdaysNameList, doc.maxShifts];
        let c1Count = 0, c2Count = 0;

        for (let d = 1; d <= daysCount; d++) {
            let shift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            const wd = getWeekday(d);
            
            if (wd.num === 6) {
                const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
                let posText = '';
                if (dayAssign.angio === doc.id) posText = '血管攝影';
                else if (dayAssign.spec === doc.id) posText = '特殊攝影';
                else if (dayAssign.inj === doc.id) posText = '注射室';
                
                if (posText) {
                    if (shift === 'O') {
                        shift = `(${posText})`;
                    } else {
                        shift = `${shift}(${posText})`;
                    }
                }
            }

            row.push(shift);
            
            // Calculate shift counts using original values
            const origShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`] || 'O';
            if (origShift === 'C1') c1Count++;
            else if (origShift === 'C2') c2Count++;
        }

        row.push(c1Count + c2Count);
        row.push(c1Count);
        row.push(c2Count);

        csvRows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `住院醫師值班表_${state.currentMonth}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
