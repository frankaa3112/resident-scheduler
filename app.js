// Resident Physician Scheduling System - Core Logic (Duty-Only & Weekly Off-duty Edition)

// State management
let state = {
    currentMonth: '2026-07', // YYYY-MM
    residents: [],
    schedule: {}, // key: "YYYY-MM", value: { "docId_dayNum": "C1"|"C2"|"O" }
    specSchedule: {}, // key: "YYYY-MM", value: { "dayNum_AM": "docId", "dayNum_PM": "docId" }
    saturdayAssignments: {}, // key: "YYYY-MM", value: { "dayNum": { angio: "docId", spec: "docId", inj: "docId" } }
    lastMonthLastDayDuty: {}, // key: "YYYY-MM", value: { C1: "docId", C2: "docId" }
    activeTab: 'duty', // 'duty' | 'spec'
    fullView: false, // track whether calendar is expanded to show all days
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
    { id: '1', name: '翔', level: 'R4 (住院醫師)', tiers: ['second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#3b82f6', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '2', name: '蓁', level: 'R4 (住院醫師)', tiers: ['second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#10b981', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '3', name: '佩', level: 'R4 (住院醫師)', tiers: ['second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#a855f7', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '4', name: '江', level: 'R3 (住院醫師)', tiers: ['first', 'second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#d97706', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '5', name: '評', level: 'R3 (住院醫師)', tiers: ['first', 'second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#ec4899', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '6', name: '佳', level: 'R3 (住院醫師)', tiers: ['first', 'second'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#0891b2', satPositions: ['angio', 'spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '7', name: '珞', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#6366f1', satPositions: ['spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '8', name: '岱', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#0d9488', satPositions: ['spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } },
    { id: '9', name: '佑', level: 'R2 (住院醫師)', tiers: ['first'], offWeekdays: [], maxShifts: 8, offDays: [], color: '#f43f5e', satPositions: ['spec', 'inj'], specOffWeekdays: { AM: [], PM: [] } }
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
                if (!doc.specOffWeekdays) {
                    doc.specOffWeekdays = { AM: [], PM: [] };
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

            // Ensure specSchedule structure migration
            if (!state.activeTab) {
                state.activeTab = 'duty';
            }
            if (!state.specSchedule) {
                state.specSchedule = {};
            }
            if (!state.specSchedule[state.currentMonth]) {
                state.specSchedule[state.currentMonth] = {};
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

            // Ensure zoomLevel is initialized
            if (state.zoomLevel === undefined) {
                state.zoomLevel = 1.0;
            }
            // Ensure fullView is initialized
            if (state.fullView === undefined) {
                state.fullView = localStorage.getItem('calendar_full_view') === 'true';
            }
            // Ensure lockedShifts is initialized
            if (!state.lockedShifts || typeof state.lockedShifts !== 'object') {
                state.lockedShifts = {};
            }
            if (!state.lockedShifts[state.currentMonth]) {
                state.lockedShifts[state.currentMonth] = {};
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
    state.specSchedule = {};
    state.specSchedule[state.currentMonth] = {};
    state.saturdayAssignments = {};
    state.saturdayAssignments[state.currentMonth] = {};
    state.lastMonthLastDayDuty = {};
    state.lastMonthLastDayDuty[state.currentMonth] = { C1: "", C2: "" };
    state.lockedShifts = {};
    state.lockedShifts[state.currentMonth] = {};
    state.activeTab = 'duty';
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
    // Sidebar toggle fold/unfold functionality
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const appContainer = document.querySelector('.app-container');
    if (btnToggleSidebar && appContainer) {
        // Load initial state from LocalStorage
        const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        if (isCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
        }
        
        btnToggleSidebar.addEventListener('click', () => {
            const collapsed = appContainer.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebar_collapsed', collapsed);
        });
    }

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

    // Tabs view switcher
    const tabDuty = document.getElementById('tab-duty-schedule');
    const tabSpec = document.getElementById('tab-spec-schedule');
    if (tabDuty && tabSpec) {
        if (state.activeTab === 'duty') {
            tabDuty.classList.add('active');
            tabSpec.classList.remove('active');
        } else {
            tabDuty.classList.remove('active');
            tabSpec.classList.add('active');
        }

        const switchTab = (tab) => {
            state.activeTab = tab;
            if (tab === 'duty') {
                tabDuty.classList.add('active');
                tabSpec.classList.remove('active');
            } else {
                tabDuty.classList.remove('active');
                tabSpec.classList.add('active');
            }
            saveData();
            renderAll();
        };

        tabDuty.addEventListener('click', () => switchTab('duty'));
        tabSpec.addEventListener('click', () => switchTab('spec'));
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
            
            // Hide prev/next navigation when adding a new doctor
            const nav = document.getElementById('doctor-modal-nav');
            if (nav) nav.style.display = 'none';

            doctorForm.reset();
            
            // Clear checked styling
            document.querySelectorAll('input[name="doc-off-weekday"]').forEach(cb => {
                cb.checked = false;
                cb.closest('.weekday-checkbox-label').classList.remove('is-checked');
            });

            // Clear spec off weekdays checked styling
            document.querySelectorAll('input[name="doc-spec-off-am"]').forEach(cb => {
                cb.checked = false;
            });
            document.querySelectorAll('input[name="doc-spec-off-pm"]').forEach(cb => {
                cb.checked = false;
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



    // Save current doctor form data to state
    const saveCurrentDoctorFromForm = () => {
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

        // Get spec off weekdays
        const specOffAmCheckboxes = document.querySelectorAll('input[name="doc-spec-off-am"]:checked');
        const specOffAm = Array.from(specOffAmCheckboxes).map(cb => Number(cb.value));
        const specOffPmCheckboxes = document.querySelectorAll('input[name="doc-spec-off-pm"]:checked');
        const specOffPm = Array.from(specOffPmCheckboxes).map(cb => Number(cb.value));
        const specOffWeekdays = { AM: specOffAm, PM: specOffPm };

        const maxShifts = Number(document.getElementById('doc-shifts-input').value);
        const offDaysStr = document.getElementById('doc-offdays-input').value;
        
        const offDays = offDaysStr.split(',')
            .map(s => Number(s.trim()))
            .filter(n => !isNaN(n) && n >= 1 && n <= 31);

        if (!name) {
            alert('請輸入姓名！');
            return false;
        }
        if (tiers.length === 0) {
            alert('請至少選擇一種值班類別（一線或二線）！');
            return false;
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
                doc.specOffWeekdays = specOffWeekdays;
            }
        } else {
            // Add new
            const newId = (state.residents.length > 0 ? Math.max(...state.residents.map(r => Number(r.id))) + 1 : 1).toString();
            state.residents.push({ id: newId, name, level, tiers, offWeekdays, satPositions, maxShifts, offDays, color, specOffWeekdays });
        }

        saveData();
        return true;
    };

    // Save resident profile Form submit
    if (doctorForm) {
        doctorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (saveCurrentDoctorFromForm()) {
                hideModal();
                renderAll();
            }
        });
    }

    // Prev / Next doctor modal navigation buttons
    const btnPrevDoctor = document.getElementById('btn-prev-doctor');
    const btnNextDoctor = document.getElementById('btn-next-doctor');

    const navigateDoctorModal = (direction) => {
        const currentId = document.getElementById('doctor-id').value;
        if (!currentId) return; // Cannot navigate in "Add New" mode
        
        // Auto save current doctor modifications before switching
        if (!saveCurrentDoctorFromForm()) return; 

        // Find index of current doctor
        const currentIndex = state.residents.findIndex(r => r.id === currentId);
        if (currentIndex === -1) return;

        let targetIndex;
        if (direction === 'prev') {
            targetIndex = (currentIndex - 1 + state.residents.length) % state.residents.length;
        } else {
            targetIndex = (currentIndex + 1) % state.residents.length;
        }

        // Apply visual updates to the background
        renderAll();
        // Load target doctor details into form fields
        editDoctor(state.residents[targetIndex].id);
    };

    if (btnPrevDoctor) {
        btnPrevDoctor.addEventListener('click', () => navigateDoctorModal('prev'));
    }
    if (btnNextDoctor) {
        btnNextDoctor.addEventListener('click', () => navigateDoctorModal('next'));
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
            if (state.activeTab === 'spec') {
                if (confirm('確定要清除本月的所有特殊攝影排班嗎？')) {
                    state.specSchedule[state.currentMonth] = {};
                    saveData();
                    renderAll();
                }
            } else {
                if (confirm('確定要清除本月的所有排班嗎？')) {
                    state.schedule[state.currentMonth] = {};
                    state.saturdayAssignments[state.currentMonth] = {};
                    saveData();
                    renderAll();
                }
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
    // Export JSON
    const exportJsonBtn = document.getElementById('btn-export-json');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            const dataToExport = {
                month: state.currentMonth,
                residents: state.residents,
                schedule: state.schedule[state.currentMonth] || {},
                specSchedule: state.specSchedule[state.currentMonth] || {},
                saturdayAssignments: state.saturdayAssignments[state.currentMonth] || {},
                lockedShifts: state.lockedShifts[state.currentMonth] || {}
            };
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `排班設定與資料_${state.currentMonth}.json`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    // Import JSON
    const importJsonBtn = document.getElementById('btn-import-json');
    const importJsonFileInput = document.getElementById('import-json-file');
    if (importJsonBtn && importJsonFileInput) {
        importJsonBtn.addEventListener('click', () => {
            importJsonFileInput.click();
        });

        importJsonFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (!importedData.residents || !Array.isArray(importedData.residents)) {
                        alert('無效的 JSON 檔案，必需包含住院醫師名單資料！');
                        return;
                    }

                    // Check month mismatch
                    if (importedData.month !== state.currentMonth) {
                        const confirmMsg = `匯入資料的月份為 「${importedData.month || '未指定'}」，但您目前正在編輯 「${state.currentMonth}」。\n\n是否確定要將此資料匯入並覆蓋 「${state.currentMonth}」 的排班、人員條件與鎖定設定？`;
                        if (!confirm(confirmMsg)) {
                            importJsonFileInput.value = ''; // clear input
                            return;
                        }
                    }

                    // Apply imported data
                    state.residents = importedData.residents;
                    state.schedule[state.currentMonth] = importedData.schedule || {};
                    state.specSchedule[state.currentMonth] = importedData.specSchedule || {};
                    state.saturdayAssignments[state.currentMonth] = importedData.saturdayAssignments || {};
                    state.lockedShifts[state.currentMonth] = importedData.lockedShifts || {};

                    saveData();
                    renderAll();
                    alert('當月排班資料與人員設定匯入成功！');
                } catch (error) {
                    console.error('Import JSON Error:', error);
                    alert('匯入失敗：檔案格式錯誤或不完整。');
                }
                importJsonFileInput.value = ''; // clear input
            };
            reader.readAsText(file);
        });
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

    // Toggle calendar full view button listener
    const toggleFullViewBtn = document.getElementById('btn-toggle-full-view');
    if (toggleFullViewBtn) {
        toggleFullViewBtn.addEventListener('click', () => {
            state.fullView = !state.fullView;
            localStorage.setItem('calendar_full_view', state.fullView);
            saveData();
            updateFullViewUI();
        });
        
        // Apply initial visual state based on storage/state
        updateFullViewUI();
    }

    // Modal lock buttons toggle listener
    const lockButtons = document.querySelectorAll('#daily-editor-modal .btn-lock');
    lockButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentlyLocked = btn.dataset.locked === 'true';
            btn.dataset.locked = currentlyLocked ? 'false' : 'true';
            updateModalLockVisual(btn);
        });
    });
}

// Edit doctor info
function editDoctor(id) {
    const doc = state.residents.find(r => r.id === id);
    if (!doc) return;

    // Show navigation in Edit mode
    const nav = document.getElementById('doctor-modal-nav');
    if (nav) {
        nav.style.display = (state.residents.length > 1) ? 'flex' : 'none';
    }

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

    // Populate specOffWeekdays checkboxes
    const allSpecAmCheckboxes = document.querySelectorAll('input[name="doc-spec-off-am"]');
    allSpecAmCheckboxes.forEach(cb => {
        cb.checked = false;
    });
    const allSpecPmCheckboxes = document.querySelectorAll('input[name="doc-spec-off-pm"]');
    allSpecPmCheckboxes.forEach(cb => {
        cb.checked = false;
    });

    if (doc.specOffWeekdays) {
        (doc.specOffWeekdays.AM || []).forEach(w => {
            const cb = document.querySelector(`input[name="doc-spec-off-am"][value="${w}"]`);
            if (cb) {
                cb.checked = true;
            }
        });
        (doc.specOffWeekdays.PM || []).forEach(w => {
            const cb = document.querySelector(`input[name="doc-spec-off-pm"][value="${w}"]`);
            if (cb) {
                cb.checked = true;
            }
        });
    }

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

        // Remove specSchedule shifts for this doctor across all months
        Object.keys(state.specSchedule).forEach(month => {
            if (state.specSchedule[month] && typeof state.specSchedule[month] === 'object') {
                Object.keys(state.specSchedule[month]).forEach(key => {
                    if (state.specSchedule[month][key] === id) {
                        state.specSchedule[month][key] = '';
                    }
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

        // Special photography off weekdays
        let specOffText = '';
        if (doc.specOffWeekdays) {
            const weekdaysNames = ['日', '一', '二', '三', '四', '五', '六'];
            const amOff = doc.specOffWeekdays.AM || [];
            const pmOff = doc.specOffWeekdays.PM || [];
            const parts = [];
            if (amOff.length > 0) parts.push(`AM 不值: 週${amOff.map(w => weekdaysNames[w]).join('、')}`);
            if (pmOff.length > 0) parts.push(`PM 不值: 週${pmOff.map(w => weekdaysNames[w]).join('、')}`);
            if (parts.length > 0) {
                specOffText = `<div style="font-size:0.7rem; color:#fca5a5; margin-top:2px; font-weight:500;">特攝避開: ${parts.join(' | ')}</div>`;
            }
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
                ${specOffText}
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

    const goldLockIcon = `<svg style="width:10px; height:10px; fill:#eab308; margin-left:3px; display:inline-block; vertical-align:middle;" viewBox="0 0 24 24" title="手動鎖定，自動排班不會變動"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`;

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

    // Render leading empty days (replace last one with prev-month last-day card if in duty tab)
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
            if (i === firstDayIndex - 1 && state.activeTab === 'duty') {
                html += prevMonthCard;
            } else {
                html += `<div class="calendar-day-card empty-day"></div>`;
            }
        }
        // If month starts on Monday (firstDayIndex===0), prepend the card before the grid
        if (firstDayIndex === 0 && state.activeTab === 'duty') {
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
        
        let shiftListHtml = '';
        if (state.activeTab === 'duty') {
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
                    const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_C1`];
                    c1Html += `
                        <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                            <span class="slot-label shift-c1" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">C1</span>
                            <span class="slot-staff" title="${doc.name} (${doc.level.split(' ')[0]})" style="color: ${color.text}; font-weight: 600;">${doc.name}${isLocked ? goldLockIcon : ''}</span>
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
                    const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_C2`];
                    c2Html += `
                        <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                            <span class="slot-label shift-c2" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">C2</span>
                            <span class="slot-staff" title="${doc.name} (${doc.level.split(' ')[0]})" style="color: ${color.text}; font-weight: 600;">${doc.name}${isLocked ? goldLockIcon : ''}</span>
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
                const posLabels = { angio: '血', spec: '特', inj: '注' }; // 簡化為單個字
                const posFullLabels = { angio: '血管攝影', spec: '特殊攝影', inj: '注射室' };
                
                let tagsHtml = '';
                ['angio', 'spec', 'inj'].forEach(pos => {
                    const assignedDocId = dayAssign[pos];
                    const doc = state.residents.find(r => r.id === assignedDocId);
                    const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_${pos}`];
                    if (doc) {
                        tagsHtml += `
                            <div class="sat-position-tag ${pos}" title="${posFullLabels[pos]}: ${doc.name}${isLocked ? ' (已鎖定)' : ''}" style="flex: 1; justify-content: center; padding: 2px; font-size: 0.7rem; margin-top: 0; min-width: 0; display: flex; align-items: center;">
                                <span class="sat-position-label" style="padding: 1px 3px; font-size: 0.62rem; margin-right: 3px; border-radius: 2px; line-height: 1;">${posLabels[pos]}</span>
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${doc.name}${isLocked ? goldLockIcon : ''}</span>
                            </div>
                        `;
                    } else {
                        tagsHtml += `
                            <div class="sat-position-tag unassigned" title="${posFullLabels[pos]}: 缺人" style="flex: 1; justify-content: center; padding: 2px; font-size: 0.7rem; margin-top: 0; min-width: 0; display: flex; align-items: center;">
                                <span class="sat-position-label" style="padding: 1px 3px; font-size: 0.62rem; margin-right: 3px; border-radius: 2px; line-height: 1;">${posLabels[pos]}</span>
                                <span style="font-style: italic; color: #fca5a5; font-weight: 500;">缺</span>
                            </div>
                        `;
                    }
                });
                
                satPositionsHtml = `
                    <div class="sat-positions-row" style="display: flex; gap: 4px; width: 100%; margin-top: 4px;">
                        ${tagsHtml}
                    </div>
                `;
            }
            shiftListHtml = c1Html + c2Html + satPositionsHtml;
        } else {
            // Special Photography (activeTab === 'spec')
            let amHtml = '';
            let pmHtml = '';
            const isSunday = wd.num === 0;
            const isSaturday = wd.num === 6;

            if (isSunday) {
                amHtml = `<div class="day-shift-slot" style="opacity:0.4; border-color:transparent;"><span class="slot-label">AM</span><span class="slot-staff">-</span></div>`;
                pmHtml = `<div class="day-shift-slot" style="opacity:0.4; border-color:transparent;"><span class="slot-label">PM</span><span class="slot-staff">-</span></div>`;
            } else if (isSaturday) {
                // Saturday AM: Inherited Saturday Spec doctor
                const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
                const satSpecId = dayAssign.spec;
                const doc = state.residents.find(r => r.id === satSpecId);
                const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_spec`];
                if (doc) {
                    const color = getDoctorColorStyles(doc.id);
                    amHtml = `
                        <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                            <span class="slot-label shift-am" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">AM</span>
                            <span class="slot-staff" title="${doc.name} (週六特攝)${isLocked ? ' (已鎖定)' : ''}" style="color: ${color.text}; font-weight: 600;">${doc.name}${isLocked ? goldLockIcon : ''}</span>
                        </div>
                    `;
                } else {
                    amHtml = `
                        <div class="day-shift-slot slot-understaffed">
                            <span class="slot-label">AM</span>
                            <span class="slot-staff">未指派 (週六特攝)</span>
                        </div>
                    `;
                }
                pmHtml = `<div class="day-shift-slot" style="opacity:0.4; border-color:transparent;"><span class="slot-label">PM</span><span class="slot-staff">無 PM</span></div>`;
            } else {
                // Monday to Friday
                const amDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_AM`];
                const pmDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_PM`];

                const amDoc = state.residents.find(r => r.id === amDocId);
                const pmDoc = state.residents.find(r => r.id === pmDocId);

                if (amDoc) {
                    const color = getDoctorColorStyles(amDoc.id);
                    const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_AM`];
                    amHtml = `
                        <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                            <span class="slot-label shift-am" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">AM</span>
                            <span class="slot-staff" title="${amDoc.name}" style="color: ${color.text}; font-weight: 600;">${amDoc.name}${isLocked ? goldLockIcon : ''}</span>
                        </div>
                    `;
                } else {
                    amHtml = `
                        <div class="day-shift-slot slot-understaffed">
                            <span class="slot-label">AM</span>
                            <span class="slot-staff">缺人</span>
                        </div>
                    `;
                }

                if (pmDoc) {
                    const color = getDoctorColorStyles(pmDoc.id);
                    const isLocked = (state.lockedShifts[state.currentMonth] || {})[`${d}_PM`];
                    pmHtml = `
                        <div class="day-shift-slot" style="background-color: ${color.bg}; border: none; color: ${color.text};">
                            <span class="slot-label shift-pm" style="background: rgba(255, 255, 255, 0.25); color: ${color.text};">PM</span>
                            <span class="slot-staff" title="${pmDoc.name}" style="color: ${color.text}; font-weight: 600;">${pmDoc.name}${isLocked ? goldLockIcon : ''}</span>
                        </div>
                    `;
                } else {
                    pmHtml = `
                        <div class="day-shift-slot slot-understaffed">
                            <span class="slot-label">PM</span>
                            <span class="slot-staff">缺人</span>
                        </div>
                    `;
                }
            }
            shiftListHtml = amHtml + pmHtml;
        }

        html += `
            <div class="calendar-day-card ${wd.isWeekend ? 'is-weekend' : ''} ${hasViolation ? 'has-violation' : ''}" 
                 onclick="openDailyEditor(${d})">
                <div class="day-card-header">
                    <span class="day-card-num">${d}</span>
                    <span class="day-card-weekday">${wd.name}</span>
                </div>
                <div class="day-shift-list">
                    ${shiftListHtml}
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
    const wd = isLastMonth ? null : getWeekday(Number(day));

    // If Special Photography view and it's Sunday, we do not edit
    if (state.activeTab === 'spec' && !isLastMonth && wd.num === 0) {
        alert('週日無特殊攝影排班！');
        return;
    }

    if (isLastMonth) {
        document.getElementById('daily-editor-title').innerText = '上月最後一日 值班設定';
    } else {
        if (state.activeTab === 'spec') {
            document.getElementById('daily-editor-title').innerText = `${state.currentMonth}-${day.toString().padStart(2, '0')} (${wd.name}) 特殊攝影人員編輯`;
        } else {
            document.getElementById('daily-editor-title').innerText = `${state.currentMonth}-${day.toString().padStart(2, '0')} (${wd.name}) 排班編輯`;
        }
    }
    document.getElementById('daily-editor-day').value = day;

    const c1Section = document.getElementById('daily-editor-c1-section');
    const c2Section = document.getElementById('daily-editor-c2-section');
    const satSection = document.getElementById('daily-editor-sat-section');
    const specSection = document.getElementById('daily-editor-spec-section');

    const c1Container = document.getElementById('daily-editor-c1-checkboxes');
    const c2Container = document.getElementById('daily-editor-c2-checkboxes');

    c1Container.innerHTML = '';
    c2Container.innerHTML = '';

    // Show/hide sections based on activeTab
    if (state.activeTab === 'duty') {
        if (c1Section) c1Section.style.display = 'block';
        if (c2Section) c2Section.style.display = 'block';
        if (specSection) specSection.style.display = 'none';

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

            if (satSection) satSection.style.display = 'none';

            const modal = document.getElementById('daily-editor-modal');
            modal.classList.add('active');
            return;
        }

        // Define checkbox factory
        const createCheckbox = (doc, shiftCode, violations) => {
            const docCurrentShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${day}`] || 'O';
            const isChecked = docCurrentShift === shiftCode;
            const hasViolations = violations && violations.length > 0;
            const wrapper = document.createElement('label');
            wrapper.className = `doctor-checkbox-label ${isChecked ? 'is-checked' : ''} ${hasViolations ? 'has-violations' : ''}`;
            if (hasViolations) {
                wrapper.title = "⚠️ 違反規則：\n" + violations.map(v => "• " + v).join("\n");
            }
            
            wrapper.innerHTML = `
                <input type="checkbox" data-doc-id="${doc.id}" data-shift="${shiftCode}" ${isChecked ? 'checked' : ''}>
                <span>${doc.name}${hasViolations ? ' ⚠️' : ''} <span style="font-size:0.7rem; color:var(--text-muted);">${doc.level.split(' ')[0]}</span></span>
            `;
            
            const checkbox = wrapper.querySelector('input');
            checkbox.addEventListener('change', handleDailyCheckboxChange);
            return wrapper;
        };

        // Render sorted C1 Checkboxes (doctors with 0 violations are listed first)
        const firstLineDocs = state.residents
            .filter(doc => doc.tiers && doc.tiers.includes('first'))
            .map(doc => ({
                doc,
                violations: checkAssignmentViolation(doc.id, Number(day), 'C1')
            }))
            .sort((a, b) => a.violations.length - b.violations.length);

        firstLineDocs.forEach(item => {
            c1Container.appendChild(createCheckbox(item.doc, 'C1', item.violations));
        });

        // Render sorted C2 Checkboxes (doctors with 0 violations are listed first)
        const secondLineDocs = state.residents
            .filter(doc => doc.tiers && doc.tiers.includes('second'))
            .map(doc => ({
                doc,
                violations: checkAssignmentViolation(doc.id, Number(day), 'C2')
            }))
            .sort((a, b) => a.violations.length - b.violations.length);

        secondLineDocs.forEach(item => {
            c2Container.appendChild(createCheckbox(item.doc, 'C2', item.violations));
        });

        // Saturday Positions block
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
                } else {
                    const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                    const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                    if (prevC1) {
                        const doc = state.residents.find(r => r.id === prevC1);
                        if (doc) friDocs.push({ doc, status: '週五C1' });
                    }
                    if (prevC2) {
                        const doc = state.residents.find(r => r.id === prevC2);
                        if (doc) friDocs.push({ doc, status: '週五C2' });
                    }
                }

                const getOptionsHtml = (posCode) => {
                    let optHtml = '<option value="">-- 未指派 --</option>';
                    const dutyDocs = [...satDocs, ...friDocs];
                    const addedDocs = new Set();

                    // Pre-calculate violations and sort recommended duty docs (0 violations first)
                    const sortedDutyDocs = dutyDocs
                        .map(item => ({
                            ...item,
                            violations: checkAssignmentViolation(item.doc.id, Number(day), posCode)
                        }))
                        .sort((a, b) => a.violations.length - b.violations.length);

                    sortedDutyDocs.forEach(item => {
                        const doc = item.doc;
                        if (addedDocs.has(doc.id)) return;
                        addedDocs.add(doc.id);

                        const hasQual = doc.satPositions ? doc.satPositions.includes(posCode) : true;
                        const qualText = hasQual ? '' : ' (無此位置資格)';
                        
                        const warningText = item.violations.length > 0 ? ` (⚠️ ${item.violations[0]})` : '';
                        const colorStyle = item.violations.length > 0 ? 'style="color: #fbbf24;"' : '';
                        const tooltip = item.violations.length > 0 ? `title="違反規則：&#10;${item.violations.map(v => '• ' + v).join('&#10;')}"` : '';

                        optHtml += `<option value="${doc.id}" ${colorStyle} ${tooltip}>★ ${doc.name} (${item.status})${qualText}${warningText}</option>`;
                    });
                    
                    optHtml += '<option disabled>──────────</option>';
                    
                    // Filter, calculate violations and sort the remaining doctors (0 violations first)
                    const sortedOtherDocs = state.residents
                        .filter(doc => !addedDocs.has(doc.id))
                        .map(doc => ({
                            doc,
                            violations: checkAssignmentViolation(doc.id, Number(day), posCode)
                        }))
                        .sort((a, b) => a.violations.length - b.violations.length);

                    sortedOtherDocs.forEach(item => {
                        const doc = item.doc;
                        addedDocs.add(doc.id);

                        const hasQual = doc.satPositions ? doc.satPositions.includes(posCode) : true;
                        const qualText = hasQual ? '' : ' (無此位置資格)';
                        
                        const warningText = item.violations.length > 0 ? ` (⚠️ ${item.violations[0]})` : '';
                        const colorStyle = item.violations.length > 0 ? 'style="color: #fbbf24;"' : '';
                        const tooltip = item.violations.length > 0 ? `title="違反規則：&#10;${item.violations.map(v => '• ' + v).join('&#10;')}"` : '';

                        optHtml += `<option value="${doc.id}" ${colorStyle} ${tooltip}>${doc.name}${qualText}${warningText}</option>`;
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
    } else {
        // activeTab === 'spec'
        if (c1Section) c1Section.style.display = 'none';
        if (c2Section) c2Section.style.display = 'none';
        if (satSection) satSection.style.display = 'none';
        if (specSection) specSection.style.display = 'block';

        const selectAm = document.getElementById('spec-select-am');
        const selectPm = document.getElementById('spec-select-pm');
        const pmSection = document.getElementById('daily-editor-spec-pm-section');
        const satNote = document.getElementById('daily-editor-spec-saturday-note');

        // Filter doctors with spec qualification
        const specQualifiedDocs = state.residents.filter(r => r.satPositions && r.satPositions.includes('spec'));

        const getSpecOptionsHtml = (posCode) => {
            let optHtml = '<option value="">-- 未指派 --</option>';
            
            // Map violations and sort spec qualified doctors (0 violations first)
            const sortedSpecDocs = specQualifiedDocs
                .map(doc => ({
                    doc,
                    violations: checkAssignmentViolation(doc.id, Number(day), posCode)
                }))
                .sort((a, b) => a.violations.length - b.violations.length);

            sortedSpecDocs.forEach(item => {
                const doc = item.doc;
                const warningText = item.violations.length > 0 ? ` (⚠️ ${item.violations[0]})` : '';
                const colorStyle = item.violations.length > 0 ? 'style="color: #fbbf24;"' : '';
                const tooltip = item.violations.length > 0 ? `title="違反規則：&#10;${item.violations.map(v => '• ' + v).join('&#10;')}"` : '';
                optHtml += `<option value="${doc.id}" ${colorStyle} ${tooltip}>${doc.name} (${doc.level.split(' ')[0]})${warningText}</option>`;
            });
            return optHtml;
        };

        if (wd.num === 6) {
            // Saturday: AM is inherited and read-only, PM is hidden
            if (satNote) satNote.style.display = 'block';
            if (pmSection) pmSection.style.display = 'none';
            if (selectAm) {
                selectAm.disabled = true;
                // Saturday AM inherits from saturdayAssignments spec
                const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[day] || {};
                const satSpecId = dayAssign.spec || '';
                
                // Populate options including the Saturday spec doctor (even if unqualified)
                let amOpts = '<option value="">-- 未指派 --</option>';
                state.residents.forEach(doc => {
                    amOpts += `<option value="${doc.id}">${doc.name} (${doc.level.split(' ')[0]})</option>`;
                });
                selectAm.innerHTML = amOpts;
                selectAm.value = satSpecId;
            }
        } else {
            // Monday to Friday: AM and PM editable
            if (satNote) satNote.style.display = 'none';
            if (pmSection) pmSection.style.display = 'block';
            if (selectAm) {
                selectAm.disabled = false;
                selectAm.innerHTML = getSpecOptionsHtml('AM');
                const currentAm = (state.specSchedule[state.currentMonth] || {})[`${day}_AM`] || '';
                selectAm.value = currentAm;
            }
            if (selectPm) {
                selectPm.disabled = false;
                selectPm.innerHTML = getSpecOptionsHtml('PM');
                const currentPm = (state.specSchedule[state.currentMonth] || {})[`${day}_PM`] || '';
                selectPm.value = currentPm;
            }
        }
    }

    initModalLocks(day);

    const modal = document.getElementById('daily-editor-modal');
    if (state.activeTab === 'duty' && !isLastMonth && wd && wd.num === 6) {
        modal.classList.add('is-sat-layout');
    } else {
        modal.classList.remove('is-sat-layout');
    }
    modal.classList.add('active');
}

// Handle mutually exclusive checkboxes in real-time
function handleDailyCheckboxChange(e) {
    const checkbox = e.target;
    const docId = checkbox.dataset.docId;
    const shift = checkbox.dataset.shift;

    if (checkbox.checked) {
        // 1. Mutually exclusive across doctors within the same shift (C1 or C2)
        const sameShiftCheckboxes = document.querySelectorAll(`#daily-editor-modal input[data-shift="${shift}"]`);
        sameShiftCheckboxes.forEach(cb => {
            if (cb !== checkbox) {
                cb.checked = false;
                cb.closest('.doctor-checkbox-label').classList.remove('is-checked');
            }
        });

        // 2. Mutually exclusive for the same doctor across different shifts
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

    if (state.activeTab === 'spec') {
        const wd = getWeekday(Number(day));
        if (!state.specSchedule[state.currentMonth]) {
            state.specSchedule[state.currentMonth] = {};
        }

        if (wd.num === 6) {
            // Saturday: PM is empty, AM is inherited (no need to save in specSchedule)
            delete state.specSchedule[state.currentMonth][`${day}_AM`];
            delete state.specSchedule[state.currentMonth][`${day}_PM`];
        } else if (wd.num === 0) {
            // Sunday: empty
            delete state.specSchedule[state.currentMonth][`${day}_AM`];
            delete state.specSchedule[state.currentMonth][`${day}_PM`];
        } else {
            // Monday to Friday
            const selectAm = document.getElementById('spec-select-am');
            const selectPm = document.getElementById('spec-select-pm');
            state.specSchedule[state.currentMonth][`${day}_AM`] = selectAm ? selectAm.value : '';
            state.specSchedule[state.currentMonth][`${day}_PM`] = selectPm ? selectPm.value : '';
        }
    } else {
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
    }

    // Save lock states
    if (!state.lockedShifts[state.currentMonth]) {
        state.lockedShifts[state.currentMonth] = {};
    }
    const lockButtons = document.querySelectorAll('#daily-editor-modal .btn-lock');
    lockButtons.forEach(btn => {
        const key = btn.dataset.lockKey;
        if (key && btn.style.display !== 'none') {
            const isLocked = btn.dataset.locked === 'true';
            if (isLocked) {
                state.lockedShifts[state.currentMonth][key] = true;
            } else {
                delete state.lockedShifts[state.currentMonth][key];
            }
        }
    });

    saveData();
    modal.classList.remove('active');
    renderAll();
}

// Validate Schedule Constraints
function validateSchedule() {
    state.warnings = [];
    const daysCount = getDaysInMonth();

    if (state.residents.length === 0) return;

    if (state.activeTab === 'spec') {
        // Special Photography Validator
        for (let d = 1; d <= daysCount; d++) {
            const wd = getWeekday(d);
            if (wd.num === 0) continue; // Sunday: no special photography

            const isSaturday = wd.num === 6;

            if (isSaturday) {
                // Saturday AM: Inherited Saturday Spec doctor
                const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
                const satSpecId = dayAssign.spec;
                
                if (!satSpecId) {
                    state.warnings.push({
                        docId: 'sys',
                        docName: '系統',
                        day: d,
                        type: 'coverage',
                        message: `${d} 號週六 [上午特殊攝影] 未指派醫師 (沿用值班表週六特攝負責人)`
                    });
                } else {
                    const doc = state.residents.find(r => r.id === satSpecId);
                    if (doc) {
                        // Check eligibility
                        if (doc.satPositions && !doc.satPositions.includes('spec')) {
                            state.warnings.push({
                                docId: doc.id,
                                docName: doc.name,
                                day: d,
                                type: 'satPosEligibility',
                                message: `${doc.name} 被指派為週六特攝人員 (沿用)，但其未具備特殊攝影資格`
                            });
                        }
                        // Check vacation
                        if (doc.offDays && doc.offDays.includes(d)) {
                            state.warnings.push({
                                docId: doc.id,
                                docName: doc.name,
                                day: d,
                                type: 'offDays',
                                message: `${doc.name} 於預約休假日 (${d} 號) 被排了特殊攝影 (沿用)`
                            });
                        }
                        // Check weekly off AM
                        if (doc.specOffWeekdays && doc.specOffWeekdays.AM && doc.specOffWeekdays.AM.includes(6)) {
                            state.warnings.push({
                                docId: doc.id,
                                docName: doc.name,
                                day: d,
                                type: 'specOffWeekdays',
                                message: `${doc.name} 設定週六 AM 不值特攝，但被排了 AM 特攝 (沿用)`
                            });
                        }
                    }
                }
            } else {
                // Monday to Friday
                const amDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_AM`];
                const pmDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_PM`];

                const amDoc = state.residents.find(r => r.id === amDocId);
                const pmDoc = state.residents.find(r => r.id === pmDocId);

                // 1. Coverage check
                if (!amDocId) {
                    state.warnings.push({
                        docId: 'sys',
                        docName: '系統',
                        day: d,
                        type: 'coverage',
                        message: `${d} 號 [上午特殊攝影] 未指派醫師`
                    });
                }
                if (!pmDocId) {
                    state.warnings.push({
                        docId: 'sys',
                        docName: '系統',
                        day: d,
                        type: 'coverage',
                        message: `${d} 號 [下午特殊攝影] 未指派醫師`
                    });
                }

                // 2. Same-day double assignment
                if (amDocId && pmDocId && amDocId === pmDocId) {
                    state.warnings.push({
                        docId: amDoc.id,
                        docName: amDoc.name,
                        day: d,
                        type: 'doubleAssignment',
                        message: `${amDoc.name} 於 ${d} 號同時被排了 AM 與 PM 特殊攝影`
                    });
                }

                // 3. Validation for AM doctor
                if (amDoc) {
                    // Qualification check
                    if (amDoc.satPositions && !amDoc.satPositions.includes('spec')) {
                        state.warnings.push({
                            docId: amDoc.id,
                            docName: amDoc.name,
                            day: d,
                            type: 'specEligibility',
                            message: `${amDoc.name} 於 ${d} 號被排了 AM 特殊攝影，但其無特殊攝影資格`
                        });
                    }
                    // Vacation check
                    if (amDoc.offDays && amDoc.offDays.includes(d)) {
                        state.warnings.push({
                            docId: amDoc.id,
                            docName: amDoc.name,
                            day: d,
                            type: 'offDays',
                            message: `${amDoc.name} 於預約休假日 (${d} 號) 被排了 AM 特殊攝影`
                        });
                    }
                    // Weekday off AM check
                    if (amDoc.specOffWeekdays && amDoc.specOffWeekdays.AM && amDoc.specOffWeekdays.AM.includes(wd.num)) {
                        state.warnings.push({
                            docId: amDoc.id,
                            docName: amDoc.name,
                            day: d,
                            type: 'specOffWeekdays',
                            message: `${amDoc.name} 設定週${wd.name} AM 不值特攝，但被排了 AM 特攝`
                        });
                    }
                }

                // 4. Validation for PM doctor
                if (pmDoc) {
                    // Qualification check
                    if (pmDoc.satPositions && !pmDoc.satPositions.includes('spec')) {
                        state.warnings.push({
                            docId: pmDoc.id,
                            docName: pmDoc.name,
                            day: d,
                            type: 'specEligibility',
                            message: `${pmDoc.name} 於 ${d} 號被排了 PM 特殊攝影，但其無特殊攝影資格`
                        });
                    }
                    // Vacation check
                    if (pmDoc.offDays && pmDoc.offDays.includes(d)) {
                        state.warnings.push({
                            docId: pmDoc.id,
                            docName: pmDoc.name,
                            day: d,
                            type: 'offDays',
                            message: `${pmDoc.name} 於預約休假日 (${d} 號) 被排了 PM 特殊攝影`
                        });
                    }
                    // Weekday off PM check
                    if (pmDoc.specOffWeekdays && pmDoc.specOffWeekdays.PM && pmDoc.specOffWeekdays.PM.includes(wd.num)) {
                        state.warnings.push({
                            docId: pmDoc.id,
                            docName: pmDoc.name,
                            day: d,
                            type: 'specOffWeekdays',
                            message: `${pmDoc.name} 設定週${wd.name} PM 不值特攝，但被排了 PM 特攝`
                        });
                    }

                    // 5. PM restriction: previous day duty check
                    const isDuty = (s) => s === 'C1' || s === 'C2';
                    if (d === 1) {
                        // Cross-month check
                        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                        if (pmDoc.id === prevC1 || pmDoc.id === prevC2) {
                            state.warnings.push({
                                docId: pmDoc.id,
                                docName: pmDoc.name,
                                day: 1,
                                type: 'prevDayDutyPM',
                                message: `${pmDoc.name} 上月最後一天值班，不可排在 1 號 PM 特殊攝影`
                            });
                        }
                    } else {
                        // Regular day checks: check if pmDoc had duty on day d-1
                        const prevShift = (state.schedule[state.currentMonth] || {})[`${pmDoc.id}_${d - 1}`] || 'O';
                        if (isDuty(prevShift)) {
                            state.warnings.push({
                                docId: pmDoc.id,
                                docName: pmDoc.name,
                                day: d,
                                type: 'prevDayDutyPM',
                                message: `${pmDoc.name} 前一日 (${d - 1} 號) 值班，不可排在隔日 (${d} 號) PM 特殊攝影`
                            });
                        }
                    }
                }
            }
        }
    } else {
        // Original Resident Duty Scheduler Validation
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
    const header = document.querySelector('.stats-card table thead');
    const titleLabel = document.querySelector('.stats-card .panel-title span');
    const body = document.getElementById('stats-table-body');
    if (!body) return;

    body.innerHTML = '';
    const daysCount = getDaysInMonth();

    if (state.residents.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">無資料</td></tr>`;
        return;
    }

    if (state.activeTab === 'spec') {
        // Special Photography statistics
        if (titleLabel) titleLabel.innerText = '特殊攝影排班統計 (班數分佈)';
        if (header) {
            header.innerHTML = `
                <tr>
                    <th>醫師姓名</th>
                    <th>特攝總班數</th>
                    <th>上午班 (AM)</th>
                    <th>下午班 (PM)</th>
                    <th>週六特攝數</th>
                </tr>
            `;
        }

        state.residents.forEach(doc => {
            let amCount = 0;
            let pmCount = 0;
            let satCount = 0;

            for (let d = 1; d <= daysCount; d++) {
                const wd = getWeekday(d);
                if (wd.num === 0) continue; // Sunday

                if (wd.num === 6) {
                    // Saturday AM is inherited
                    const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
                    if (dayAssign.spec === doc.id) {
                        amCount++;
                        satCount++;
                    }
                } else {
                    // Monday to Friday
                    const amDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_AM`];
                    const pmDocId = (state.specSchedule[state.currentMonth] || {})[`${d}_PM`];
                    if (amDocId === doc.id) amCount++;
                    if (pmDocId === doc.id) pmCount++;
                }
            }

            const totalShifts = amCount + pmCount;
            const limitRatio = Math.min((totalShifts / 10) * 100, 100);
            let progressColor = 'var(--accent-cyan)';
            if (totalShifts > 10) progressColor = 'var(--color-danger)';
            else if (totalShifts === 10) progressColor = 'var(--color-warning)';

            const color = getDoctorColorStyles(doc.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${color.bg}; margin-right:6px; vertical-align:middle;"></span>
                    <strong>${doc.name}</strong> 
                    <br>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${doc.level}</span>
                </td>
                <td>
                    <div class="stats-bar-container">
                        <div class="stats-bar" style="width: ${limitRatio}%; background-color: ${progressColor};"></div>
                    </div>
                    <span>${totalShifts} 班</span>
                </td>
                <td><span class="shift-badge shift-am" style="width:20px; height:20px; font-size:0.7rem; margin-right:4px;">AM</span> ${amCount}</td>
                <td><span class="shift-badge shift-pm" style="width:20px; height:20px; font-size:0.7rem; margin-right:4px;">PM</span> ${pmCount}</td>
                <td><span>${satCount}</span></td>
            `;
            body.appendChild(tr);
        });
    } else {
        // Original Resident Duty statistics
        if (titleLabel) titleLabel.innerText = '排班統計 (班數上限與分佈)';
        if (header) {
            header.innerHTML = `
                <tr>
                    <th>醫師姓名</th>
                    <th>總值班數 / 上限</th>
                    <th>一線值班 (C1)</th>
                    <th>二線值班 (C2)</th>
                    <th>週末值班數</th>
                </tr>
            `;
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
        const success = (state.activeTab === 'spec') ? solveSpecSchedule() : solveSchedule();
        loader.classList.remove('active');
        
        if (success) {
            saveData();
            renderAll();
        } else {
            if (state.activeTab === 'spec') {
                alert('排班演算法無法在限制內找到完美的特殊攝影排班。已產生衝突最少的草稿，請點擊格子手動調整。');
            } else {
                alert('排班演算法無法在限制內找到完美值班排班。已產生衝突最少的草稿，請點擊格子手動調整衝突處。');
            }
            saveData();
            renderAll();
        }
    }, 600);
}

// Special Photography heuristic CSP solver
function solveSpecSchedule() {
    const daysCount = getDaysInMonth();
    const MAX_ATTEMPTS = 300;
    let bestSchedule = null;
    let bestViolationCount = Infinity;

    // Filter doctors with spec qualification
    const specQualifiedDocs = state.residents.filter(r => r.satPositions && r.satPositions.includes('spec'));
    if (specQualifiedDocs.length === 0) {
        return false;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let tempSpecSchedule = {};
        let docWorkloads = {};
        
        specQualifiedDocs.forEach(doc => {
            docWorkloads[doc.id] = 0;
        });

        let success = true;

        for (let d = 1; d <= daysCount; d++) {
            const wd = getWeekday(d);
            if (wd.num === 0) continue; // Sunday

            if (wd.num === 6) {
                // Saturday AM: Inherited Saturday Spec doctor
                const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
                const satSpecId = dayAssign.spec;
                if (satSpecId && docWorkloads[satSpecId] !== undefined) {
                    docWorkloads[satSpecId]++;
                }
                continue;
            }

            // Monday to Friday: AM and PM
            // 1. Assign AM
            const lockedAmId = (state.lockedShifts[state.currentMonth] || {})[`${d}_AM`] 
                ? (state.specSchedule[state.currentMonth] || {})[`${d}_AM`] 
                : null;
            let amDoc = null;

            if (lockedAmId) {
                tempSpecSchedule[`${d}_AM`] = lockedAmId;
                if (docWorkloads[lockedAmId] !== undefined) docWorkloads[lockedAmId]++;
                amDoc = state.residents.find(r => r.id === lockedAmId);
            } else {
                let amCandidates = specQualifiedDocs.filter(doc => {
                    // Vacation check
                    if (doc.offDays && doc.offDays.includes(d)) return false;
                    // Weekday off AM check
                    if (doc.specOffWeekdays && doc.specOffWeekdays.AM && doc.specOffWeekdays.AM.includes(wd.num)) return false;
                    return true;
                });

                if (amCandidates.length === 0) {
                    success = false;
                    break;
                }

                // Sort AM candidates by workload + slight randomness
                amCandidates.sort((a, b) => {
                    let scoreA = docWorkloads[a.id] * 10 + Math.random() * 2;
                    let scoreB = docWorkloads[b.id] * 10 + Math.random() * 2;
                    return scoreA - scoreB;
                });

                amDoc = amCandidates[0];
                tempSpecSchedule[`${d}_AM`] = amDoc.id;
                docWorkloads[amDoc.id]++;
            }

            // 2. Assign PM
            const lockedPmId = (state.lockedShifts[state.currentMonth] || {})[`${d}_PM`] 
                ? (state.specSchedule[state.currentMonth] || {})[`${d}_PM`] 
                : null;

            if (lockedPmId) {
                tempSpecSchedule[`${d}_PM`] = lockedPmId;
                if (docWorkloads[lockedPmId] !== undefined) docWorkloads[lockedPmId]++;
            } else {
                let pmCandidates = specQualifiedDocs.filter(doc => {
                    // Cannot be the same doctor as AM on the same day if possible
                    if (amDoc && doc.id === amDoc.id && specQualifiedDocs.length > 1) return false;
                    // Vacation check
                    if (doc.offDays && doc.offDays.includes(d)) return false;
                    // Weekday off PM check
                    if (doc.specOffWeekdays && doc.specOffWeekdays.PM && doc.specOffWeekdays.PM.includes(wd.num)) return false;
                    
                    // PM restriction: previous day duty check
                    const isDuty = (s) => s === 'C1' || s === 'C2';
                    if (d === 1) {
                        // Cross-month check
                        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                        if (doc.id === prevC1 || doc.id === prevC2) return false;
                    } else {
                        const prevShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d - 1}`] || 'O';
                        if (isDuty(prevShift)) return false;
                    }
                    return true;
                });

                // If pmCandidates is empty, fallback to allow same-day double assignment if needed
                if (pmCandidates.length === 0) {
                    pmCandidates = specQualifiedDocs.filter(doc => {
                        if (doc.offDays && doc.offDays.includes(d)) return false;
                        if (doc.specOffWeekdays && doc.specOffWeekdays.PM && doc.specOffWeekdays.PM.includes(wd.num)) return false;
                        
                        const isDuty = (s) => s === 'C1' || s === 'C2';
                        if (d === 1) {
                            const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                            const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                            if (doc.id === prevC1 || doc.id === prevC2) return false;
                        } else {
                            const prevShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d - 1}`] || 'O';
                            if (isDuty(prevShift)) return false;
                        }
                        return true;
                    });
                }

                if (pmCandidates.length === 0) {
                    success = false;
                    break;
                }

                // Sort PM candidates by workload + slight randomness
                pmCandidates.sort((a, b) => {
                    let scoreA = docWorkloads[a.id] * 10 + Math.random() * 2;
                    let scoreB = docWorkloads[b.id] * 10 + Math.random() * 2;
                    return scoreA - scoreB;
                });

                const pmDoc = pmCandidates[0];
                tempSpecSchedule[`${d}_PM`] = pmDoc.id;
                docWorkloads[pmDoc.id]++;
            }
        }

        let currentViolations = countTempSpecViolations(tempSpecSchedule, daysCount);

        if (success && currentViolations === 0) {
            state.specSchedule[state.currentMonth] = tempSpecSchedule;
            return true;
        }

        if (currentViolations < bestViolationCount) {
            bestViolationCount = currentViolations;
            bestSchedule = tempSpecSchedule;
        }
    }

    if (bestSchedule) {
        state.specSchedule[state.currentMonth] = bestSchedule;
    }
    return false;
}

// Count rule violations of a temporary Special Photography schedule
function countTempSpecViolations(tempSpecSchedule, daysCount) {
    let violations = 0;

    for (let d = 1; d <= daysCount; d++) {
        const wd = getWeekday(d);
        if (wd.num === 0) continue; // Sunday

        if (wd.num === 6) {
            // Saturday AM: Inherited Saturday Spec doctor
            const dayAssign = (state.saturdayAssignments[state.currentMonth] || {})[d] || {};
            const satSpecId = dayAssign.spec;
            if (!satSpecId) {
                violations += 10;
            } else {
                const doc = state.residents.find(r => r.id === satSpecId);
                if (doc) {
                    if (doc.satPositions && !doc.satPositions.includes('spec')) violations += 50;
                    if (doc.offDays && doc.offDays.includes(d)) violations += 100;
                    if (doc.specOffWeekdays && doc.specOffWeekdays.AM && doc.specOffWeekdays.AM.includes(6)) violations += 20;
                }
            }
        } else {
            // Monday to Friday
            const amDocId = tempSpecSchedule[`${d}_AM`];
            const pmDocId = tempSpecSchedule[`${d}_PM`];

            if (!amDocId) violations += 10;
            if (!pmDocId) violations += 10;

            if (amDocId && pmDocId && amDocId === pmDocId) {
                violations += 5;
            }

            if (amDocId) {
                const amDoc = state.residents.find(r => r.id === amDocId);
                if (amDoc) {
                    if (amDoc.satPositions && !amDoc.satPositions.includes('spec')) violations += 50;
                    if (amDoc.offDays && amDoc.offDays.includes(d)) violations += 100;
                    if (amDoc.specOffWeekdays && amDoc.specOffWeekdays.AM && amDoc.specOffWeekdays.AM.includes(wd.num)) violations += 20;
                }
            }

            if (pmDocId) {
                const pmDoc = state.residents.find(r => r.id === pmDocId);
                if (pmDoc) {
                    if (pmDoc.satPositions && !pmDoc.satPositions.includes('spec')) violations += 50;
                    if (pmDoc.offDays && pmDoc.offDays.includes(d)) violations += 100;
                    if (pmDoc.specOffWeekdays && pmDoc.specOffWeekdays.PM && pmDoc.specOffWeekdays.PM.includes(wd.num)) violations += 20;

                    // PM restriction: previous day duty check
                    const isDuty = (s) => s === 'C1' || s === 'C2';
                    if (d === 1) {
                        const prevC1 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C1;
                        const prevC2 = (state.lastMonthLastDayDuty[state.currentMonth] || {}).C2;
                        if (pmDoc.id === prevC1 || pmDoc.id === prevC2) {
                            violations += 80;
                        }
                    } else {
                        const prevShift = (state.schedule[state.currentMonth] || {})[`${pmDoc.id}_${d - 1}`] || 'O';
                        if (isDuty(prevShift)) {
                            violations += 80;
                        }
                    }
                }
            }
        }
    }

    return violations;
}

// Helper to find a valid assignment for a given Saturday day in a temporary schedule
function findSaturdayAssignment(day, tempSchedule) {
    const origAssign = (state.saturdayAssignments[state.currentMonth] || {})[day] || {};
    const lockedAngioId = (state.lockedShifts[state.currentMonth] || {})[`${day}_angio`] ? origAssign.angio : null;
    const lockedSpecId = (state.lockedShifts[state.currentMonth] || {})[`${day}_spec`] ? origAssign.spec : null;
    const lockedInjId = (state.lockedShifts[state.currentMonth] || {})[`${day}_inj`] ? origAssign.inj : null;

    // If all three Saturday roles are manually locked, return directly
    if (lockedAngioId && lockedSpecId && lockedInjId) {
        return { angio: lockedAngioId, spec: lockedSpecId, inj: lockedInjId };
    }

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

    const friCandidates = friDoctors.length > 0 ? friDoctors : state.residents;

    // Build a candidate pool ensuring we include satDoctors, locked doctors, and friCandidates
    const poolSet = new Set();
    satDoctors.forEach(doc => poolSet.add(doc));

    const lockedDocs = [];
    [lockedAngioId, lockedSpecId, lockedInjId].forEach(id => {
        if (id) {
            const doc = state.residents.find(r => r.id === id);
            if (doc) {
                lockedDocs.push(doc);
                poolSet.add(doc);
            }
        }
    });

    // If pool has less than 3 doctors, fill with Friday candidates
    let friIdx = 0;
    while (poolSet.size < 3 && friIdx < friCandidates.length) {
        poolSet.add(friCandidates[friIdx]);
        friIdx++;
    }

    // If still less than 3, fill with all available doctors
    let resIdx = 0;
    while (poolSet.size < 3 && resIdx < state.residents.length) {
        poolSet.add(state.residents[resIdx]);
        resIdx++;
    }

    const pool = Array.from(poolSet);
    if (pool.length < 3) return null;

    const validAssignments = [];

    // Permute 3 distinct doctors from the pool
    for (let i = 0; i < pool.length; i++) {
        for (let j = 0; j < pool.length; j++) {
            if (i === j) continue;
            for (let k = 0; k < pool.length; k++) {
                if (i === k || j === k) continue;

                const assign = {
                    angio: pool[i],
                    spec: pool[j],
                    inj: pool[k]
                };

                // 1. Qualification check
                const qAngio = assign.angio.satPositions ? assign.angio.satPositions.includes('angio') : true;
                const qSpec = assign.spec.satPositions ? assign.spec.satPositions.includes('spec') : true;
                const qInj = assign.inj.satPositions ? assign.inj.satPositions.includes('inj') : true;

                if (!qAngio || !qSpec || !qInj) continue;

                // 2. Lock constraint check
                if (lockedAngioId && assign.angio.id !== lockedAngioId) continue;
                if (lockedSpecId && assign.spec.id !== lockedSpecId) continue;
                if (lockedInjId && assign.inj.id !== lockedInjId) continue;

                // 3. Priority scoring based on original scheduling heuristics
                let score = 0;
                if (satDoctors.some(d => d.id === assign.angio.id)) score += 10;
                if (satDoctors.some(d => d.id === assign.spec.id)) score += 10;
                if (satDoctors.some(d => d.id === assign.inj.id)) score += 10;

                if (friCandidates.some(d => d.id === assign.angio.id)) score += 2;
                if (friCandidates.some(d => d.id === assign.spec.id)) score += 2;
                if (friCandidates.some(d => d.id === assign.inj.id)) score += 2;

                validAssignments.push({
                    assign: {
                        angio: assign.angio.id,
                        spec: assign.spec.id,
                        inj: assign.inj.id
                    },
                    score: score + Math.random() * 2 // slight randomness to break ties
                });
            }
        }
    }

    if (validAssignments.length === 0) return null;

    validAssignments.sort((a, b) => b.score - a.score);
    return validAssignments[0].assign;

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

            // Default to Off
            state.residents.forEach(doc => {
                tempSchedule[`${doc.id}_${d}`] = 'O';
            });

            // Find locked C1 & C2 doctor assignments for today
            const lockedC1Docs = state.residents.filter(doc => {
                const origShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`];
                return origShift === 'C1' && (state.lockedShifts[state.currentMonth] || {})[`${d}_C1`];
            });

            const lockedC2Docs = state.residents.filter(doc => {
                const origShift = (state.schedule[state.currentMonth] || {})[`${doc.id}_${d}`];
                return origShift === 'C2' && (state.lockedShifts[state.currentMonth] || {})[`${d}_C2`];
            });

            // Pre-assign locked duties and increment workloads
            lockedC1Docs.forEach(doc => {
                tempSchedule[`${doc.id}_${d}`] = 'C1';
                docStats[doc.id].totalShifts++;
                if (wd.isWeekend) {
                    docStats[doc.id].weekendDuties++;
                }
            });

            lockedC2Docs.forEach(doc => {
                tempSchedule[`${doc.id}_${d}`] = 'C2';
                docStats[doc.id].totalShifts++;
                if (wd.isWeekend) {
                    docStats[doc.id].weekendDuties++;
                }
            });

            // Prioritize remaining slots (Duty C2, then C1)
            let remainingC2 = Math.max(0, req.C2 - lockedC2Docs.length);
            let remainingC1 = Math.max(0, req.C1 - lockedC1Docs.length);

            let neededShifts = [];
            for (let i = 0; i < remainingC2; i++) neededShifts.push('C2');
            for (let i = 0; i < remainingC1; i++) neededShifts.push('C1');

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


// Update calendar full view UI (expand to show all days or constraint height)
function updateFullViewUI() {
    const card = document.getElementById('scheduler-card');
    const btn = document.getElementById('btn-toggle-full-view');
    if (!card || !btn) return;
    
    if (state.fullView) {
        card.classList.add('full-view');
        btn.innerHTML = `
            <svg style="width: 14px; height: 14px; fill: currentColor; margin-right: 6px;" viewBox="0 0 24 24">
                <path d="M4 19h6v2H2v-8h2v6zm16 0v-6h2v8h-8v-2h6zM4 5v6H2V3h8v2H4zm16 0h-6V3h8v8h-2V5z"/>
            </svg>
            <span>適應螢幕高度</span>
        `;
        btn.classList.add('active');
    } else {
        card.classList.remove('full-view');
        btn.innerHTML = `
            <svg style="width: 14px; height: 14px; fill: currentColor; margin-right: 6px;" viewBox="0 0 24 24">
                <path d="M10 21H4v-6H2v8h8v-2zm4 0h6v-6h2v8h-8v-2zM10 3H4v6H2V1h8v2zm4 0h6v6h2V1h-8v2z" transform="rotate(45, 12, 12)"/>
            </svg>
            <span>展開完整月曆</span>
        `;
        btn.classList.remove('active');
    }
}

// Initialize single day modal locks display
function initModalLocks(day) {
    const isLastMonth = (day === 'last-month');
    if (isLastMonth) {
        const lockButtons = document.querySelectorAll('#daily-editor-modal .btn-lock');
        lockButtons.forEach(btn => btn.style.display = 'none');
        return;
    }
    
    const wd = getWeekday(Number(day));
    const monthLocks = state.lockedShifts[state.currentMonth] || {};
    
    const lockConfigs = [
        { id: 'btn-lock-c1', key: `${day}_C1`, visible: state.activeTab === 'duty' },
        { id: 'btn-lock-c2', key: `${day}_C2`, visible: state.activeTab === 'duty' },
        { id: 'btn-lock-angio', key: `${day}_angio`, visible: state.activeTab === 'duty' && wd.num === 6 },
        { id: 'btn-lock-spec', key: `${day}_spec`, visible: state.activeTab === 'duty' && wd.num === 6 },
        { id: 'btn-lock-inj', key: `${day}_inj`, visible: state.activeTab === 'duty' && wd.num === 6 },
        { id: 'btn-lock-am', key: `${day}_AM`, visible: state.activeTab === 'spec' && wd.num !== 6 },
        { id: 'btn-lock-pm', key: `${day}_PM`, visible: state.activeTab === 'spec' && wd.num !== 6 }
    ];
    
    lockConfigs.forEach(cfg => {
        const btn = document.getElementById(cfg.id);
        if (!btn) return;
        
        if (!cfg.visible) {
            btn.style.display = 'none';
            return;
        }
        
        btn.style.display = 'flex';
        const isLocked = !!monthLocks[cfg.key];
        btn.dataset.locked = isLocked ? 'true' : 'false';
        btn.dataset.lockKey = cfg.key;
        
        updateModalLockVisual(btn);
    });
}

// Update single modal lock button visuals (color, icon, title)
function updateModalLockVisual(btn) {
    const isLocked = btn.dataset.locked === 'true';
    if (isLocked) {
        btn.innerHTML = `
            <svg style="width:16px; height:16px; fill:#eab308;" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
        `;
        btn.title = "已鎖定！自動排班時不會變動此指派。點擊解鎖";
    } else {
        btn.innerHTML = `
            <svg style="width:16px; height:16px; fill:currentColor; opacity:0.4;" viewBox="0 0 24 24">
                <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
            </svg>
        `;
        btn.title = "未鎖定。點擊鎖定此指派，防止自動排班修改";
    }
}

// Check if assigning a resident to a specific position on a specific day violates any scheduling rules
function checkAssignmentViolation(docId, day, position) {
    const violations = [];
    const doc = state.residents.find(r => r.id === docId);
    if (!doc) return violations;

    const wd = getWeekday(day);
    const month = state.currentMonth;

    // 1. Vacation / Leave Check (All positions)
    if (doc.offDays && doc.offDays.includes(day)) {
        violations.push("該日為醫師請假（休假）日");
    }

    // 2. Saturday Positions Qualification check (angio, spec, inj)
    if (position === 'angio' || position === 'spec' || position === 'inj') {
        const hasQual = doc.satPositions ? doc.satPositions.includes(position) : true;
        if (!hasQual) {
            const posNames = { angio: '血管攝影', spec: '特殊攝影', inj: '注射室' };
            violations.push(`該醫師無「${posNames[position]}」位置資格`);
        }
    }

    // 3. Duty Shifts specific rules (C1, C2)
    if (position === 'C1' || position === 'C2') {
        // A. Weekday off-duty settings
        if (state.rules.offWeekdays && doc.offWeekdays && doc.offWeekdays.includes(wd.num)) {
            violations.push(`週${['日', '一', '二', '三', '四', '五', '六'][wd.num]}為不值班星期`);
        }

        // B. Maximum duty limit
        if (state.rules.maxShifts) {
            let shiftCount = 0;
            for (let d = 1; d <= getDaysInMonth(); d++) {
                if (d === day) continue; // skip today (simulate replacing)
                const s = (state.schedule[month] || {})[`${docId}_${d}`];
                if (s === 'C1' || s === 'C2') {
                    shiftCount++;
                }
            }
            if (shiftCount >= doc.maxShifts) {
                violations.push(`值班天數達上限（上限 ${doc.maxShifts} 天）`);
            }
        }

        // C. Consecutive duty check
        if (state.rules.consecutiveDuty) {
            const isDuty = (s) => s === 'C1' || s === 'C2';
            
            // Check day - 1
            let prevDuty = false;
            if (day > 1) {
                const s = (state.schedule[month] || {})[`${docId}_${day - 1}`];
                if (isDuty(s)) prevDuty = true;
            } else {
                // Cross-month last day of last month
                const lastDuty = state.lastMonthLastDayDuty[month] || {};
                if (lastDuty.C1 === docId || lastDuty.C2 === docId) prevDuty = true;
            }

            // Check day + 1
            let nextDuty = false;
            if (day < getDaysInMonth()) {
                const s = (state.schedule[month] || {})[`${docId}_${day + 1}`];
                if (isDuty(s)) nextDuty = true;
            }

            if (prevDuty || nextDuty) {
                violations.push("違反「不得連續值班」之限制");
            }
        }

        // D. QOD (Avoid alternate day duty)
        if (state.rules.avoidQod) {
            const isDuty = (s) => s === 'C1' || s === 'C2';
            
            // Check day - 2
            let qodPrev = false;
            if (day > 2) {
                const s = (state.schedule[month] || {})[`${docId}_${day - 2}`];
                if (isDuty(s)) qodPrev = true;
            }
            // Check day + 2
            let qodNext = false;
            if (day < getDaysInMonth() - 1) {
                const s = (state.schedule[month] || {})[`${docId}_${day + 2}`];
                if (isDuty(s)) qodNext = true;
            }

            if (qodPrev || qodNext) {
                violations.push("違反「避開隔日值班」之限制");
            }
        }
    }

    // 4. Special Photography specific rules (AM, PM)
    if (position === 'AM' || position === 'PM') {
        // A. Weekday spec-off AM/PM setting
        if (position === 'AM') {
            if (doc.specOffWeekdays && doc.specOffWeekdays.AM && doc.specOffWeekdays.AM.includes(wd.num)) {
                violations.push(`週${['日', '一', '二', '三', '四', '五', '六'][wd.num]}為不排 AM 特攝日`);
            }
        } else {
            if (doc.specOffWeekdays && doc.specOffWeekdays.PM && doc.specOffWeekdays.PM.includes(wd.num)) {
                violations.push(`週${['日', '一', '二', '三', '四', '五', '六'][wd.num]}為不排 PM 特攝日`);
            }
        }

        // B. PM spec check: previous day duty check
        if (position === 'PM') {
            const isDuty = (s) => s === 'C1' || s === 'C2';
            let prevDuty = false;
            if (day === 1) {
                const lastDuty = state.lastMonthLastDayDuty[month] || {};
                if (lastDuty.C1 === docId || lastDuty.C2 === docId) prevDuty = true;
            } else {
                const s = (state.schedule[month] || {})[`${docId}_${day - 1}`];
                if (isDuty(s)) prevDuty = true;
            }
            if (prevDuty) {
                violations.push("前日值班者今日下午不得值特攝");
            }
        }

        // C. Double assignment check: AM and PM on the same weekday
        if (wd.num !== 6) {
            const otherPos = position === 'AM' ? 'PM' : 'AM';
            const otherDocId = (state.specSchedule[month] || {})[`${day}_${otherPos}`];
            if (otherDocId === docId) {
                violations.push("該日已被指派為另一特攝時段（雙值）");
            }
        }
    }

    return violations;
}

